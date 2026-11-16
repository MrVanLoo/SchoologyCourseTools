#!/usr/bin/env python3
"""
workbook_io.py: the one writer for the course workbook (see references/workbook-schema.md).

Used by make_template.py (blank template and example), by the tests, and on its
own to append a JSON spec to an existing workbook. (Exporting a cartridge to a
workbook is done in JavaScript by review_core.js, which fills rows into the
template this script writes, so both produce the same layout.)

    python3 workbook_io.py append SPEC.json WORKBOOK.xlsx

Needs openpyxl.
"""
import json
import os
import re
import sys

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
except ImportError:  # pragma: no cover
    sys.exit('ERROR: this script needs openpyxl. Install it with: pip install openpyxl')

FONT = 'Arial'
TYPES = ['Assignment', 'Page', 'Link', 'Discussion', 'File', 'Quiz']
QTYPES = ['Multiple choice', 'Select all', 'True/False', 'Short answer', 'Essay', 'Matching', 'Ordering']
SPEC_QTYPE = {'mc': 'Multiple choice', 'mr': 'Select all', 'tf': 'True/False', 'fib': 'Short answer',
              'essay': 'Essay', 'matching': 'Matching', 'ordering': 'Ordering'}
LETTERS = 'ABCDEFGH'
CELL_LIMIT = 32767  # Excel's hard limit on characters in one cell
VALIDATION_ROWS = 2000

COURSE_COLS = [
    # header, width, comment
    ('Unit', 22, 'Top-level folder. Repeat it on every row of the unit. Leave blank to put the item at the top level.'),
    ('Topic', 26, 'Folder inside the Unit. Repeat it on every row. Leave blank to put the item directly in the Unit.'),
    ('Type', 13, 'Assignment, Page, Link, Discussion, File, or Quiz. Pick from the list.'),
    ('Title', 36, 'Item name as it will show in Schoology. Required.'),
    ('URL', 34, 'Links only. Required for a Link. https:// is added if you leave it off.'),
    ('Description', 60, 'Assignment, Page, and Discussion. Instructions in plain text or Markdown '
                        '(**bold**, - bullets). Do not repeat the title. Do not paste images.'),
    ('Points', 9, 'Assignments only. A number. If blank, Schoology uses 100.'),
    ('Due', 14, 'Assignment, Discussion, Quiz. Not imported: printed on the after-import checklist.'),
    ('Category', 16, 'Grading category. Not imported: printed on the after-import checklist.'),
    ('Rubric', 22, 'Name of a rubric on the Rubrics tab. Not imported as a gradable rubric: '
                   'shown as a table and printed on the checklist.'),
    ('File', 26, 'File rows only. The file name of the attachment, for example handout.pdf.'),
]


def _rubric_cols(levels):
    cols = [('Rubric', 24, 'Rubric name. Repeat it on every row of that rubric. Use this name in the Rubric column of the Course tab.'),
            ('Criterion', 28, 'One criterion per row.'),
            ('Description', 36, 'Optional. What the criterion measures.')]
    for i in range(1, levels + 1):
        cols.append(('L%d Points' % i, 10, 'Points for level %d. Put the highest level first. Leave blank if the criterion has fewer levels.' % i if i == 1 else None))
        cols.append(('L%d Description' % i, 28, 'What work at this level looks like.' if i == 1 else None))
    return cols


def _question_cols(choices):
    cols = [('Quiz', 26, 'Must match the Title of a Quiz row on the Course tab exactly.'),
            ('Type', 16, 'Multiple choice, Select all, True/False, Short answer, Essay, Matching, Ordering. '
                         'Matching and Ordering cannot go in a cartridge: they are listed on the checklist instead.'),
            ('Question', 50, 'The question text.'),
            ('Answer', 16, 'Multiple choice: one letter (B). Select all: letters (A, C). True/False: True or False. '
                           'Short answer: accepted answers separated by | . Essay: leave blank.')]
    for i in range(choices):
        cols.append(('Choice %s' % LETTERS[i], 22, 'Answer choices for Multiple choice and Select all.' if i == 0 else None))
    return cols


README = [
    ('Course workbook', None),
    ('This workbook becomes a Schoology course folder. Build it with Course_Cartridge_Builder.html, then import the .imscc file in Schoology: Resources, Import, Common Cartridge.', None),
    ('', None),
    ('Tabs', 'h'),
    ('Course', 'One row per item, in the order you want them. Unit and Topic name the folders. Repeat them on every row.'),
    ('Rubrics', 'Optional. One row per criterion. Levels go left to right, highest points first.'),
    ('Questions', 'Optional. One row per quiz question. The Quiz column must match the Title of a Quiz row.'),
    ('Read me', 'This page.'),
    ('', None),
    ('Which columns each type uses', 'h'),
    ('Assignment', 'Title, Description, Points, Due, Category, Rubric'),
    ('Page', 'Title, Description'),
    ('Link', 'Title, URL'),
    ('Discussion', 'Title, Description, Due, Category, Rubric'),
    ('File', 'Title, File (the file name). Add the file itself when you build.'),
    ('Quiz', 'Title, Due, Category. The questions go on the Questions tab.'),
    ('', None),
    ('What does not import', 'h'),
    ('Due, Category, Rubric', 'A cartridge cannot carry these. They come out on the after-import checklist so you can set them in Schoology.'),
    ('Rubrics', 'Each rubric is added to the assignment description as a table students can read. To grade with it, type it into Schoology once using the checklist.'),
    ('Quiz points', 'Schoology sets every imported question to 1 point. Change them after import if you weight questions.'),
    ('Matching, Ordering', 'Common Cartridge has no such question type. They are left out and listed on the checklist.'),
    ('Images', 'Images pasted into a description end up in Unused Resources. Add them as File rows instead, or re-embed them after import.'),
    ('', None),
    ('Folders more than two levels deep', 'h'),
    ('Unit > Topic', 'You can write " > " inside Unit or Topic for deeper folders, for example "Part 1 > Project 1.1.5". You only need this for courses exported from Schoology.'),
]

HEAD_FILL = PatternFill('solid', fgColor='DCE3EA')


def _clean(v):
    """Make a value safe for a cell: strip control characters, respect Excel's size limit."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    v = ILLEGAL_CHARACTERS_RE.sub('', str(v))
    return v


def _num_or_text(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return v
    t = str(v).strip().replace(',', '')
    try:
        f = float(t)
        return int(f) if f.is_integer() else f
    except ValueError:
        return str(v)


def _setup_sheet(ws, cols, body_rows=0):
    ws.freeze_panes = 'A2'
    for i, (name, width, comment) in enumerate(cols, start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.font = Font(name=FONT, bold=True, size=11)
        c.fill = HEAD_FILL
        c.alignment = Alignment(vertical='top', wrap_text=True)
        if comment:
            cm = Comment(comment, 'Course workbook')
            cm.width, cm.height = 300, 110
            c.comment = cm
        ws.column_dimensions[get_column_letter(i)].width = width


def _write_rows(ws, cols, rows, warn):
    names = [c[0] for c in cols]
    wrap_cols = {'Description', 'Question', 'Title'} | {n for n in names if n.endswith('Description')}
    for r_i, row in enumerate(rows, start=2):
        lk = {str(k).lower(): v for k, v in row.items()}
        for c_i, name in enumerate(names, start=1):
            v = lk.get(name.lower())
            if name in ('Points',) or name.endswith(' Points'):
                v = _num_or_text(v)
            v = _clean(v)
            if isinstance(v, str) and len(v) > CELL_LIMIT:
                warn('%s row %d, %s: text is %d characters, over Excel\'s %d limit, so it was cut short. Check this item after building.'
                     % (ws.title, r_i, name, len(v), CELL_LIMIT))
                v = v[:CELL_LIMIT]
            if v == '':
                v = None
            cell = ws.cell(row=r_i, column=c_i, value=v)
            cell.font = Font(name=FONT, size=10)
            cell.alignment = Alignment(vertical='top', wrap_text=name in wrap_cols)


def _add_list_validation(ws, col_letter, values, prompt):
    dv = DataValidation(type='list', formula1='"%s"' % ','.join(values), allow_blank=True,
                        showErrorMessage=True, errorTitle='Not on the list',
                        error='Pick one of: ' + ', '.join(values))
    dv.promptTitle = 'Type'
    dv.prompt = prompt
    ws.add_data_validation(dv)
    dv.add('%s2:%s%d' % (col_letter, col_letter, VALIDATION_ROWS))


def _readme(ws):
    ws.column_dimensions['A'].width = 34
    ws.column_dimensions['B'].width = 100
    for i, (a, b) in enumerate(README, start=1):
        if b == 'h':
            c = ws.cell(row=i, column=1, value=a)
            c.font = Font(name=FONT, bold=True, size=12)
            continue
        if i == 1:
            c = ws.cell(row=i, column=1, value=a)
            c.font = Font(name=FONT, bold=True, size=14)
            continue
        ca = ws.cell(row=i, column=1, value=a or None)
        ca.font = Font(name=FONT, bold=bool(b), size=10)
        ca.alignment = Alignment(vertical='top', wrap_text=True)
        if b:
            cb = ws.cell(row=i, column=2, value=b)
            cb.font = Font(name=FONT, size=10)
            cb.alignment = Alignment(vertical='top', wrap_text=True)
        elif a and i == 2:
            ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=2)
            ca.font = Font(name=FONT, size=10)
            ws.row_dimensions[i].height = 30


def write_workbook(path, course_rows=(), rubric_rows=(), question_rows=(), levels=5, choices=6, warn=None):
    """Write the course workbook. Rows are dicts keyed by header name (case-insensitive)."""
    warn = warn or (lambda m: print('WARNING: ' + m, file=sys.stderr))
    # widen the level and choice columns when the data needs more
    for r in rubric_rows:
        for k in r:
            m = re.match(r'l(\d+) points$', str(k).lower())
            if m:
                levels = max(levels, int(m.group(1)))
    for r in question_rows:
        for k in r:
            m = re.match(r'choice ([a-h])$', str(k).lower())
            if m and r[k] not in (None, ''):
                choices = max(choices, LETTERS.index(m.group(1).upper()) + 1)

    wb = Workbook()
    ws = wb.active
    ws.title = 'Course'
    _setup_sheet(ws, COURSE_COLS)
    _write_rows(ws, COURSE_COLS, list(course_rows), warn)
    _add_list_validation(ws, 'C', TYPES, 'Pick the item type.')

    rc = _rubric_cols(levels)
    wr = wb.create_sheet('Rubrics')
    _setup_sheet(wr, rc)
    _write_rows(wr, rc, list(rubric_rows), warn)

    qc = _question_cols(choices)
    wq = wb.create_sheet('Questions')
    _setup_sheet(wq, qc)
    _write_rows(wq, qc, list(question_rows), warn)
    _add_list_validation(wq, 'B', QTYPES, 'Pick the question type.')

    _readme(wb.create_sheet('Read me'))
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    wb.save(path)
    return path


# ---------- JSON spec -> workbook rows ----------

def spec_course_rows(spec):
    rows = []
    for it in spec.get('items') or []:
        rows.append({
            'Unit': it.get('unit', ''), 'Topic': it.get('topic', ''), 'Type': it.get('type', ''),
            'Title': it.get('title', ''), 'URL': it.get('url', ''),
            'Description': it.get('description', it.get('instructions', '')),
            'Points': it.get('points'), 'Due': it.get('due', ''), 'Category': it.get('category', ''),
            'Rubric': it.get('rubric', ''), 'File': it.get('file', ''),
        })
    return rows


def spec_rubric_rows(spec):
    rows = []
    for rb in spec.get('rubrics') or []:
        for c in rb.get('criteria') or []:
            row = {'Rubric': rb.get('name', ''), 'Criterion': c.get('title', ''), 'Description': c.get('description', '')}
            for i, lv in enumerate(c.get('levels') or [], start=1):
                row['L%d Points' % i] = lv.get('points')
                row['L%d Description' % i] = lv.get('description', '')
            rows.append(row)
    return rows


def _letters(idx_list):
    out = []
    for c in idx_list or []:
        if isinstance(c, int) and 0 <= c < len(LETTERS):
            out.append(LETTERS[c])
        else:
            out.append(str(c).strip().upper())
    return ', '.join(out)


def spec_question_rows(spec):
    rows = []
    for qz in spec.get('quizzes') or []:
        for q in qz.get('questions') or []:
            t = str(q.get('type', '')).strip()
            human = SPEC_QTYPE.get(t.lower(), t)
            row = {'Quiz': qz.get('title', ''), 'Type': human, 'Question': q.get('prompt', '')}
            if human in ('Multiple choice', 'Select all'):
                row['Answer'] = _letters(q.get('correct'))
            elif human == 'True/False':
                a = str((q.get('answers') or [''])[0]).strip().lower()
                row['Answer'] = 'True' if a.startswith('t') else ('False' if a.startswith('f') else a)
            elif human == 'Short answer':
                row['Answer'] = ' | '.join(str(a) for a in q.get('answers') or [])
            for i, ch in enumerate(q.get('choices') or []):
                if i < len(LETTERS):
                    row['Choice %s' % LETTERS[i]] = ch
            rows.append(row)
    return rows


# ---------- append a spec to an existing workbook ----------

def _headers(ws):
    return {str(c.value).strip().lower(): c.column for c in ws[1] if c.value not in (None, '')}


def _sheet(wb, name):
    for n in wb.sheetnames:
        if n.strip().lower() == name.lower():
            return wb[n]
    return None


def _ensure_sheet(wb, name, cols):
    ws = _sheet(wb, name)
    if ws is not None:
        return ws
    readme = _sheet(wb, 'read me')
    idx = wb.sheetnames.index(readme.title) if readme is not None else len(wb.sheetnames)
    ws = wb.create_sheet(name, idx)
    _setup_sheet(ws, cols)
    return ws


def _append_rows(ws, rows, default_cols):
    heads = _headers(ws)
    if not heads:
        _setup_sheet(ws, default_cols)
        heads = _headers(ws)
    # find the last row with any value, so we never write into a gap
    last = 1
    for r in range(ws.max_row, 1, -1):
        if any(ws.cell(row=r, column=c).value not in (None, '') for c in heads.values()):
            last = r
            break
    for row in rows:
        last += 1
        for k, v in row.items():
            if v in (None, ''):
                continue
            col = heads.get(str(k).lower())
            if col is None:
                if str(k).lower() == 'description' and 'instructions' in heads:
                    col = heads['instructions']
                else:
                    col = ws.max_column + 1
                    hc = ws.cell(row=1, column=col, value=k)
                    hc.font = Font(name=FONT, bold=True, size=11)
                    hc.fill = HEAD_FILL
                    heads[str(k).lower()] = col
            if str(k).lower() == 'points' or str(k).lower().endswith(' points'):
                v = _num_or_text(v)
            v = _clean(v)
            if isinstance(v, str) and len(v) > CELL_LIMIT:
                print('WARNING: %s row %d, %s was cut to %d characters.' % (ws.title, last, k, CELL_LIMIT), file=sys.stderr)
                v = v[:CELL_LIMIT]
            cell = ws.cell(row=last, column=col, value=v)
            cell.font = Font(name=FONT, size=10)
            cell.alignment = Alignment(vertical='top', wrap_text=str(k).lower() in ('description', 'question', 'title'))
    return len(rows)


def _column_values(ws, header):
    heads = _headers(ws) if ws is not None else {}
    col = heads.get(header)
    if not col:
        return set()
    return {str(ws.cell(row=r, column=col).value).strip() for r in range(2, ws.max_row + 1)
            if ws.cell(row=r, column=col).value not in (None, '')}


def append_spec(spec_path, wb_path):
    with open(spec_path, encoding='utf-8') as fh:
        spec = json.load(fh)
    if not os.path.exists(wb_path):
        print('Workbook %s does not exist, so a new one was created from the spec.' % wb_path)
        write_workbook(wb_path, spec_course_rows(spec), spec_rubric_rows(spec), spec_question_rows(spec))
        return 0
    wb = load_workbook(wb_path)
    course = _sheet(wb, 'course') or wb.worksheets[0]

    errors = []
    have_rubrics = _column_values(_sheet(wb, 'rubrics'), 'rubric')
    have_quizzes = _column_values(_sheet(wb, 'questions'), 'quiz')
    for rb in spec.get('rubrics') or []:
        if str(rb.get('name', '')).strip() in have_rubrics:
            errors.append('The workbook already has a rubric named "%s". Rename it in the spec.' % rb.get('name'))
    for qz in spec.get('quizzes') or []:
        if str(qz.get('title', '')).strip() in have_quizzes:
            errors.append('The workbook already has questions for a quiz titled "%s". Rename it in the spec.' % qz.get('title'))
    if errors:
        for e in errors:
            print('ERROR: ' + e, file=sys.stderr)
        print('Nothing was changed.', file=sys.stderr)
        return 1

    n_items = _append_rows(course, spec_course_rows(spec), COURSE_COLS)
    n_rub = n_q = 0
    if spec.get('rubrics'):
        rr = spec_rubric_rows(spec)
        n_rub = _append_rows(_ensure_sheet(wb, 'Rubrics', _rubric_cols(5)), rr, _rubric_cols(5))
    if spec.get('quizzes'):
        qr = spec_question_rows(spec)
        n_q = _append_rows(_ensure_sheet(wb, 'Questions', _question_cols(6)), qr, _question_cols(6))
    wb.save(wb_path)
    print('Appended %d course rows, %d rubric rows, %d question rows to %s' % (n_items, n_rub, n_q, wb_path))
    print('Build it with cc_build.js to check for errors before importing.')
    return 0


def main(argv):
    if len(argv) == 4 and argv[1] == 'append':
        return append_spec(argv[2], argv[3])
    print('Usage: python3 workbook_io.py append SPEC.json WORKBOOK.xlsx', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
