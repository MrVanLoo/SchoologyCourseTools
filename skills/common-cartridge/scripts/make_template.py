#!/usr/bin/env python3
"""
make_template.py: writes the blank course workbook, the example workbook, and the
example attachment the example's File row points at.

    python3 make_template.py [ASSETS_DIR]

ASSETS_DIR defaults to ../assets next to this script.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from workbook_io import write_workbook  # noqa: E402


def make_pdf(path, lines, title='Document'):
    """Write a small, valid one-page PDF with plain text lines (Helvetica)."""
    def pdf_str(t):
        return '(' + t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ')'
    y = 740
    ops = ['BT', '/F1 18 Tf', '72 %d Td' % y, pdf_str(title) + ' Tj', '/F1 11 Tf']
    first = True
    for ln in lines:
        ops.append(('0 -30 Td' if first else '0 -16 Td'))
        first = False
        ops.append(pdf_str(ln) + ' Tj')
    ops.append('ET')
    stream = '\n'.join(ops).encode('latin-1')
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
    ]
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
    for off in offsets:
        out += b'%010d 00000 n \n' % off
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(bytes(out))
    return path


U = 'Unit 2: Structures'
L1 = 'Lesson 2.1 Forces in Trusses'
P2 = 'Project 2.2 Bridge Design'

EXAMPLE_COURSE = [
    {'Unit': U, 'Topic': '', 'Type': 'Page', 'Title': 'Unit 2 vocabulary',
     'Description': '**Key terms for this unit**\n\n- **Tension**: a force that pulls a member apart.\n- **Compression**: a force that pushes a member together.\n- **Static equilibrium**: all forces and moments add up to zero.'},
    {'Unit': U, 'Topic': L1, 'Type': 'Page', 'Title': 'Lesson 2.1 overview',
     'Description': 'In this lesson you will find the force in each member of a simple truss.\n\nBy the end you should be able to:\n\n1. Draw a free body diagram of a joint.\n2. Use the method of joints to solve for member forces.\n3. Say whether each member is in tension or compression.'},
    {'Unit': U, 'Topic': L1, 'Type': 'Link', 'Title': 'Truss (Wikipedia)', 'URL': 'en.wikipedia.org/wiki/Truss'},
    {'Unit': U, 'Topic': L1, 'Type': 'File', 'Title': 'Truss worksheet', 'File': 'Truss_Worksheet.pdf'},
    {'Unit': U, 'Topic': L1, 'Type': 'Assignment', 'Title': 'Activity 2.1.1 Method of Joints',
     'Description': 'Use the attached truss worksheet.\n\n- Solve all six joints.\n- Show a free body diagram for each joint.\n- Label every member T (tension) or C (compression).\n\nSubmit a photo or scan of your work.',
     'Points': 12, 'Due': 'Friday, week 3', 'Category': 'Classwork'},
    {'Unit': U, 'Topic': L1, 'Type': 'Quiz', 'Title': 'Lesson 2.1 check for understanding',
     'Due': 'Monday, week 4', 'Category': 'Quizzes'},
    {'Unit': U, 'Topic': P2, 'Type': 'Assignment', 'Title': 'Project 2.2.1 Balsa Bridge',
     'Description': 'Design, build, and test a balsa wood bridge that spans 30 cm.\n\nYour team must:\n\n- Stay under 25 g of balsa.\n- Keep a design log with at least two sketches.\n- Predict the failure load before testing.\n\nThe rubric below shows how the project is scored.',
     'Points': 20, 'Due': 'End of week 6', 'Category': 'Projects', 'Rubric': 'Bridge project rubric'},
    {'Unit': U, 'Topic': P2, 'Type': 'Discussion', 'Title': 'Design tradeoffs',
     'Description': 'A lighter bridge scores better, but a heavier one holds more. Which would you give up, and why? Reply to one classmate.',
     'Due': 'Wednesday, week 5', 'Category': 'Participation'},
]

EXAMPLE_RUBRIC = [
    {'Rubric': 'Bridge project rubric', 'Criterion': 'Design log', 'Description': 'Sketches, calculations, and changes are recorded.',
     'L1 Points': 5, 'L1 Description': 'Complete and dated', 'L2 Points': 3, 'L2 Description': 'Mostly complete',
     'L3 Points': 1, 'L3 Description': 'Sparse', 'L4 Points': 0, 'L4 Description': 'Missing'},
    {'Rubric': 'Bridge project rubric', 'Criterion': 'Prediction', 'Description': 'Failure load predicted with a method.',
     'L1 Points': 5, 'L1 Description': 'Method shown and explained', 'L2 Points': 3, 'L2 Description': 'Method shown',
     'L3 Points': 1, 'L3 Description': 'Guess only', 'L4 Points': 0, 'L4 Description': 'Missing'},
    {'Rubric': 'Bridge project rubric', 'Criterion': 'Construction', 'Description': 'Joints are clean and the span is met.',
     'L1 Points': 5, 'L1 Description': 'Clean, meets span and mass limit', 'L2 Points': 3, 'L2 Description': 'Meets span only',
     'L3 Points': 1, 'L3 Description': 'Does not meet span', 'L4 Points': 0, 'L4 Description': 'Not built'},
    {'Rubric': 'Bridge project rubric', 'Criterion': 'Reflection', 'Description': 'Explains the failure and one change.',
     'L1 Points': 5, 'L1 Description': 'Clear cause and change', 'L2 Points': 3, 'L2 Description': 'Cause or change',
     'L3 Points': 1, 'L3 Description': 'Vague', 'L4 Points': 0, 'L4 Description': 'Missing'},
]

Q = 'Lesson 2.1 check for understanding'
EXAMPLE_QUESTIONS = [
    {'Quiz': Q, 'Type': 'Multiple choice', 'Question': 'A member that is being pulled apart is in:',
     'Answer': 'B', 'Choice A': 'Compression', 'Choice B': 'Tension', 'Choice C': 'Torsion', 'Choice D': 'Shear'},
    {'Quiz': Q, 'Type': 'Select all', 'Question': 'Which conditions hold for a joint in static equilibrium?',
     'Answer': 'A, B, D', 'Choice A': 'Sum of horizontal forces is zero', 'Choice B': 'Sum of vertical forces is zero',
     'Choice C': 'Every member force is zero', 'Choice D': 'Sum of moments is zero'},
    {'Quiz': Q, 'Type': 'True/False', 'Question': 'In the method of joints you start at a joint with at most two unknown forces.',
     'Answer': 'True'},
    {'Quiz': Q, 'Type': 'Short answer', 'Question': 'What is the SI unit of force?', 'Answer': 'newton | newtons | N'},
    {'Quiz': Q, 'Type': 'Essay', 'Question': 'Explain why triangles are used in truss design.'},
    {'Quiz': Q, 'Type': 'Matching', 'Question': 'Match each truss type to its picture: Pratt, Howe, Warren.'},
]

EXAMPLE_PDF_LINES = [
    'Find the force in each member of the truss below.',
    'Use the method of joints. Start at joint A.',
    'Label each member T (tension) or C (compression).',
    '',
    'Joint A: ______    Joint B: ______    Joint C: ______',
    'Joint D: ______    Joint E: ______    Joint F: ______',
]


def main(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    assets = argv[1] if len(argv) > 1 else os.path.join(here, '..', 'assets')
    assets = os.path.abspath(assets)
    t = write_workbook(os.path.join(assets, 'Course_Workbook_Template.xlsx'))
    e = write_workbook(os.path.join(assets, 'Course_Workbook_Example.xlsx'),
                       EXAMPLE_COURSE, EXAMPLE_RUBRIC, EXAMPLE_QUESTIONS)
    p = make_pdf(os.path.join(assets, 'example_files', 'Truss_Worksheet.pdf'), EXAMPLE_PDF_LINES, 'Truss worksheet')
    for f in (t, e, p):
        print('Wrote ' + f)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
