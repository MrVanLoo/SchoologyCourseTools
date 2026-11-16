#!/usr/bin/env python3
"""
Acceptance tests 2-12 and 14 from HANDOFF.md section 9, plus a few extra checks.
Run by tests/run_all.sh. Prints one line per check and exits 1 if any fail.

    python3 tests/check_all.py OUTDIR
"""
import copy
import html
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SK = os.path.join(ROOT, 'skills', 'common-cartridge')
SCRIPTS = os.path.join(SK, 'scripts')
ASSETS = os.path.join(SK, 'assets')
sys.path.insert(0, SCRIPTS)
import make_template as mt  # noqa: E402
from workbook_io import write_workbook  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'out', 'check'))
os.makedirs(OUT, exist_ok=True)
PY = sys.executable
EXAMPLE_WB = os.path.join(ASSETS, 'Course_Workbook_Example.xlsx')
EXAMPLE_FILES = os.path.join(ASSETS, 'example_files')
TITLE = 'Example course'
FAILS = []


def check(ok, msg):
    print(('ok   ' if ok else 'FAIL ') + msg)
    if not ok:
        FAILS.append(msg)
    return ok


def section(name):
    print('\n== ' + name)


def build(inp, out, *extra):
    cmd = ['node', os.path.join(SCRIPTS, 'cc_build.js'), inp, '--out', out, '--no-inventory', '--manifest-id', 'M_test'] + list(extra)
    r = subprocess.run(cmd, capture_output=True, text=True, env=dict(os.environ, PYTHON=PY))
    return r.returncode, r.stdout + r.stderr


def review(*args):
    """Run the JavaScript review CLI (the same engine as Course_Reviewer.html)."""
    r = subprocess.run(['node', os.path.join(SCRIPTS, 'cc_review.js')] + list(args), capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def review_json(*args):
    r = subprocess.run(['node', os.path.join(SCRIPTS, 'cc_review.js')] + list(args) + ['--json'] * (args[0] in ('audit', 'diff', 'inventory')),
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def quiz_keys(imscc):
    keys = review_json('keys', imscc)
    return [q for k in keys for q in k['questions']]


def inventory(imscc):
    r = subprocess.run([PY, os.path.join(SCRIPTS, 'cc_inventory.py'), imscc, '--json',
                        '--extract-to', os.path.join(OUT, 'inv_' + os.path.basename(imscc))],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def inv_signature(d):
    """Tree with types, titles, points, URLs, question counts; resource ids dropped."""
    keep = ('type', 'depth', 'title', 'kind', 'points', 'url', 'questions', 'filename')
    return [{k: n.get(k) for k in keep if k in n} for n in d['tree']]


def course_rows(wb_path):
    wb = load_workbook(wb_path)
    out = {}
    for name in wb.sheetnames:
        ws = wb[name]
        heads = [str(c.value).strip() if c.value is not None else '' for c in ws[1]]
        rows = []
        for r in ws.iter_rows(min_row=2, values_only=True):
            if any(v not in (None, '') for v in r):
                rows.append({h: v for h, v in zip(heads, r) if h})
        out[name] = rows
    return out


def zip_texts(path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist() if not n.endswith('/')}


def manifest_resources(files):
    root = ET.fromstring(files['imsmanifest.xml'])
    res = {}
    for r in root.iter():
        if r.tag.split('}')[-1] == 'resource':
            res[r.get('identifier')] = r
    titles = {}
    for it in root.iter():
        if it.tag.split('}')[-1] == 'item' and it.get('identifierref'):
            t = [c for c in it if c.tag.split('}')[-1] == 'title'][0].text
            titles[it.get('identifierref')] = t
    return res, titles


# ---------------------------------------------------------------- 2
section('2. Templates and example build')
for f in ('Course_Workbook_Template.xlsx', 'Course_Workbook_Example.xlsx'):
    check(os.path.isfile(os.path.join(ASSETS, f)), 'make_template.py wrote ' + f)
tmpl = load_workbook(os.path.join(ASSETS, 'Course_Workbook_Template.xlsx'))
check(tmpl.sheetnames == ['Course', 'Rubrics', 'Questions', 'Read me'], 'template tabs are Course, Rubrics, Questions, Read me (Course first, Read me last)')
check(all(tmpl[s].max_row == 1 for s in ('Course', 'Rubrics', 'Questions')), 'template has headers and no example rows')
c = tmpl['Course']
check(c.freeze_panes == 'A2', 'template header row is frozen')
check(any('Assignment' in (dv.formula1 or '') for dv in c.data_validations.dataValidation), 'template Type column has a dropdown')
check(any('Multiple choice' in (dv.formula1 or '') for dv in tmpl['Questions'].data_validations.dataValidation), 'template question Type column has a dropdown')
check(all(c.cell(row=1, column=i).comment is not None for i in range(1, 12)), 'every Course header has a comment')
check(c['A1'].font.name == 'Arial' and tmpl['Read me']['A1'].font.name == 'Arial', 'template uses Arial')
rh = [x.value for x in tmpl['Rubrics'][1]]
check(rh[3:13] == sum([['L%d Points' % i, 'L%d Description' % i] for i in range(1, 6)], []), 'Rubrics tab ships five level pairs')

EX = os.path.join(OUT, 'example.imscc')
code, log = build(EXAMPLE_WB, EX, '--title', TITLE, '--files', EXAMPLE_FILES)
check(code == 0 and os.path.isfile(EX), 'example workbook builds with zero errors')
check('Errors' not in log, 'example build prints no errors')
ex_rows = course_rows(EXAMPLE_WB)
types_used = sorted(set(r['Type'] for r in ex_rows['Course']))
check(types_used == sorted(['Assignment', 'Page', 'Link', 'Discussion', 'File', 'Quiz']), 'example uses every item type')
check(len(set(r['Rubric'] for r in ex_rows['Rubrics'])) == 1, 'example has one rubric')
check(any(r['Type'] == 'Matching' for r in ex_rows['Questions']), 'example quiz includes a matching question')

# ---------------------------------------------------------------- 3
section('3. Example build structure')
files = zip_texts(EX)
bad_xml = []
for n, b in files.items():
    if n.endswith('.xml'):
        try:
            ET.fromstring(b)
        except ET.ParseError as e:
            bad_xml.append('%s: %s' % (n, e))
check(not bad_xml, 'every XML file parses' + ('' if not bad_xml else ': ' + '; '.join(bad_xml)))
inv = inventory(EX)
want = {}
for r in ex_rows['Course']:
    want[r['Type'].lower()] = want.get(r['Type'].lower(), 0) + 1
check(inv['counts'] == want, 'cc_inventory counts %s match workbook rows by type %s' % (inv['counts'], want))
res, titles = manifest_resources(files)
pts_by_title = {r['Title']: r.get('Points') for r in ex_rows['Course'] if r['Type'] == 'Assignment'}
n_assign = 0
for rid, r in res.items():
    if r.get('intendeduse') != 'assignment':
        continue
    n_assign += 1
    t = titles[rid]
    h = files[r.get('href')].decode('utf-8')
    check(h.startswith('<'), '"%s": file starts with <' % t)
    bad = [x for x in ('<html', '<head', '<body', '<!doctype') if x in h.lower()]
    check(not bad, '"%s": no %s' % (t, ', '.join(bad) or 'html/head/body/doctype'))
    check(t.lower() not in h.lower(), '"%s": the title does not appear in the file' % t)
    p = pts_by_title.get(t)
    if p is not None:
        exp = '<input name="sch-grade-item-max-points" type="hidden" value="%s">' % (int(p) if float(p).is_integer() else p)
        check(h.endswith(exp), '"%s": ends with the exact hidden points input (%s)' % (t, exp))
        check(h.count('sch-grade-item-max-points') == 1, '"%s": exactly one points input' % t)
    check(r.find('{http://www.imsglobal.org/xsd/imsccv1p2/imscp_v1p1}metadata') is not None, '"%s": resource keeps the empty <metadata/>' % t)
check(n_assign == 2, 'two assignments checked')
for rid, r in res.items():
    if r.get('type') == 'webcontent' and r.get('intendeduse') is None and r.get('href', '').endswith('index.html'):
        h = files[r.get('href')].decode('utf-8')
        check('sch-grade-item-max-points' not in h and titles[rid].lower() not in h.lower(), 'page "%s": no points input and no title in the file' % titles[rid])

# ---------------------------------------------------------------- 4
section('4. Quiz answer keys read back from the QTI')
LET = 'ABCDEFGH'
qtab = [r for r in ex_rows['Questions'] if r['Type'] not in ('Matching', 'Ordering')]
qti_name = [n for n in files if n.endswith('assessment_qti.xml')][0]
qs = quiz_keys(EX)
check(len(qs) == len(qtab), 'QTI has %d questions, Questions tab has %d (not counting matching)' % (len(qs), len(qtab)))
HUM = {'Multiple choice': 'mc', 'Select all': 'mr', 'True/False': 'tf', 'Short answer': 'fib', 'Essay': 'essay'}
for i, (row, q) in enumerate(zip(qtab, qs), 1):
    t = HUM[row['Type']]
    exp_choices = [row.get('Choice %s' % L) for L in LET[:6] if row.get('Choice %s' % L)]
    ok = q['type'] == t and q['prompt'] == row['Question']
    if t in ('mc', 'mr'):
        got = ', '.join(LET[j] for j in q['correct'])
        ok = ok and q['choices'] == exp_choices and got == ', '.join(x.strip() for x in str(row['Answer']).split(','))
    elif t == 'tf':
        ok = ok and q['answers'] == [str(row['Answer']).strip().lower()]
    elif t == 'fib':
        ok = ok and q['answers'] == [a.strip() for a in str(row['Answer']).split('|')]
    check(ok, 'question %d (%s): type, prompt, choices, and answer match the Questions tab' % (i, row['Type']))

# live test C spec too, since it is the one with fib and essay
spec_c = json.load(open(os.path.join(ROOT, 'tests', 'live', 'spec_C_quiz_types.json')))
CC = os.path.join(OUT, 'test_c.imscc')
code, log = build(os.path.join(ROOT, 'tests', 'live', 'spec_C_quiz_types.json'), CC)
check(code == 0, 'live test C spec builds')
fc = zip_texts(CC)
got = [(q['type'], q['prompt'], q.get('correct', []), q.get('answers', [])) for q in quiz_keys(CC)]
exp = [(q['type'], q['prompt'], q.get('correct', []), q.get('answers', [])) for q in spec_c['quizzes'][0]['questions']]
check(got == exp, 'live test C answer keys read back equal the spec')
fib_xml = fc[[n for n in fc if 'assessment' in n][0]].decode()
check(fib_xml.count('case="No"') == 3, 'short answer: one condition per accepted answer (3)')

# ---------------------------------------------------------------- 5
section('5. Matching question left out of the QTI, listed on the checklist')
mprompt = [r['Question'] for r in ex_rows['Questions'] if r['Type'] == 'Matching'][0]
qti_text = html.unescape(html.unescape(files[qti_name].decode('utf-8')))
check(mprompt not in qti_text, 'matching prompt is absent from the QTI')
check('cc.matching' not in qti_text and 'matching' not in qti_text.lower(), 'no faked matching item in the QTI')
cl = open(os.path.join(OUT, 'example_After_Import.html'), encoding='utf-8').read()
check(html.escape(mprompt, quote=True) in cl or mprompt in cl, 'matching prompt is on the checklist')
check('Questions left out' in cl and 'Rubrics to enter' in cl, 'checklist has the left-out and rubric sections')
check('1 point' in cl, 'checklist says imported questions are 1 point each')

# ---------------------------------------------------------------- 6
section('6. Error cases: named row, exit 1, no output')
base = {'Course': copy.deepcopy(mt.EXAMPLE_COURSE), 'Rubrics': copy.deepcopy(mt.EXAMPLE_RUBRIC), 'Questions': copy.deepcopy(mt.EXAMPLE_QUESTIONS)}


def idx(title):
    return [i for i, r in enumerate(base['Course']) if r['Title'] == title][0]


def case(name, mutate, expect, with_files=True):
    d = copy.deepcopy(base)
    mutate(d)
    wbp = os.path.join(OUT, 'err_%s.xlsx' % name)
    write_workbook(wbp, d['Course'], d['Rubrics'], d['Questions'])
    outp = os.path.join(OUT, 'err_%s.imscc' % name)
    extra = ['--files', EXAMPLE_FILES] if with_files else []
    code, log = build(wbp, outp, *extra)
    ok = code == 1 and not os.path.exists(outp) and not os.path.exists(outp.replace('.imscc', '_After_Import.html'))
    named = re.search(expect, log) is not None
    check(ok and named, '%s: exit 1, no files, message names %s' % (name, expect.replace('\\', '')))
    if not (ok and named):
        print('     ' + log.replace('\n', '\n     '))


i_link, i_asg, i_file, i_quiz, i_bridge = idx('Truss (Wikipedia)'), idx('Activity 2.1.1 Method of Joints'), idx('Truss worksheet'), idx('Lesson 2.1 check for understanding'), idx('Project 2.2.1 Balsa Bridge')
case('unknown_type', lambda d: d['Course'][i_link].update(Type='Lesson'), r'Row %d\b.*Type "Lesson"' % (i_link + 2))
case('link_no_url', lambda d: d['Course'][i_link].update(URL=''), r'Row %d \(Truss \(Wikipedia\)\): a Link needs a URL' % (i_link + 2))
case('points_not_number', lambda d: d['Course'][i_asg].update(Points='twelve'), r'Row %d \(Activity 2\.1\.1.*Points "twelve" is not a number' % (i_asg + 2))
case('rubric_missing', lambda d: d['Course'][i_bridge].update(Rubric='No such rubric'), r'Row %d \(Project 2\.2\.1.*"No such rubric" is not on the Rubrics tab' % (i_bridge + 2))
case('file_missing', lambda d: None, r'Row %d \(Truss worksheet\): the file "Truss_Worksheet\.pdf" was not provided' % (i_file + 2), with_files=False)
case('quiz_no_questions', lambda d: d.update(Questions=[]), r'Row %d \(Lesson 2\.1 check.*no questions' % (i_quiz + 2))
case('mc_two_letters', lambda d: d['Questions'][0].update(Answer='A, B'), r'Questions row 2: Multiple choice takes one answer')

# same checks reach the JSON spec path
spec_bad = {'title': 'Bad', 'items': [{'type': 'Quiz', 'title': 'Q'}, {'type': 'Assignment', 'title': 'A', 'points': 5, 'rubric': 'R'}],
            'rubrics': [{'name': 'R', 'criteria': [{'title': 'C', 'levels': [{'points': 'abc'}]}]}],
            'quizzes': [{'title': 'Q', 'questions': [
                {'type': 'mc', 'prompt': 'p', 'choices': ['a', 'b'], 'correct': [5]},
                {'type': 'mc', 'prompt': 'p', 'choices': ['a', 'b'], 'correct': [0, 1]},
                {'type': 'xyz', 'prompt': 'p'},
                {'type': 'tf', 'prompt': 'p', 'answers': ['maybe']},
                {'type': 'fib', 'prompt': 'p', 'answers': []}]},
                {'title': 'Orphan', 'questions': [{'type': 'essay', 'prompt': 'p'}]}]}
sp = os.path.join(OUT, 'spec_bad.json')
json.dump(spec_bad, open(sp, 'w'))
code, log = build(sp, os.path.join(OUT, 'spec_bad.imscc'))
for pat in (r'question 1: the answer', r'question 2: Multiple choice takes one answer', r'question 3: question type "xyz"',
            r'question 4: True/False', r'question 5: Short answer', r'criterion 1: a level has points that are not a number',
            r'"Orphan" does not match the Title of any Quiz row'):
    check(code == 1 and re.search(pat, log) is not None, 'spec path reports: ' + pat.replace('\\', ''))
check('TypeError' not in log and 'at ' not in log.split('Errors')[0], 'spec path errors are messages, not a crash')

# ---------------------------------------------------------------- 7
section('7. Round trip: workbook -> cartridge -> workbook -> cartridge')
RT_WB = os.path.join(OUT, 'roundtrip.xlsx')
RT_FILES = os.path.join(OUT, 'roundtrip_files')
code, log = review('workbook', EX, '-o', RT_WB, '--files-dir', RT_FILES)
check(code == 0, 'cc_review.js workbook runs')
check('levels deep' in log and 'nesting was not needed' in log, 'workbook export prints depth and nesting')
RT = os.path.join(OUT, 'roundtrip.imscc')
code, log = build(RT_WB, RT, '--title', TITLE, '--files', RT_FILES)
check(code == 0, 'exported workbook builds with zero errors')
check(inv_signature(inventory(EX)) == inv_signature(inventory(RT)), 'inventories match (tree, types, titles, points, URLs, question counts)')
f1, f2 = zip_texts(EX), zip_texts(RT)
res1, _ = manifest_resources(f1)
file_hrefs = [r.get('href') for r in res1.values() if r.get('type') == 'webcontent' and not r.get('href', '').endswith('.html')]
check(file_hrefs and all(f1[h] == f2.get(h) for h in file_hrefs), 'File row bytes are identical (%s)' % ', '.join(file_hrefs))
same = sorted(f1) == sorted(f2) and all(f1[n] == f2[n] for n in f1)
check(same, 'every file in the two cartridges is byte-identical (manifest id fixed for the test)')
rtq = course_rows(RT_WB)
check(len(rtq['Questions']) == 5 and not rtq['Rubrics'], 'exported workbook: 5 questions, empty Rubrics tab')

# ---------------------------------------------------------------- 8
section('8. Three-level (and four-level) course keeps its depth')
deep_rows = [
    {'Unit': 'Unit 1', 'Topic': 'Part 1 > Project 1.1.5', 'Type': 'Assignment', 'Title': 'Build the arm', 'Description': 'Build it.', 'Points': 10},
    {'Unit': 'Unit 1', 'Topic': 'Part 1', 'Type': 'Page', 'Title': 'Part 1 intro', 'Description': 'Intro.'},
    {'Unit': 'Unit 1', 'Topic': 'Part 1 > Project 1.1.5', 'Type': 'Link', 'Title': 'Arm reference', 'URL': 'https://example.org/arm'},
    {'Unit': 'Unit 1', 'Topic': 'Part 2 > Project 1.2.1 > Step A', 'Type': 'Page', 'Title': 'Step A notes', 'Description': 'Four levels.'},
    {'Unit': 'Unit 2', 'Topic': '', 'Type': 'Page', 'Title': 'Unit 2 intro', 'Description': 'One level.'},
    {'Unit': '', 'Topic': '', 'Type': 'Page', 'Title': 'Course welcome', 'Description': 'Top level.'},
]
DW = os.path.join(OUT, 'deep.xlsx')
write_workbook(DW, deep_rows)
D1 = os.path.join(OUT, 'deep.imscc')
code, log = build(DW, D1, '--title', 'Deep')
check(code == 0, 'deep workbook builds')
inv1 = inventory(D1)
depths = {n['title']: n['depth'] for n in inv1['tree']}
check(depths.get('Build the arm') == 3 and depths.get('Step A notes') == 4 and depths.get('Course welcome') == 0,
      'items sit 3 and 4 folders deep, and at the top level')
DW2 = os.path.join(OUT, 'deep_rt.xlsx')
code, log = review('workbook', D1, '-o', DW2)
check(code == 0 and '4 levels deep' in log and '" > "' in log and 'not needed' not in log, 'export reports 4 levels and that " > " nesting was used')
topics = [r.get('Topic') for r in course_rows(DW2)['Course']]
check('Part 1 > Project 1.1.5' in topics and 'Part 2 > Project 1.2.1 > Step A' in topics, 'exported Topic column uses " > "')
D2 = os.path.join(OUT, 'deep_rt.imscc')
code, log = build(DW2, D2, '--title', 'Deep')
check(code == 0 and inv_signature(inv1) == inv_signature(inventory(D2)), 'deep course round-trips with depth intact')

# ---------------------------------------------------------------- 9
section('9. Audit of a synthetic Schoology-style export')
FAKE = os.path.join(OUT, 'fake_schoology_export.imscc')
subprocess.run([PY, os.path.join(ROOT, 'tests', 'make_fake_export.py'), FAKE], check=True, capture_output=True)
F = review_json('audit', FAKE)
cats = {}
for f in F:
    cats.setdefault(f['category'], []).append((f['where'], f['detail']))


def has(cat, needle, path='Unit 1: Energy / Lesson 1.1'):
    return any(needle in d and (path is None or p == path) for p, d in cats.get(cat, []))


check(has('Dropped video and embed content', 'Energy transfer video'), 'audit: empty resource directory under a video title')
check(has('Duplicate resource identifiers', 'ccres0000002'), 'audit: duplicate resource identifier')
check(has('Absolute href paths', '/var/www/html/sgy_pkg'), 'audit: absolute href')
check(has('Assignments with no points', 'Activity 1.1.1 No Points'), 'audit: assignment with no points input')
check(has('Duplicate titles in one folder', 'Notes'), 'audit: two same-titled items in one folder')
check(has('Empty folders', 'Lesson 1.2 (empty)', 'Unit 1: Energy'), 'audit: empty folder, with its parent path')
check(has("Assignments at 100 points (Schoology's default)", 'Big project'), 'audit extra: assignment at the default 100')
check(has('Items with an empty description', 'Blank page'), 'audit extra: empty description')
check(has('Links with a malformed URL', 'htp//example com/bad'), 'audit extra: malformed URL')
check(has('Descriptions containing an image', 'Diagram page'), 'audit extra: <img in a description')
check(len(cats.get('Duplicate titles in one folder', [])) == 1 and len(cats.get('Empty folders', [])) == 1, 'audit: no double counting')
code, log = review('audit', FAKE, '-o', os.path.join(OUT, 'fake_audit.md'))
md = open(os.path.join(OUT, 'fake_audit.md'), encoding='utf-8').read()
check(code == 0 and '## Empty folders (1)' in md and '| Check | Count |' in md, 'audit Markdown groups findings by type with counts')
code, log = review('workbook', FAKE, '-o', os.path.join(OUT, 'fake.xlsx'))
check(code == 0 and 'need a URL' in log, 'workbook export of the fake export flags rows that need a URL')
code, log = build(os.path.join(OUT, 'fake.xlsx'), os.path.join(OUT, 'fake_rebuild.imscc'))
check(code == 1 and 'a Link needs a URL' in log, 'the builder blocks those rows until a URL is added')

# ---------------------------------------------------------------- 10
section('10. Outline matches the checked-in expected file')
OL = os.path.join(OUT, 'example_outline.md')
code, log = review('outline', EX, '-o', OL)
exp_path = os.path.join(ROOT, 'tests', 'expected', 'example_outline.md')
got_o = open(OL, encoding='utf-8').read()
check(os.path.isfile(exp_path) and got_o == open(exp_path, encoding='utf-8').read(), 'outline equals tests/expected/example_outline.md')

# ---------------------------------------------------------------- 11
section('11. Diff reports exactly one removal, one retitle, one points change')
d = copy.deepcopy(base)
d['Course'] = [r for r in d['Course'] if r['Title'] != 'Unit 2 vocabulary']
for r in d['Course']:
    if r['Title'] == 'Design tradeoffs':
        r['Title'] = 'Design tradeoffs discussion'
    if r['Title'] == 'Activity 2.1.1 Method of Joints':
        r['Points'] = 15
MW = os.path.join(OUT, 'modified.xlsx')
write_workbook(MW, d['Course'], d['Rubrics'], d['Questions'])
MOD = os.path.join(OUT, 'modified.imscc')
code, log = build(MW, MOD, '--title', TITLE, '--files', EXAMPLE_FILES)
check(code == 0, 'modified copy builds')
dd = review_json('diff', EX, MOD)
check(len(dd['removed']) == 1 and dd['removed'][0]['title'] == 'Unit 2 vocabulary', 'removed: Unit 2 vocabulary')
check(len(dd['renamed']) == 1 and dd['renamed'][0]['to'] == 'Design tradeoffs discussion', 'renamed: Design tradeoffs')
check(len(dd['changed']) == 1 and dd['changed'][0]['changes'] == ['points 12 → 15'], 'changed: points 12 to 15 on Activity 2.1.1')
check(not dd['added'] and not dd['moved'], 'nothing else reported')
code, log = review('diff', EX, MOD, '-o', os.path.join(OUT, 'diff.md'))
dmd = open(os.path.join(OUT, 'diff.md'), encoding='utf-8').read()
check(code == 0 and '3 differences' in dmd, 'diff Markdown says 3 differences')

# ---------------------------------------------------------------- 12
section('12. Syllabus skeleton')
SY = os.path.join(OUT, 'syllabus.md')
code, log = review('syllabus', EX, '-o', SY)
sy = open(SY, encoding='utf-8').read()
units = sorted(set(r['Unit'] for r in ex_rows['Course'] if r['Unit']))
check(all(u in sy for u in units), 'syllabus names every unit: ' + ', '.join(units))
m = re.search(r'\| \*\*Total\*\* \| \*\*(\d+)\*\* \| \*\*([\d.]+)\*\* \|', sy)
total = sum(float(r['Points']) for r in ex_rows['Course'] if r['Type'] == 'Assignment' and r.get('Points') is not None)
check(m is not None and float(m.group(2)) == total, 'points table total %s equals the sum of assignment points %s' % (m.group(2) if m else None, total))
check(all(k in sy.lower() for k in ('## course description', '## grading policy', '## grading categories', '## due dates', '## materials', '## contact')) and sy.count('[TO FILL IN') >= 6,
      'marked blanks for description, grading policy, categories, due dates, materials, contact')
code, log = review('syllabus', D1, '-o', os.path.join(OUT, 'deep_syllabus.md'))
check(code == 0, 'syllabus runs on the deep course')

# ---------------------------------------------------------------- extras
section('Extra checks')
NT = os.path.join(OUT, 'no_table.imscc')
code, log = build(EXAMPLE_WB, NT, '--title', TITLE, '--files', EXAMPLE_FILES, '--no-rubric-table')
ft = zip_texts(NT)
check(code == 0 and not any(b'<table' in v for k, v in ft.items() if k.endswith('.html')), '--no-rubric-table leaves the table out')
check('Rubrics to enter' in open(NT.replace('.imscc', '_After_Import.html'), encoding='utf-8').read(), '... and the checklist still has the rubric entry sheet')
AW = os.path.join(OUT, 'append.xlsx')
shutil.copyfile(os.path.join(ASSETS, 'Course_Workbook_Template.xlsx'), AW)
spec_a = os.path.join(ROOT, 'tests', 'live', 'spec_A_assignment_with_rubric_table.json')
r1 = subprocess.run([PY, os.path.join(SCRIPTS, 'workbook_io.py'), 'append', spec_a, AW], capture_output=True, text=True)
code, log = build(AW, os.path.join(OUT, 'append.imscc'), '--title', 'Appended')
check(r1.returncode == 0 and code == 0, 'workbook_io.py append writes a workbook that builds')
before = open(AW, 'rb').read()
r2 = subprocess.run([PY, os.path.join(SCRIPTS, 'workbook_io.py'), 'append', spec_a, AW], capture_output=True, text=True)
check(r2.returncode == 1 and 'already has a rubric' in r2.stderr and open(AW, 'rb').read() == before, 'appending the same rubric twice is refused and the workbook is untouched')
aw = load_workbook(AW)
check(aw.sheetnames[-1] == 'Read me', 'Read me stays the last tab after append')
img_spec = os.path.join(OUT, 'img.json')
json.dump({'items': [{'type': 'Page', 'title': 'P', 'description': 'See ![diagram](diagram.png)'},
                     {'type': 'Assignment', 'title': 'Heading test', 'description': '# Heading test\n\nDo it.', 'points': 3},
                     {'type': 'Link', 'title': 'L', 'url': 'example.org:8080/x'}]}, open(img_spec, 'w'))
code, log = build(img_spec, os.path.join(OUT, 'img.imscc'))
check(code == 0 and 'has an image' in log, 'a Markdown image in a description gives the image warning')
check('starts with the title' in log, 'a description that repeats the title gives a warning')
fi = zip_texts(os.path.join(OUT, 'img.imscc'))
check(any(b'https://example.org:8080/x' in v for k, v in fi.items() if k.endswith('weblink.xml')), 'a URL like example.org:8080/x gets https:// added')
for name in ('Test_A_assignment_with_rubric_table.imscc', 'Test_B_all_item_types.imscc', 'Test_C_quiz_types.imscc'):
    p = os.path.join(ROOT, 'dist', 'live-tests', name)
    ok = os.path.isfile(p)
    if ok:
        iv = inventory(p)
        ok = sum(iv['counts'].values()) > 0
    check(ok, 'live test %s exists and inventories' % name)
tb = inventory(os.path.join(ROOT, 'dist', 'live-tests', 'Test_B_all_item_types.imscc'))
check(max(n['depth'] for n in tb['tree']) >= 2 and set(tb['counts']) >= {'page', 'link', 'discussion', 'file'}, 'test B has page, link, discussion, file, three levels deep')
ta = zip_texts(os.path.join(ROOT, 'dist', 'live-tests', 'Test_A_assignment_with_rubric_table.imscc'))
ah = [v.decode() for k, v in ta.items() if k.endswith('index.html')][0]
check(ah.count('<tr>') == 4 and ah.endswith('value="20">'), 'test A: 20 points and a 3-criterion rubric table')
with zipfile.ZipFile(os.path.join(ROOT, 'dist', 'live-tests', 'Test_D_qti21_matching.zip')) as z:
    names = z.namelist()
    ok = {'imsmanifest.xml', 'item_choice.xml', 'item_match.xml'} <= set(names)
    ok = ok and b'matchInteraction' in z.read('item_match.xml') and b'choiceInteraction' in z.read('item_choice.xml')
    for n in names:
        ET.fromstring(z.read(n))
check(ok, 'test D: QTI 2.1 package with a choiceInteraction and a matchInteraction, all XML well-formed')
check(os.path.isfile(os.path.join(ROOT, 'dist', 'live-tests', 'README.md')), 'live test README is present')

# ---------------------------------------------------------------- parity
section('JavaScript review engine matches cc_inventory.py')
for name in ('example.imscc', 'deep.imscc', 'fake_schoology_export.imscc', 'roundtrip.imscc', 'modified.imscc'):
    p = os.path.join(OUT, name)
    check(review_json('inventory', p) == inventory(p), 'inventory of %s: JavaScript output equals cc_inventory.py --json' % name)
for name in ('Test_A_assignment_with_rubric_table.imscc', 'Test_B_all_item_types.imscc', 'Test_C_quiz_types.imscc'):
    p = os.path.join(ROOT, 'dist', 'live-tests', name)
    check(review_json('inventory', p) == inventory(p), 'inventory of %s: JavaScript output equals cc_inventory.py --json' % name)
rw = load_workbook(RT_WB)
rc = rw['Course']
check(rw.sheetnames == ['Course', 'Rubrics', 'Questions', 'Read me'] and rc.freeze_panes == 'A2' and
      any('Assignment' in (dv.formula1 or '') for dv in rc.data_validations.dataValidation) and rc['A1'].comment is not None,
      'exported workbook keeps the template tabs, frozen header, dropdown, and header comments')
check(rc['F2'].font.name == 'Arial' and rc['F2'].alignment.wrap_text, 'exported workbook body cells are Arial, descriptions wrap')
code, log = review('inventory', EX)
check(code == 0 and 'CONTENT INVENTORY' in log and 'COURSE TREE' in log, 'cc_review.js inventory prints the text map')
code, log = review('outline', os.path.join(OUT, 'nope.imscc'))
check(code == 1 and 'not found' in log, 'a missing file is a clear error, not a crash')
bad = os.path.join(OUT, 'not_a_cartridge.imscc')
with zipfile.ZipFile(bad, 'w') as z:
    z.writestr('hello.txt', 'hi')
code, log = review('outline', bad)
check(code == 1 and 'not a Common Cartridge' in log, 'a ZIP with no manifest is reported as not a Common Cartridge')

# ---------------------------------------------------------------- 14
section('14. Packaged skills')


def frontmatter(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not m:
        return None
    fm = {}
    for line in m.group(1).split('\n'):
        mm = re.match(r'^([A-Za-z_-]+):\s*(.*)$', line)
        if not mm:
            return None  # only simple one-line keys are allowed
        v = mm.group(2).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
            v = json.loads(v) if v[0] == '"' else v[1:-1]
        fm[mm.group(1)] = v
    return fm


for s in ('common-cartridge', 'schoology-assignment', 'schoology-course-review'):
    p = os.path.join(ROOT, 'dist', s + '.skill')
    if not check(os.path.isfile(p), '%s.skill exists' % s):
        continue
    with zipfile.ZipFile(p) as z:
        names = z.namelist()
        tops = {n.split('/')[0] for n in names}
        skills_md = [n for n in names if n.endswith('SKILL.md')]
        check(tops == {s}, '%s.skill unzips to one folder named %s' % (s, s))
        check(skills_md == [s + '/SKILL.md'], '%s.skill has exactly one SKILL.md, at the folder root' % s)
        if s + '/SKILL.md' not in names:
            continue
        text = z.read(s + '/SKILL.md').decode('utf-8')
        fm = frontmatter(text)
        check(fm is not None and set(fm) <= {'name', 'description', 'compatibility'} and {'name', 'description'} <= set(fm),
              '%s: frontmatter has only name, description, compatibility' % s)
        if fm:
            check(fm['name'] == s and re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', fm['name']) is not None, '%s: name is kebab-case and equals the folder' % s)
            check(0 < len(fm['description']) <= 1024, '%s: description is %d characters (max 1024)' % (s, len(fm['description'])))
        body_lines = text.count('\n')
        check(body_lines <= 330, '%s: SKILL.md is %d lines' % (s, body_lines))
        check(not any('__pycache__' in n or '.DS_Store' in n for n in names), '%s: no cache or .DS_Store files' % s)

print()
if FAILS:
    print('%d check(s) failed:' % len(FAILS))
    for f in FAILS:
        print('  - ' + f)
    sys.exit(1)
print('all checks passed')
