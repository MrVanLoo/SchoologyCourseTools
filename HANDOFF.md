# Schoology import and export toolkit: build brief

You are building a set of tools for Bill, a high school engineering teacher who uses Schoology. He has no programming background beyond classroom Python, so every tool must work without a terminal on his side. A reviewer (another Claude session that wrote this brief) will check your work against the acceptance tests in section 9. Section 10 says what to send back.

Read this whole file before writing code. Section 3 holds format rules that were confirmed by live imports into Schoology. Treat them as fixed.

## 1. What exists and what you are building

Bill needs two workflows:

1. A Google Doc or Word doc becomes a Schoology assignment with title, description, points, and a rubric.
2. A built Schoology course becomes something easy to review: an outline, a syllabus draft, an audit, and an editable spreadsheet.

The Schoology REST API is closed to his account, so the only file route in is a Common Cartridge (.imscc) imported through Resources, and the only route out is a Common Cartridge export. Do not build anything that calls the Schoology API or drives a browser.

Everything passes through one spreadsheet format, the course workbook (section 4). Docs and exports get converted into it, and a builder converts it into a cartridge.

### Deliverables

| # | Deliverable | Where it goes |
| --- | --- | --- |
| 1 | `common-cartridge` skill, analyze and build | `skills/common-cartridge/` |
| 2 | `schoology-assignment` skill, instructions only | `skills/schoology-assignment/SKILL.md` |
| 3 | `schoology-course-review` skill, instructions only | `skills/schoology-course-review/SKILL.md` |
| 4 | Offline builder page | `skills/common-cartridge/assets/Course_Cartridge_Builder.html` |
| 5 | Blank and example workbooks | `skills/common-cartridge/assets/Course_Workbook_Template.xlsx`, `Course_Workbook_Example.xlsx` |
| 6 | Live import test pack | `dist/live-tests/` |
| 7 | Packaged skills | `dist/common-cartridge.skill`, `dist/schoology-assignment.skill`, `dist/schoology-course-review.skill` |

All code lives in `common-cartridge`. The other two skills are instruction files that locate it at run time (section 8).

### Starting state

| File | State |
| --- | --- |
| `skills/common-cartridge/scripts/core.js` | Written. Passes one smoke test (`node tests/smoke.js`), which builds all six item types and five question types, and the output parses and inventories correctly. Not tested through the workbook path, and its error paths are untested. Review it, test it, and fix what you find. |
| `skills/common-cartridge/scripts/cc_inventory.py` | Bill's existing inventory script. Works. Do not change its output format. You may add to it. |
| `skills/common-cartridge/references/cc-format.md` | Existing reference on reading cartridges. Keep. |
| `skills/common-cartridge/scripts/vendor/` | SheetJS mini 0.18.5, JSZip, marked 12, minified. Used by both the Node CLI and the offline page so neither needs npm at run time. |
| `reference/installed-common-cartridge/` | The skill as currently installed on Bill's account, analyze half only. Its `SKILL.md` holds the analyze workflow and the outline format Bill approved. Carry both into the new `SKILL.md` unchanged in substance. |

## 2. Skill layout to produce

```
skills/common-cartridge/
  SKILL.md
  scripts/
    core.js             build engine, Node and browser
    cc_build.js         CLI: workbook or JSON spec -> .imscc + checklist
    build_html.js       stitches core.js + vendor + UI into the offline page
    workbook_io.py      read and write the workbook (openpyxl)
    make_template.py    writes the two .xlsx assets
    cc_inventory.py     existing
    cc_review.py        outline, workbook, audit, syllabus, diff
    vendor/
  references/
    cc-format.md        existing
    build-format.md     section 3 of this brief, written up as a reference
    workbook-schema.md  section 4 of this brief
  assets/
    Course_Cartridge_Builder.html
    Course_Workbook_Template.xlsx
    Course_Workbook_Example.xlsx
skills/schoology-assignment/SKILL.md
skills/schoology-course-review/SKILL.md
```

Python scripts use the standard library plus `openpyxl`. JavaScript uses only the three vendored libraries.

## 3. Schoology format rules

Each rule below has a status. "Verified" means Bill imported a file built this way and it worked. "Untested" means it follows the Common Cartridge spec and has not been through a live import. Keep verified rules exactly. Build untested ones to spec and make sure the live test pack (section 7) covers them.

### Package

- An `.imscc` is a ZIP with `imsmanifest.xml` at the root.
- Emit Common Cartridge 1.2. Namespaces and `schemaLocation` are in `core.js`. Quizzes at 1.2 are verified. Assignments at 1.2 are untested. They were verified at 1.1 with the same resource shape, and Schoology's own exports are 1.2.
- Folders are nested `<item>` nodes with a `<title>` and no `identifierref`, inside one root `<item identifier="root">`. Anything not in the tree lands in Schoology's Unused Resources folder. Verified.
- Each resource's files live in a directory named after the resource identifier (`R_0003/index.html`). `cc_inventory.py` depends on this.

### Assignment (verified)

```xml
<resource identifier="R_0003" type="webcontent" href="R_0003/index.html" intendeduse="assignment">
  <metadata/>
  <file href="R_0003/index.html"/>
</resource>
```

The HTML file is a bare fragment:

```html
<p>Use the attached Google Doc to complete Activity 1.1.2.</p><input name="sch-grade-item-max-points" type="hidden" value="12">
```

- No `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>`. A full document makes Schoology duplicate the title into the description and ignore the points.
- The title appears nowhere in the HTML. Schoology takes the assignment name from the manifest item `<title>`.
- Points exist only in that hidden input, appended last, with attributes in that order. There is no manifest field for points. Without it Schoology defaults to 100.
- The empty `<metadata/>` stays.

### Page (verified)

Same as an assignment without `intendeduse` and without the points input. Bare fragment, no title in the file.

### Link (verified at 1.1, untested at 1.2)

`imswl_xmlv1p2` resource with a `weblink.xml` holding `<webLink><title/><url href="" target="_blank"/></webLink>`.

### Quiz (verified)

Resource type `imsqti_xmlv1p2/imscc_xmlv1p2/assessment` with `<metadata/>` and one `assessment_qti.xml`. QTI 1.2 with the Common Cartridge profiles `cc.multiple_choice.v0p1`, `cc.multiple_response.v0p1`, `cc.true_false.v0p1`. Multiple response is all-or-nothing, an `<and>` of each right choice plus a `<not>` for each wrong one. Nine real tests were built and imported this way.

- `cc.fib.v0p1` and `cc.essay.v0p1` are untested.
- Common Cartridge has no matching or ordering type. Leave those questions out, list them in the checklist, and never fake them as another type.
- Schoology resets every imported question to 1 point. Say so in the checklist.

### Discussion and File (untested)

- Discussion: `imsdt_xmlv1p2` with a `discussion.xml` holding `<topic><title/><text texttype="text/html">escaped HTML</text></topic>`.
- File: `webcontent` resource whose `href` is the file itself, `R_0005/handout.pdf`.

### Known Schoology behavior

- Images embedded in a description get moved to Unused Resources on import, and the teacher has to re-embed them. Do not embed images. Warn when a description contains `<img`.
- A rubric cannot be imported by any file. The cartridge export omits rubrics and nothing in the import reads one. The toolkit handles rubrics two ways: an HTML table appended to the assignment description (built once before, import result unknown, so it is in the live tests), and an entry sheet in the after-import checklist that the teacher types into Schoology's rubric editor once.
- Exports drop most embedded videos. The resource directory exists and is empty. `cc_inventory.py` already detects this as `missing_video`.
- Exports contain duplicate resource identifiers and some absolute `href` paths. Both are export artifacts. Report them, do not fail on them.

## 4. The course workbook

One `.xlsx` with up to four tabs. Only `Course` is required. Bill tested an earlier multi-tab design and found it confusing, so course content stays on one sheet with Unit and Topic repeated on every row. The extra tabs exist only because rubrics and questions are different table shapes.

### Course tab

One item per row. Row order is the order inside a folder.

| Column | Applies to | Meaning |
| --- | --- | --- |
| Unit | all | Top-level folder. Repeat on every row. Blank puts the item at the top level. |
| Topic | all | Folder inside the Unit. Repeat on every row. Blank puts the item directly in the Unit. |
| Type | all | `Assignment`, `Page`, `Link`, `Discussion`, `File`, or `Quiz`. Dropdown. |
| Title | all | Item name. Required. |
| URL | Link | Required for links. Add `https://` when no scheme is given. |
| Description | Assignment, Page, Discussion | Markdown, converted on build. Text starting with `<` is treated as HTML and passed through untouched. Accept `Instructions` as an alias for this header. |
| Points | Assignment | Number. Blank warns that Schoology will default to 100. |
| Due | Assignment, Discussion, Quiz | Free text. Cannot go in the cartridge. Printed on the checklist. |
| Category | Assignment, Discussion, Quiz | Grading category name. Cannot go in the cartridge. Printed on the checklist. |
| Rubric | Assignment, Discussion | Name of a rubric on the Rubrics tab. |
| File | File | File name of the attachment. |

Headers match case-insensitively. Unknown columns are ignored.

Deeper nesting than two levels is allowed by writing ` > ` inside Unit or Topic, for example `Part 1 > Project 1.1.5`. Hand authors never need this. It exists so an exported course with three or four levels survives a round trip. The exporter uses it only when the course is deeper than two levels and says so in its output.

### Rubrics tab

One row per criterion.

| Column | Meaning |
| --- | --- |
| Rubric | Rubric name. Repeat on every row. |
| Criterion | Criterion title. |
| Description | Optional criterion description. |
| L1 Points, L1 Description, L2 Points, L2 Description, ... | Rating levels, highest first. Any number of pairs. A level with no points is ignored. |

The template ships five level pairs.

### Questions tab

One row per question.

| Column | Meaning |
| --- | --- |
| Quiz | Must equal the Title of a Quiz row on the Course tab. |
| Type | `Multiple choice`, `Select all`, `True/False`, `Short answer`, `Essay`, `Matching`, `Ordering`. Dropdown. |
| Question | Prompt text. |
| Answer | A letter (`B`), letters (`A, C, D`), `True` or `False`, or accepted short answers separated by `\|`. Blank for essay. |
| Choice A ... Choice F | Choices for multiple choice and select all. |

Matching and Ordering rows are accepted, left out of the cartridge, and listed on the checklist.

### Read me tab

A short legend: what each tab is for, which columns apply to which type, and the reminder that Due, Category, and Rubric come out on the checklist and not in Schoology. Put it last so `Course` is the first tab.

The blank template has headers, dropdowns, column widths, frozen header row, and cell comments on the headers, and no example rows. The example workbook is a small realistic engineering unit that uses every type, one rubric, and one quiz including a matching question. Use Arial.

### JSON spec

`cc_build.js` also accepts a JSON file, which is what the assignment skill writes. `core.js` `fromSpec` defines it:

```json
{
  "title": "Course or collection title",
  "items": [
    {"unit": "", "topic": "", "type": "Assignment", "title": "", "description": "markdown or HTML",
     "points": 20, "due": "", "category": "", "rubric": "Rubric name", "file": ""}
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

The spec path skips the validation the sheet parser does on questions. Add the same checks there.

## 5. Build side

### cc_build.js

```
node cc_build.js INPUT.xlsx|INPUT.json --out COURSE.imscc
     [--title "Course title"] [--files DIR] [--checklist PATH] [--no-rubric-table]
```

- Title comes from `--title`, then the spec's `title`, then the input file name.
- `--files` is the directory holding attachments for File rows.
- Writes the cartridge and `<out>_After_Import.html` (or `--checklist`).
- Prints item counts, warnings, and errors. Any error means no file is written and the exit code is 1.
- After writing, runs `cc_inventory.py` on the result when Python is available and prints the tree, so the caller sees what Schoology will see.

### The after-import checklist

`core.js` already renders it. It is a printable HTML page with three parts: a table of items whose Due, Category, or Rubric must be set by hand, each rubric laid out criterion by criterion with level points left to right for typing into Schoology's rubric editor, and the questions that were left out. Review the wording and layout. Keep it plain and printable.

### Course_Cartridge_Builder.html

A single self-contained page that works from `file://` with no network. `build_html.js` inlines `core.js` and the three vendor files.

Flow: enter a course title, drop the workbook, drop any attachments for File rows, see the folder tree with a type tag on each item plus warnings and errors, then download the `.imscc` and the checklist as two separate buttons.

Requirements:

- Nothing is uploaded anywhere. Say so on the page in one line.
- Errors block the download and name the row. Warnings do not block.
- Dropping a new workbook resets the state.
- A checkbox controls whether rubric tables are appended to descriptions, on by default.
- Readable for a teacher on a school laptop. Plain language, sentence case, visible keyboard focus, no decorative motion, no external fonts. It is a utility page. Keep it calm and legible and do not style it like a marketing site.
- Test it in a headless browser if you have one. Load the example workbook, build, and compare the downloaded cartridge with the CLI's output for the same input. File contents should match apart from the manifest identifier.

## 6. Review side: cc_review.py

One script, five subcommands, all taking an `.imscc`. It imports from `cc_inventory.py` and adds what that script does not keep: full descriptions, link URLs with entities unescaped, discussion text, file paths, and quiz questions with answers.

```
python3 cc_review.py outline  COURSE.imscc [-o outline.md]
python3 cc_review.py workbook COURSE.imscc -o course.xlsx [--files-dir DIR]
python3 cc_review.py audit    COURSE.imscc [-o audit.md]
python3 cc_review.py syllabus COURSE.imscc [-o syllabus.md] [--major-min POINTS]
python3 cc_review.py diff     OLD.imscc NEW.imscc [-o diff.md]
```

- `outline` produces the format in `reference/installed-common-cartridge/SKILL.md`: Unit as H1, Part as H2, Topic or Project as H3, deeper groups as H4, items as bullets with a type tag, points, and links. Bill approved that format. Match it exactly, including its punctuation.
- `workbook` writes the section 4 schema. Descriptions are stored as the original HTML with the points input removed, which the builder passes through untouched. Quizzes fill the Questions tab with answers read from the QTI. Files are copied to `--files-dir` and named in the File column. Dropped embeds become Link rows with a blank URL and a note in the Description so the builder flags them. The Rubrics tab stays empty because no export contains rubrics. Print how many levels deep the course was and whether ` > ` nesting was used.
- `audit` reports assignments with no points or with the default 100, items with an empty description, dropped video embeds, duplicate titles within one folder, empty folders, duplicate resource identifiers, absolute `href` paths, links with a malformed URL, and descriptions containing `<img`. It does not fetch URLs. Group findings by type with counts, and name the folder path for each one.
- `syllabus` writes a Markdown skeleton: course title, the unit sequence with topics under each, major assignments per unit (points at or above `--major-min`, default the 75th percentile of assignment points), a table of points by unit and by item type, and clearly marked blanks for course description, grading policy, grading categories, due dates, materials, and contact details. An export has none of those. Do not invent them.
- `diff` matches items by folder path plus title and lists added, removed, moved, and changed (points, description text, URL).

`workbook_io.py` holds the one workbook writer used by `make_template.py` and `cc_review.py workbook`, and a function that appends spec items to an existing workbook for the assignment skill:

```
python3 workbook_io.py append SPEC.json WORKBOOK.xlsx
```

## 7. Live import test pack

Bill will import these by hand. Each one answers a question nobody has tested. Put them in `dist/live-tests/` with a `README.md` that says, per file, how to import it and what to look for, as a checklist he can tick.

| File | Question it answers |
| --- | --- |
| `Test_A_assignment_with_rubric_table.imscc` | Do title and points survive at CC 1.2, and does the rubric table render in the description? One assignment, 20 points, a 3 by 4 rubric. |
| `Test_B_all_item_types.imscc` | Do Page, Link, Discussion, and File import in the right folders, three levels deep? Include a small real PDF. |
| `Test_C_quiz_types.imscc` | Do short answer and essay questions import alongside the verified three types? |
| `Test_D_qti21_matching.zip` | Does Schoology's QTI 2.1 import accept a matching question? A QTI 2.1 content package with one `choiceInteraction` item as a control and one `matchInteraction` item. Imported through Resources, Import, QTI v2.1. |

Build A, B, and C with `cc_build.js` from spec files kept in `tests/`. Build D with a small script, also kept in `tests/`.

## 8. The three SKILL.md files

Rules for every skill: YAML frontmatter with only `name`, `description`, and optionally `compatibility`. `name` is kebab-case and equals the folder name. `description` is at most 1024 characters, says what the skill does and when to trigger it, and leans toward triggering. Exactly one `SKILL.md` per skill folder. Keep each body under about 300 lines and push detail into `references/`.

Write them for a Claude that has never seen this project. Explain why each rule exists.

### common-cartridge

Carry over the analyze workflow from the installed skill. Add the build workflow: when to use the workbook, when to use a JSON spec, how to run `cc_build.js`, the verify step, and pointers to `build-format.md` and `workbook-schema.md`. The verify step is mandatory: run `cc_inventory.py` on every cartridge built, and for quizzes read the answer key back out of the QTI and compare it with the source document's key. That cross-check caught a real error in one of Bill's source documents.

### schoology-assignment

Instructions only. Workflow:

1. Get the document. A Google Doc comes through the Google Drive connector. A Word doc is converted with `pandoc -f docx -t gfm --extract-media=DIR`.
2. Extract title, instructions, points, and any rubric table. Show Bill those four things in a short summary before building. If points and rubric total disagree, say so and ask which is right.
3. Write the instructions as Markdown. Leave the title out of the description.
4. Images cannot be embedded. Add each as a File item beside the assignment and tell Bill which ones to re-embed, or link to the original doc.
5. Write a JSON spec and run `cc_build.js`. For a batch of docs, one spec with many items. To add to an existing course workbook, use `workbook_io.py append`.
6. Run the verify step.
7. Give Bill the `.imscc` and the checklist, and tell him the import path: Resources, Import, Common Cartridge, then Add to Course.

For a folder of documents, work through the whole list without stopping to check in, and finish with a gap report naming every document that was skipped or incomplete and why. Bill asked for this behavior.

Rubric guidance: never claim the rubric was imported. The cartridge shows it as a table and the checklist has the entry sheet.

### schoology-course-review

Instructions only. Workflow: how Bill gets the export (Course Options, Save Course to Resources, then Export on that folder in Resources, then download from Transfer History within a day), then which `cc_review.py` subcommand answers which request. For a syllabus, run `syllabus`, then write the document from the skeleton and leave the marked blanks visible. State what an export cannot contain: student work, grades, rubrics, most embedded videos, and in the one export examined, no due dates or grading categories.

### Finding the shared scripts

The two instruction-only skills locate `common-cartridge` at run time, since install paths differ between claude.ai and Claude Code:

```bash
CC=$(dirname "$(find /mnt/skills ~/.claude/skills .claude/skills -path '*common-cartridge/SKILL.md' 2>/dev/null | head -1)")
```

If that comes back empty, the skill tells the user to install `common-cartridge` and stops.

### Packaging

A `.skill` file is a ZIP with the skill folder at its root:

```bash
cd skills && zip -r ../dist/common-cartridge.skill common-cartridge -x '*.DS_Store' '*__pycache__*'
```

## 9. Acceptance tests

Write these as a runnable script, `tests/run_all.sh`, that exits non-zero on any failure. The reviewer will run it.

1. `node tests/smoke.js` passes.
2. `make_template.py` writes both workbooks. The example builds with zero errors through `cc_build.js`.
3. For the example build: every XML file parses, `cc_inventory.py` counts match the workbook's row counts by type, every assignment file starts with `<` and contains no `<html`, `<head`, `<body`, `<!DOCTYPE`, or the assignment's own title, and every assignment with points ends with the exact hidden input.
4. Quiz answer keys read back from the built QTI equal the Questions tab, question by question.
5. The matching question in the example is absent from the QTI and present in the checklist.
6. Error cases each produce a named-row error and no output file: unknown Type, Link with no URL, non-numeric Points, Rubric name not on the Rubrics tab, File row whose file is missing, Quiz row with no questions, multiple choice with two answer letters.
7. Round trip: example workbook, build, `cc_review.py workbook`, build again. The two cartridges have identical inventories (tree, types, titles, points, URLs, question counts) and identical file bytes for File rows.
8. A three-level course round-trips with its depth intact.
9. Build a synthetic Schoology-style export in `tests/` with an empty resource directory under a video title, a duplicate resource identifier, an absolute `href`, an assignment with no points input, two same-titled items in one folder, and an empty folder. `audit` reports each one.
10. `outline` on the example build matches a checked-in expected file.
11. `diff` between the example build and a copy with one item removed, one retitled, and one with changed points reports exactly those three.
12. `syllabus` output contains every unit title and a points table whose total equals the sum of assignment points.
13. The offline page builds the example workbook to the same file contents as the CLI, apart from the manifest identifier. Run this headless if you can. If you cannot, say so plainly in the report.
14. Each `dist/*.skill` unzips to one folder with one `SKILL.md` whose frontmatter passes the rules in section 8.

## 10. What to send back

When you finish, write `REPORT.md` at the project root with:

- The output of `tests/run_all.sh`.
- Every place you changed `core.js` and why.
- Every decision you made that this brief did not cover.
- Anything you could not test, stated plainly. "Not tested" is a fine answer. A guess presented as a result is not.
- The table from section 3 updated with what is verified by your tests versus what still waits on a live import.

Then zip the whole project folder. Bill will upload that zip to the reviewing session.

## 11. Boundaries

- No Schoology API calls and no browser automation.
- No network access at run time for any tool. The offline page must work from `file://`.
- Do not change the verified format rules in section 3 to make something else easier.
- Do not change the approved outline format.
- Do not describe an untested import behavior as working, in code comments, skill text, or the README.
- Keep Bill-facing text plain. He reads the checklist, the offline page, the Read me tab, and the live test README. Short sentences, no jargon without a one-line explanation.
- If a requirement here is wrong or contradictory, stop guessing, pick the reading that keeps verified behavior intact, and record it in `REPORT.md`.
