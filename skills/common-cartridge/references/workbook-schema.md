# Course workbook schema

The course workbook is the one format everything passes through. Documents and exports are converted into it, and `cc_build.js` (or the offline page) converts it into a cartridge. Two pieces of code write it: `workbook_io.py` (Python: the template, the example, and `append`) and `review_core.js` (JavaScript: exporting a cartridge, in `cc_review.js workbook` and the Course reviewer page). The JavaScript side fills rows into `Course_Workbook_Template.xlsx`, so both share one layout. Change the layout in `workbook_io.py` and regenerate the template.

One `.xlsx` with up to four tabs, in this order: `Course`, `Rubrics`, `Questions`, `Read me`. Only `Course` is required. Bill tested an earlier design with a tab per unit and found it confusing, so course content stays on one sheet with Unit and Topic repeated on every row. The other tabs exist only because rubrics and questions are different table shapes.

Headers match case-insensitively. Unknown columns are ignored. Blank rows are skipped. Error messages name the sheet row (`Row 7`, `Questions row 3`), so keep the header on row 1.

## Course tab

One item per row. Row order is the order inside a folder.

| Column | Applies to | Meaning |
| --- | --- | --- |
| Unit | all | Top-level folder. Repeat on every row. Blank puts the item at the top level. |
| Topic | all | Folder inside the Unit. Repeat on every row. Blank puts the item directly in the Unit. |
| Type | all | `Assignment`, `Page`, `Link`, `Discussion`, `File`, or `Quiz`. Dropdown. Case does not matter. |
| Title | all | Item name. Required. |
| URL | Link | Required for links. `https://` is added when no scheme is given. |
| Description | Assignment, Page, Discussion | Markdown, converted on build with line breaks kept. Text starting with `<` is treated as HTML and passed through untouched. `Instructions` is accepted as an alias for this header. |
| Points | Assignment | Number, zero or more. Blank warns that Schoology will default to 100. |
| Due | Assignment, Discussion, Quiz | Free text. Cannot go in the cartridge. Printed on the checklist. |
| Category | Assignment, Discussion, Quiz | Grading category name. Cannot go in the cartridge. Printed on the checklist. |
| Rubric | Assignment, Discussion | Name of a rubric on the Rubrics tab. |
| File | File | File name of the attachment. The file itself is supplied at build time (`--files DIR`, or dropped on the offline page). |

### Deeper folders

Write ` > ` (space, greater-than, space) inside Unit or Topic for more levels, for example Topic `Part 1 > Project 1.1.5`. Hand authors never need this. It exists so an exported course with three or four levels survives a round trip. `cc_review.js workbook` (and the Course reviewer page) uses it only when the course is deeper than two levels, and says so. A folder whose own name contains ` > ` would be split; the exporter warns if it sees one.

## Rubrics tab

One row per criterion.

| Column | Meaning |
| --- | --- |
| Rubric | Rubric name. Repeat on every row of the rubric. |
| Criterion | Criterion title. |
| Description | Optional criterion description. |
| L1 Points, L1 Description, L2 Points, L2 Description, ... | Rating levels, highest first. Any number of pairs (`Level 1 Points` also works). A level with no points is ignored. |

The template ships five level pairs. A rubric's total is the sum of each criterion's highest level. When an assignment's Points differ from its rubric total, the build warns.

## Questions tab

One row per question.

| Column | Meaning |
| --- | --- |
| Quiz | Must equal the Title of a Quiz row on the Course tab. Questions whose Quiz matches no Quiz row are an error, so they are never lost silently. |
| Type | `Multiple choice`, `Select all`, `True/False`, `Short answer`, `Essay`, `Matching`, `Ordering`. Dropdown. |
| Question | Prompt text (plain text). |
| Answer | A letter (`B`), letters (`A, C, D`), `True` or `False`, or accepted short answers separated by `\|`. Blank for essay, matching, ordering. |
| Choice A ... Choice F | Choices for multiple choice and select all. Letters refer to the column, so a blank Choice B does not shift C. (G and H also work if added.) |

Matching and Ordering rows are accepted, left out of the cartridge, and listed on the checklist. A quiz whose questions are all matching or ordering is an error.

## Read me tab

A short legend for the teacher: what each tab is for, which columns apply to which type, and the reminder that Due, Category, and Rubric come out on the checklist and not in Schoology. It is last so `Course` is the first tab Excel opens.

## JSON spec

`cc_build.js` also accepts a JSON file. The assignment skill writes one per batch. `core.js` `fromSpec` reads it and runs the same checks as the sheet parser, including the question checks.

```json
{
  "title": "Course or collection title",
  "items": [
    {"unit": "", "topic": "", "type": "Assignment", "title": "", "description": "markdown or HTML",
     "points": 20, "due": "", "category": "", "rubric": "Rubric name", "file": "", "url": ""}
  ],
  "rubrics": [
    {"name": "", "criteria": [{"title": "", "description": "", "levels": [{"points": 4, "description": ""}]}]}
  ],
  "quizzes": [
    {"title": "", "questions": [
      {"type": "mc", "prompt": "", "choices": ["", ""], "correct": [1]},
      {"type": "mr", "prompt": "", "choices": ["", "", ""], "correct": [0, 2]},
      {"type": "tf", "prompt": "", "answers": ["true"]},
      {"type": "fib", "prompt": "", "answers": ["accepted", "also accepted"]},
      {"type": "essay", "prompt": ""},
      {"type": "matching", "prompt": ""}
    ]}
  ]
}
```

- `correct` holds zero-based choice indexes (`[1]` is choice B). Letters (`["B"]`) also work.
- `type` also accepts the sheet names (`"Multiple choice"`, `"Select all"`, ...).
- Errors name the item (`Item 3 (title)`), rubric, or quiz question (`Quiz "X", question 2`).
- `python3 workbook_io.py append SPEC.json WORKBOOK.xlsx` adds a spec to an existing workbook. It refuses (and changes nothing) when a rubric name or quiz title already exists there.
