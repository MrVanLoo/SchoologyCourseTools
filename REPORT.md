# Schoology toolkit: build report

Built against `HANDOFF.md`. Every deliverable in section 1 exists, and `tests/run_all.sh` passes all 14 acceptance tests. Its full output is in the last section. Nothing here has been through a live Schoology import. The tests show the files are built as specified and stay consistent with each other. Only Bill's imports can show what Schoology does with them.

**One deliberate departure from the brief.** After the first build, Bill asked for the review tools to run in a browser instead of Python. The brief's `cc_review.py` was replaced by a JavaScript engine, `review_core.js`, used by both a command-line tool (`cc_review.js`, same subcommands) and a second offline page, `Course_Reviewer.html`. The section "Review tools moved to JavaScript" below says what changed, what stayed in Python, and how the two were checked against each other.

## What was built

| # | Deliverable | Where |
| --- | --- | --- |
| 1 | `common-cartridge` skill (analyze and build) | `skills/common-cartridge/` |
| 2 | `schoology-assignment` skill | `skills/schoology-assignment/SKILL.md` |
| 3 | `schoology-course-review` skill | `skills/schoology-course-review/SKILL.md` |
| 4 | Offline builder page | `skills/common-cartridge/assets/Course_Cartridge_Builder.html` (427 KB, one file) |
| 4b | Offline reviewer page (added at Bill's request) | `skills/common-cartridge/assets/Course_Reviewer.html` (222 KB, one file) |
| 5 | Blank and example workbooks | `skills/common-cartridge/assets/Course_Workbook_Template.xlsx`, `Course_Workbook_Example.xlsx`, and the example's attachment `assets/example_files/Truss_Worksheet.pdf` |
| 6 | Live import test pack | `dist/live-tests/` (four test files, their checklists, `README.md`) |
| 7 | Packaged skills | `dist/common-cartridge.skill`, `dist/schoology-assignment.skill`, `dist/schoology-course-review.skill` |

New scripts in `skills/common-cartridge/scripts/`: `cc_build.js`, `build_html.js`, `review_core.js`, `cc_review.js`, `workbook_io.py`, `make_template.py`. New references: `build-format.md`, `workbook-schema.md`.

Test files: `tests/run_all.sh` (entry point), `tests/build_dist.sh` (regenerates every generated file), `tests/check_all.py` (tests 2 to 12 and 14), `tests/browser_test.js` (test 13, and the reviewer page), `tests/make_fake_export.py` (test 9), `tests/make_qti21_test.py` (live test D), `tests/live/spec_*.json` (live tests A to C), `tests/expected/example_outline.md` (test 10).

### Running the tests

```bash
tests/run_all.sh
```

It needs Node 22 or later (the browser test uses Node's built-in WebSocket), Python 3 with `openpyxl`, `zip`, and Chrome or Chromium. Set `PYTHON=/path/to/python3` when the default `python3` lacks openpyxl, and `CHROME=/path/to/chrome` when Chrome is not in a standard place. If no Chrome is found, test 13 prints `NOT RUN` and the script fails. It never counts a missing browser as a pass.

`run_all.sh` calls `build_dist.sh` first, so the templates, the offline page, the live test files and the `.skill` packages are rebuilt from source on every run, and what gets tested is what ships.

This machine's system Python (3.9.6) has no openpyxl. I installed openpyxl 3.1.5 in a scratch virtual environment and ran the tests with `PYTHON` set to it. All Python code is written to work on 3.9.

## Review tools moved to JavaScript

Bill asked to run the tools in a browser rather than a Python environment. Building already worked that way (`core.js` runs in `Course_Cartridge_Builder.html`). The review side now does too.

**What changed**

- `scripts/review_core.js`: one engine for the Node CLI and the page. It has the inventory, outline, audit, syllabus skeleton, diff, answer keys and workbook export. It reads the ZIP with the vendored JSZip and the XML with a small parser inside the file, so Node and the browser behave identically and nothing new is vendored.
- `scripts/cc_review.js`: the CLI. It has the same subcommands and arguments as the brief's `cc_review.py` (`outline`, `workbook`, `audit`, `syllabus`, `diff`), plus `inventory` (text or `--json`), `keys` (answer keys as JSON, used by the mandatory verify step) and `--json` for `audit` and `diff`.
- `assets/Course_Reviewer.html`: drop an export to get a summary with the flags, then four report tabs (outline, problems to fix, syllabus draft, answer keys), each downloadable as `.md`. It also downloads the workbook and an attachments `.zip`, and takes an optional older export to compare against. It works from `file://` with no network, like the builder.
- `cc_review.py` was deleted, not kept alongside. Two implementations of the same reports would drift apart.
- Before deleting it, I compared the two engines on the same cartridges (example, three/four-level course, synthetic export, round trip, modified copy). Outline, audit, syllabus and diff output were byte-identical. The exported workbook had identical cell values, and it rebuilt to a byte-identical cartridge.
- **Workbook export without openpyxl.** The free SheetJS build cannot write dropdowns, comments, fonts or frozen panes. So `review_core.js` fills rows into the shipped `Course_Workbook_Template.xlsx` by editing its sheet XML. It adds two Arial 10 body styles and leaves everything else in the template untouched. The reviewer page carries the template inside it (base64), so it needs no other file.
- **Builder page accepts an attachments `.zip`.** A dropped `.zip` that no File row names is unpacked, and its files are added one by one. So the reviewer's attachments download goes straight into the builder.
- The skills now call `node cc_review.js ...`. `schoology-course-review` tells Claude to offer Bill the reviewer page when he wants to look over a course himself.

**What stayed in Python, and why**

- `cc_inventory.py`: Bill's script. The brief says to keep its output. `cc_review.js inventory --json` reproduces it, and the tests check the two `--json` outputs are equal on 8 cartridges.
- `workbook_io.py` and `make_template.py`: they write the template and example workbooks at build time, and `append` adds a JSON spec to a workbook for the assignment skill. All of these run in Claude's environment, never on Bill's side. Bill's own path (export, reviewer page, workbook, builder page, cartridge) needs only a browser.
- `tests/check_all.py`: the tests drive the JavaScript CLI through `subprocess`.

**Checks added**

- JavaScript inventory equals `cc_inventory.py --json` on 8 cartridges.
- The exported workbook keeps the template's tabs, frozen header, dropdown and header comments.
- A missing file and a ZIP with no manifest give clear errors.
- In headless Chrome, the reviewer page:
  - loads with no network,
  - downloads an outline equal to the expected file,
  - downloads a workbook whose contents equal the CLI's, and an attachments `.zip` with the PDF byte for byte,
  - finds the 3 differences in a comparison, and lists the fake export's problems,
  - clears the comparison when a new export is loaded,
  - shows HTML in course titles and descriptions as text that never runs.
- The builder page unpacks an attachments `.zip`.

## Changes to core.js

The complete diff against the handed-over file is in `reference/core-js-changes.diff`. Every change, by area:

**Things that were wrong or could lose data**

1. **The spec path crashed on a bad answer index.** `{"type":"mc","correct":[5]}` threw `TypeError` in `qtiItem`. An unknown question type wrote `undefined` as the profile, and a multiple choice question with two `correct` values silently kept the first. The brief asks for the sheet's question checks on the spec path, so there is now one validator, `checkQuestion`, used by both parsers. It checks the type, a non-empty prompt, at least two non-empty choices, that every answer is in range, no repeats, exactly one answer for multiple choice, True or False for true/false, and at least one accepted answer for short answer. Spec questions also accept letters (`"B"`) and the sheet's type names.
2. **Spec rubrics were not validated.** Levels went through `Number()`, so `"abc"` became `NaN` and a blank became 0. `fromSpec` now ignores levels with no points, reports non-numeric points, and reports criteria with no title or no levels and duplicate rubric names, just as the sheet parser does.
3. **Questions for a quiz that matches no Quiz row were dropped without a word.** A typo in the Quiz column lost those questions. This is now an error that names the Questions row, or the quiz for spec input.
4. **Two Quiz rows with the same title** would both have received the same questions. This is now an error.
5. **Wrong `https://` handling.** The scheme test `/^[a-z][a-z0-9+.-]*:/` read `example.org:8080/x` as having a scheme, so the build wrote a broken link. Now `https://` is added unless the URL has `scheme://`, `mailto:` or `tel:`. A URL that still does not look like a web address gives a warning.
6. **Row numbers could be wrong.** `sheetRows` assumed every sheet's range starts at A1. It now reads the range start, so `Row N` matches Excel even when the first row is blank.
7. **Negative Points** was accepted. It is now an error.

**Required by the brief and missing**

8. **Image warning.** Any description containing `<img`, including a Markdown image, now warns that Schoology moves embedded images to Unused Resources (brief section 3).
9. **Error labels for spec input.** Errors read `Item 3 (title): ...` instead of `Row item 3 ...`. Spec rubric and quiz errors name the rubric or the question.

**Format output (none of these touch a verified rule)**

10. **Short answer scoring** (`cc.fib.v0p1`, untested in Schoology). The original put several `varequal` elements in one `conditionvar`. QTI 1.2 importers do not agree on whether siblings mean "or". Each accepted answer now gets its own `respcondition`, which is unambiguous. Live test C has three accepted answers to check this.
11. **`rcardinality="Single"`** added to `response_str` for short answer and essay. The CC profile examples include it. Both types are untested.
12. **The manifest is the first entry in the ZIP.** This is conventional and harmless.
13. **File names**: spaces now become `_` like other unusual characters, so a File href never needs URL encoding. The file's bytes are unchanged.
14. **A points input pasted into a description is removed** before the real one is appended, so there is always exactly one, and it is last.
15. **`opts.manifestId`** lets tests fix the one value that changes between builds. Without it the build behaves exactly as before (`M_` plus a timestamp).

**Warnings added**

16. A description whose first heading repeats the title. Schoology already shows the title.
17. An empty description on an Assignment or Page.
18. A Description on a Link, File or Quiz row, where it is ignored.
19. Two items with the same title in the same folder.
20. An empty Course tab is now an error.

**Behavior changes**

21. **Markdown keeps single line breaks** (`breaks: true`). A teacher who presses Alt+Enter inside a cell expects a new line, not a joined paragraph. Because of this, the assignment skill tells Claude to run pandoc with `--wrap=none`.
22. **The `Instructions` alias** now applies when a `Description` column exists but is blank on that row.
23. **Question choice letters refer to the column.** A blank Choice B no longer shifts Choice C's letter. The original also mapped by letter, but this is now explicit.
24. **Added for the offline page**: `build` returns `tree`, a flat folder and item list the page draws, and exports `checkQuestion`, `treeLines` and `safeFileName`.

**Checklist (`checklist()`)**

25. The checklist now opens with the three import steps.
26. "Set on each item" lists every Quiz (question points need setting), Assignments with a Due, Category or Rubric value or with no points, and Discussions with a Due, Category or Rubric value. Before, every Discussion was listed even with nothing to set.
27. An assignment with no points shows "100 (Schoology default, change it)".
28. The "1 point per question" note appears only when the build has a quiz.
29. The Folder column now shows the full ` > ` path as `A / B / C`.
30. Rubric levels say "1 pt", not "1 pts".
31. The rubric paragraph says plainly that the description table does not grade anything.
32. Print styles now keep each table row on one page instead of whole tables.

`cc_inventory.py`: one addition, as the brief allows. A `webcontent` resource whose href is a real file in the package, and not `.html`, `.htm` or `.xml`, is now classified as `file` even when its extension is not on the original list. Before, an `.stl`, `.zip` or `.txt` attachment showed as "Item". The output format is unchanged.

`tests/smoke.js`: it only printed before. It now exits 1 if the build reports errors or an expected file is missing.

## Decisions the brief did not cover

**Outline format**

- Headings follow the real tree depth: depth 1 is H1, depth 2 is H2, depth 3 is H3, depth 4 and below is H4. This matches "Unit H1, Part H2, Topic or Project H3, deeper H4" for Bill's four-level courses, and a two-level course gets H1 and H2.
- The first line is `Course outline: <title>`. The approved sample shows no course title line, and an H1 would clash with the units.
- The approved sample shows only the Assignment bullet. Other types follow the same `- *Type* — **Title**: detail` pattern:

  | Type | Detail shown |
  | --- | --- |
  | Link or video | the URL |
  | File | the file name |
  | Quiz | `- *Quiz* (5 questions) — **Title**` |
  | Page, Discussion | a one-line description |
  | Dropped embed | `[!] not in the export, relink from the original` |
  | Embedded YouTube link | a sub-bullet |

  Bill should glance at `tests/expected/example_outline.md` once.
- Descriptions in the outline drop inline tags without adding a space, so it reads "Tension:", not "Tension :". The 160-character cut-off from `cc_inventory.py` is kept.

**Workbook export (`cc_review.js workbook` and the reviewer page)**

- Folders deeper than two levels: Unit is the first folder, and Topic is every deeper level joined with ` > `.
- `--files-dir` defaults to `<workbook name>_files` next to the workbook.
- Two files with the same name in different folders: the second is saved as `name_2.ext`.
- Two quizzes with the same title: the second is renamed `Title (2)` so the workbook still builds. This is printed.
- A blank-URL Link row with a note in Description is written for each of these, so the builder stops on it:
  - a dropped embed,
  - a File whose bytes are not in the package (for example an absolute href),
  - a resource type the builder cannot make (LTI, `associatedcontent`).
- Empty folders cannot be stored, because every workbook row is an item. They are listed on the console.
- Descriptions over Excel's 32,767-character cell limit are cut to fit, with a printed warning.
- Quiz prompts and choices are stored as plain text. Rich formatting in a Schoology quiz prompt is lost on a round trip.
- An item the export marks `intendeduse="assignment"` but with no points input is treated as an Assignment. `cc_inventory.py` calls it a Page.

**Audit, diff and syllabus**

- **Audit**: added a check for tree items whose `identifierref` points at no resource. It lists the checks with zero findings in the summary table, so a clean result is visible.
- **Diff**: added a "renamed" category: same folder, same content, new title. Without it, test 11's retitled item would show as one removal plus one addition, not "exactly three" changes. Moved items are matched by title and type across folders.
- **Syllabus**:
  - The 75th percentile is computed the way Python's `statistics.quantiles(n=4, method='inclusive')` does it. For the example (12 and 20 points) that gives 18, so only the 20-point project counts as major.
  - The skeleton also has blanks for contact, materials and per-unit dates.
  - The "Items by type" table says "not in export" for quiz and discussion points and "—" for types that have no points.

**Reviewer page**

- Report text comes from the export, so `<` and `&` are escaped before the Markdown is rendered. HTML in a course title can never become live HTML on the page.
- A new export clears any comparison. The comparison treats the export added in step 4 as the older one.
- Answer keys are shown as a numbered list with the choices and an **Answer** line. Essays say "graded by hand".
- The "Count assignments as major at or above" box only shows on the syllabus tab. Left blank, it uses the 75th percentile.
- The reviewer shows the inventory as a one-line summary plus flags, not the full text map. The outline is the readable version of the tree.

**Builder page**

- If the title box is empty when a workbook is loaded, it is filled from the workbook's file name. Typing in the box stops the auto-fill.
- A new workbook clears results and attachments, as the brief requires, but keeps the rubric checkbox and the title the teacher typed. The page says the attachments were cleared only when there were some.
- The page lists each file the File rows need, with "added" or "still needed", plus any dropped files no row uses.
- The page rebuilds on every change: title, files or checkbox.
- The page is light-only, with a high-contrast amber focus ring.

**Example workbook**: Unit 2: Structures. It has two topics, eight items covering all six types, a four-criterion 20-point rubric (5/3/1/0 per criterion), and a six-question quiz: multiple choice, select all, true/false, short answer, essay and matching. There is no ordering question. Descriptions and the rubric name avoid containing any assignment title, because test 3 checks for the title as plain text.

**Live tests**

- **Test A's rubric is 3 criteria by 4 levels, but the criteria are worth 8, 6 and 6.** Three equal criteria cannot total the required 20 points with whole-number levels. Because the criteria differ, the table uses the "Criteria / Levels" layout, not the points-across-the-top grid that rubrics with identical level points get, like the example's. So the grid layout is not what Test A checks. Both are plain bordered HTML tables, but if Bill wants the grid checked too, add a second assignment to Test A.
- Test B adds a 5-point Assignment at level 3 as a control. If it fails, the folder depth is to blame, not the item type.
- Test D contains two `assessmentItem` files and a manifest, with no `assessmentTest`. If Schoology wants a test wrapper, the import result will say so.

**CLI and packaging**

- `cc_build.js` has two extra flags: `--no-inventory` (skip the cc_inventory step, used by tests and `build_dist.sh`) and `--manifest-id` (tests only).
- Packaging excludes `.gitkeep`, `.DS_Store` and `__pycache__`. The three empty `.gitkeep` placeholders from the handoff were deleted once the folders had real files.

**Finding common-cartridge (changed from the brief's locator line)**

- The brief's line finds the first `common-cartridge/SKILL.md` under `/mnt/skills`, `~/.claude/skills` or `.claude/skills`. That fails two ways. The Claude desktop app keeps skills synced from a claude.ai account in `~/Library/Application Support/Claude/local-agent-mode-sessions/...`, which it does not search. And Bill's account still has the old analysis-only `common-cartridge`, which the line could pick even though it has no build scripts.
- All three skills now search for `common-cartridge/scripts/cc_build.js` in those folders, plus the desktop app's. Only the new version can match.
- Tested on this Mac with a fake home folder holding an old and a new copy (paths with spaces): the search picks the new one. Not tested on claude.ai itself, or on the Windows desktop app, whose folder is not searched.

**Readings of the brief**

- **Assignments**: section 3 heads them "(verified)" but says they are untested at CC 1.2. Everywhere I wrote "verified at 1.1, untested at 1.2", the reading that does not overstate.
- **Test 3's title check** is literal: the assignment's title must not appear anywhere in its file. The builder warns only when the description opens with a heading equal to the title. It cannot reject every description that mentions its own name, like "Build the Bridge", without blocking normal writing, so the literal check is only applied to the example.
- **Rubric total vs Points**: a mismatch is a warning, not an error. The assignment skill asks Bill which number is right for a single document, and for a batch uses the rubric total and flags it in the gap report.

## What I could not test

Stated plainly. "Not tested" means exactly that.

**Schoology itself**

- Not tested: every import behavior. No file built here has been imported. The live test pack exists for this.
- Not tested: a real Schoology export. The handoff had none. The review tools (Python before, JavaScript now) were tested only against cartridges this toolkit built and against the synthetic export in `tests/make_fake_export.py`, which I wrote from the brief's description of export quirks. The QTI reader has only read QTI that this toolkit wrote. Schoology's own quiz XML may use structures it does not expect; unknown question types are skipped with a note, not guessed.
- Not tested: CC 1.1 or 1.3 cartridges, and exports from Canvas, Moodle or other LMSs.

**The skills**

- Not tested: installing the skills on claude.ai or in Claude Code, and the `find` locator line that the two instruction-only skills use.
- Not tested: the Word path of `schoology-assignment`. pandoc is not installed on this machine.
- Not tested: the Google Docs path through the Drive connector. No document was converted end to end. The JSON spec and build half of that skill is covered by the build tests.

**Workbooks**

- Not tested: opening the workbooks in Excel or Google Sheets. They were read back with openpyxl and SheetJS only. The dropdowns, header comments, frozen row and Arial font exist in the file (checked through openpyxl), but I did not see them in a spreadsheet program.
- Not tested: a workbook saved by Excel or Google Sheets after editing. Only openpyxl-written workbooks were built.
- Not tested: the over-32,767-character truncation in the workbook writer.

**Offline pages (builder and reviewer)**

- Tested: headless Chrome 157 on macOS, loading files through the file inputs.
- Not tested: real drag and drop, Safari, Edge, Firefox, a school Chromebook, a screen reader, and printing.
- Not tested: opening the reviewer's downloaded workbook in Excel or Google Sheets. It is checked through openpyxl, and it rebuilds identically.
- Known limit: the JavaScript engine decodes numeric HTML entities and about 150 common named ones (accented letters, Greek letters, dashes, quotes, math symbols). Python's `html.unescape` knows all 2,231. An unknown name like `&sext;` stays as written in outline and audit text. Nothing tested so far hit this.

**Platforms**

- Tested only with Node 24.21.0, Python 3.9.6 and openpyxl 3.1.5 on macOS.

## Format rules: verified by my tests vs waiting on a live import

"My tests" means the tests check that the file is built exactly to the rule and reads back correctly. No test can show what Schoology does with it.

| Rule | Status in the brief | My tests check | Still waits on a live import |
| --- | --- | --- | --- |
| ZIP with `imsmanifest.xml` at the root, CC 1.2 namespaces | Verified (quizzes at 1.2) | Every XML file parses. The manifest is first in the ZIP. | No |
| Folders as nested `<item>`s in one `root` item | Verified | Tree read back by `cc_inventory.py` equals the workbook. 3- and 4-level round trip. | Three or more levels: yes, **Test B** |
| Resource files in a folder named after the identifier | Required by `cc_inventory.py` | Every resource read back through it | No |
| Assignment: `intendeduse="assignment"`, `<metadata/>`, bare fragment, no title, points input last | Verified at 1.1. Untested at 1.2. | Test 3 on every example assignment: starts with `<`, no html, head, body or doctype, no title, ends with the exact input, one input only, `<metadata/>` present | At 1.2: yes, **Test A** (and Test B's control) |
| Page: bare fragment, no points input | Verified | No points input, no title | No |
| Link `imswl_xmlv1p2` | Verified at 1.1. Untested at 1.2. | URL read back with `&` unescaped. `https://` added. | At 1.2: yes, **Test B** (the URL has `&`) |
| Quiz: multiple choice, select all, true/false (QTI 1.2, CC profiles, all-or-nothing select all) | Verified | Answer keys read back equal the Questions tab and the spec (test 4) | No |
| Quiz: short answer `cc.fib.v0p1` | Untested | Reads back with all accepted answers, one condition each | Yes, **Test C** |
| Quiz: essay `cc.essay.v0p1` | Untested | Reads back as essay | Yes, **Test C** |
| Matching and ordering left out, listed on the checklist | Rule | Absent from the QTI, present on the checklist and the page (test 5) | No |
| Imported questions reset to 1 point | Known behavior | The checklist says so | Re-confirmed in Test C, question C6 |
| Discussion `imsdt_xmlv1p2` | Untested | Text round-trips exactly | Yes, **Test B** |
| File: `webcontent`, href is the file | Untested | Bytes round-trip identically (test 7) | Yes, **Test B** |
| Rubric as an HTML table in the description | Untested | Present by default, absent with `--no-rubric-table` | Yes, **Test A** |
| Matching through QTI 2.1 import | Untested | The package is well-formed, with one `choiceInteraction` and one `matchInteraction` | Yes, **Test D** |
| No images embedded: warn on `<img` | Known behavior | The warning fires for HTML and Markdown images. The audit flags them in exports. | No |
| Exports: dropped videos, duplicate identifiers, absolute hrefs | Known behavior | The audit reports each one on the synthetic export (test 9) | Behavior on a real export: yes (no real export available) |

## Output of tests/run_all.sh

Run on 2026-11-16 with `PYTHON` pointing at a Python 3.9.6 venv that has openpyxl 3.1.5, Node 24.21.0 and Chrome 157. 191 checks, all passing.

```

######## Build generated files (templates, offline page, live tests, .skill packages)
Wrote /Users/vanloo/GitHub/schoology-toolkit/skills/common-cartridge/assets/Course_Workbook_Template.xlsx
Wrote /Users/vanloo/GitHub/schoology-toolkit/skills/common-cartridge/assets/Course_Workbook_Example.xlsx
Wrote /Users/vanloo/GitHub/schoology-toolkit/skills/common-cartridge/assets/example_files/Truss_Worksheet.pdf
Wrote /Users/vanloo/GitHub/schoology-toolkit/skills/common-cartridge/assets/Course_Cartridge_Builder.html (427 KB)
Wrote /Users/vanloo/GitHub/schoology-toolkit/skills/common-cartridge/assets/Course_Reviewer.html (222 KB)
Course title: Test A assignment with rubric table
Items: 1 Assignment (1 total, 1 folders)
Wrote dist/live-tests/Test_A_assignment_with_rubric_table.imscc
Wrote dist/live-tests/Test_A_assignment_with_rubric_table_After_Import.html
Course title: Test B all item types
Items: 1 Assignment, 1 Page, 1 Link, 1 Discussion, 1 File (5 total, 3 folders)
Wrote dist/live-tests/Test_B_all_item_types.imscc
Wrote dist/live-tests/Test_B_all_item_types_After_Import.html
Course title: Test C quiz types
Items: 1 Quiz (1 total, 1 folders)
Wrote dist/live-tests/Test_C_quiz_types.imscc
Wrote dist/live-tests/Test_C_quiz_types_After_Import.html
Wrote dist/live-tests/Test_D_qti21_matching.zip
dist:
common-cartridge.skill
live-tests
schoology-assignment.skill
schoology-course-review.skill

dist/live-tests:
README.md
Test_A_assignment_with_rubric_table.imscc
Test_A_assignment_with_rubric_table_After_Import.html
Test_B_all_item_types.imscc
Test_B_all_item_types_After_Import.html
Test_C_quiz_types.imscc
Test_C_quiz_types_After_Import.html
Test_D_qti21_matching.zip
ok   build_dist.sh

######## 1. node tests/smoke.js
ok   smoke test passes

######## 2-12, 14. Python acceptance checks

== 2. Templates and example build
ok   make_template.py wrote Course_Workbook_Template.xlsx
ok   make_template.py wrote Course_Workbook_Example.xlsx
ok   template tabs are Course, Rubrics, Questions, Read me (Course first, Read me last)
ok   template has headers and no example rows
ok   template header row is frozen
ok   template Type column has a dropdown
ok   template question Type column has a dropdown
ok   every Course header has a comment
ok   template uses Arial
ok   Rubrics tab ships five level pairs
ok   example workbook builds with zero errors
ok   example build prints no errors
ok   example uses every item type
ok   example has one rubric
ok   example quiz includes a matching question

== 3. Example build structure
ok   every XML file parses
ok   cc_inventory counts {'page': 2, 'link': 1, 'file': 1, 'assignment': 2, 'quiz': 1, 'discussion': 1} match workbook rows by type {'page': 2, 'link': 1, 'file': 1, 'assignment': 2, 'quiz': 1, 'discussion': 1}
ok   "Activity 2.1.1 Method of Joints": file starts with <
ok   "Activity 2.1.1 Method of Joints": no html/head/body/doctype
ok   "Activity 2.1.1 Method of Joints": the title does not appear in the file
ok   "Activity 2.1.1 Method of Joints": ends with the exact hidden points input (<input name="sch-grade-item-max-points" type="hidden" value="12">)
ok   "Activity 2.1.1 Method of Joints": exactly one points input
ok   "Activity 2.1.1 Method of Joints": resource keeps the empty <metadata/>
ok   "Project 2.2.1 Balsa Bridge": file starts with <
ok   "Project 2.2.1 Balsa Bridge": no html/head/body/doctype
ok   "Project 2.2.1 Balsa Bridge": the title does not appear in the file
ok   "Project 2.2.1 Balsa Bridge": ends with the exact hidden points input (<input name="sch-grade-item-max-points" type="hidden" value="20">)
ok   "Project 2.2.1 Balsa Bridge": exactly one points input
ok   "Project 2.2.1 Balsa Bridge": resource keeps the empty <metadata/>
ok   two assignments checked
ok   page "Unit 2 vocabulary": no points input and no title in the file
ok   page "Lesson 2.1 overview": no points input and no title in the file

== 4. Quiz answer keys read back from the QTI
ok   QTI has 5 questions, Questions tab has 5 (not counting matching)
ok   question 1 (Multiple choice): type, prompt, choices, and answer match the Questions tab
ok   question 2 (Select all): type, prompt, choices, and answer match the Questions tab
ok   question 3 (True/False): type, prompt, choices, and answer match the Questions tab
ok   question 4 (Short answer): type, prompt, choices, and answer match the Questions tab
ok   question 5 (Essay): type, prompt, choices, and answer match the Questions tab
ok   live test C spec builds
ok   live test C answer keys read back equal the spec
ok   short answer: one condition per accepted answer (3)

== 5. Matching question left out of the QTI, listed on the checklist
ok   matching prompt is absent from the QTI
ok   no faked matching item in the QTI
ok   matching prompt is on the checklist
ok   checklist has the left-out and rubric sections
ok   checklist says imported questions are 1 point each

== 6. Error cases: named row, exit 1, no output
ok   unknown_type: exit 1, no files, message names Row 4b.*Type "Lesson"
ok   link_no_url: exit 1, no files, message names Row 4 (Truss (Wikipedia)): a Link needs a URL
ok   points_not_number: exit 1, no files, message names Row 6 (Activity 2.1.1.*Points "twelve" is not a number
ok   rubric_missing: exit 1, no files, message names Row 8 (Project 2.2.1.*"No such rubric" is not on the Rubrics tab
ok   file_missing: exit 1, no files, message names Row 5 (Truss worksheet): the file "Truss_Worksheet.pdf" was not provided
ok   quiz_no_questions: exit 1, no files, message names Row 7 (Lesson 2.1 check.*no questions
ok   mc_two_letters: exit 1, no files, message names Questions row 2: Multiple choice takes one answer
ok   spec path reports: question 1: the answer
ok   spec path reports: question 2: Multiple choice takes one answer
ok   spec path reports: question 3: question type "xyz"
ok   spec path reports: question 4: True/False
ok   spec path reports: question 5: Short answer
ok   spec path reports: criterion 1: a level has points that are not a number
ok   spec path reports: "Orphan" does not match the Title of any Quiz row
ok   spec path errors are messages, not a crash

== 7. Round trip: workbook -> cartridge -> workbook -> cartridge
ok   cc_review.js workbook runs
ok   workbook export prints depth and nesting
ok   exported workbook builds with zero errors
ok   inventories match (tree, types, titles, points, URLs, question counts)
ok   File row bytes are identical (R_0004/Truss_Worksheet.pdf)
ok   every file in the two cartridges is byte-identical (manifest id fixed for the test)
ok   exported workbook: 5 questions, empty Rubrics tab

== 8. Three-level (and four-level) course keeps its depth
ok   deep workbook builds
ok   items sit 3 and 4 folders deep, and at the top level
ok   export reports 4 levels and that " > " nesting was used
ok   exported Topic column uses " > "
ok   deep course round-trips with depth intact

== 9. Audit of a synthetic Schoology-style export
ok   audit: empty resource directory under a video title
ok   audit: duplicate resource identifier
ok   audit: absolute href
ok   audit: assignment with no points input
ok   audit: two same-titled items in one folder
ok   audit: empty folder, with its parent path
ok   audit extra: assignment at the default 100
ok   audit extra: empty description
ok   audit extra: malformed URL
ok   audit extra: <img in a description
ok   audit: no double counting
ok   audit Markdown groups findings by type with counts
ok   workbook export of the fake export flags rows that need a URL
ok   the builder blocks those rows until a URL is added

== 10. Outline matches the checked-in expected file
ok   outline equals tests/expected/example_outline.md

== 11. Diff reports exactly one removal, one retitle, one points change
ok   modified copy builds
ok   removed: Unit 2 vocabulary
ok   renamed: Design tradeoffs
ok   changed: points 12 to 15 on Activity 2.1.1
ok   nothing else reported
ok   diff Markdown says 3 differences

== 12. Syllabus skeleton
ok   syllabus names every unit: Unit 2: Structures
ok   points table total 32 equals the sum of assignment points 32.0
ok   marked blanks for description, grading policy, categories, due dates, materials, contact
ok   syllabus runs on the deep course

== Extra checks
ok   --no-rubric-table leaves the table out
ok   ... and the checklist still has the rubric entry sheet
ok   workbook_io.py append writes a workbook that builds
ok   appending the same rubric twice is refused and the workbook is untouched
ok   Read me stays the last tab after append
ok   a Markdown image in a description gives the image warning
ok   a description that repeats the title gives a warning
ok   a URL like example.org:8080/x gets https:// added
ok   live test Test_A_assignment_with_rubric_table.imscc exists and inventories
ok   live test Test_B_all_item_types.imscc exists and inventories
ok   live test Test_C_quiz_types.imscc exists and inventories
ok   test B has page, link, discussion, file, three levels deep
ok   test A: 20 points and a 3-criterion rubric table
ok   test D: QTI 2.1 package with a choiceInteraction and a matchInteraction, all XML well-formed
ok   live test README is present

== JavaScript review engine matches cc_inventory.py
ok   inventory of example.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of deep.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of fake_schoology_export.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of roundtrip.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of modified.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of Test_A_assignment_with_rubric_table.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of Test_B_all_item_types.imscc: JavaScript output equals cc_inventory.py --json
ok   inventory of Test_C_quiz_types.imscc: JavaScript output equals cc_inventory.py --json
ok   exported workbook keeps the template tabs, frozen header, dropdown, and header comments
ok   exported workbook body cells are Arial, descriptions wrap
ok   cc_review.js inventory prints the text map
ok   a missing file is a clear error, not a crash
ok   a ZIP with no manifest is reported as not a Common Cartridge

== 14. Packaged skills
ok   common-cartridge.skill exists
ok   common-cartridge.skill unzips to one folder named common-cartridge
ok   common-cartridge.skill has exactly one SKILL.md, at the folder root
ok   common-cartridge: frontmatter has only name, description, compatibility
ok   common-cartridge: name is kebab-case and equals the folder
ok   common-cartridge: description is 893 characters (max 1024)
ok   common-cartridge: SKILL.md is 147 lines
ok   common-cartridge: no cache or .DS_Store files
ok   schoology-assignment.skill exists
ok   schoology-assignment.skill unzips to one folder named schoology-assignment
ok   schoology-assignment.skill has exactly one SKILL.md, at the folder root
ok   schoology-assignment: frontmatter has only name, description, compatibility
ok   schoology-assignment: name is kebab-case and equals the folder
ok   schoology-assignment: description is 684 characters (max 1024)
ok   schoology-assignment: SKILL.md is 124 lines
ok   schoology-assignment: no cache or .DS_Store files
ok   schoology-course-review.skill exists
ok   schoology-course-review.skill unzips to one folder named schoology-course-review
ok   schoology-course-review.skill has exactly one SKILL.md, at the folder root
ok   schoology-course-review: frontmatter has only name, description, compatibility
ok   schoology-course-review: name is kebab-case and equals the folder
ok   schoology-course-review: description is 781 characters (max 1024)
ok   schoology-course-review: SKILL.md is 82 lines
ok   schoology-course-review: no cache or .DS_Store files

all checks passed

######## 13. Offline pages (builder and reviewer) in headless Chrome
ok   page loads from file:// with all libraries inline
ok   page makes no network requests
ok   download is disabled before a workbook is loaded
ok   an error in the workbook is shown with its row number
ok   errors block both downloads
ok   a missing attachment blocks the download
ok   example workbook plus attachment builds with no errors
ok   folder tree with type tags is shown
ok   items carry a type tag
ok   the matching question is listed as left out
ok   both download buttons produce a file (Example_course_After_Import.html, Example_course.imscc)
ok   page and CLI cartridges have the same file list (9 files)
ok   page and CLI file contents match apart from the manifest identifier
ok   downloaded checklist has the rubric entry sheet and the left-out questions
ok   loading a new workbook clears the attachments
ok   the rubric checkbox keeps its setting
ok   builder: an attachments .zip is unpacked and satisfies the File row
ok   builder: no JavaScript exceptions
-- Course_Reviewer.html
ok   reviewer page loads from file:// with everything inline
ok   reviewer downloads are disabled before an export is loaded
ok   reviewer page makes no network requests
ok   a ZIP with no manifest is reported plainly
ok   reviewer summarizes the example export (8 items, 3 folders)
ok   reviewer outline download equals tests/expected/example_outline.md
ok   syllabus tab shows the skeleton and the threshold box
ok   answer keys tab shows the letters and accepted short answers
ok   the threshold box is hidden on other tabs
ok   workbook and attachments download (Example_course_attachments.zip, Example_course_workbook.xlsx)
ok   reviewer workbook has the same contents as cc_review.js workbook
ok   attachments .zip holds the original PDF, byte for byte
ok   comparing with the modified export finds 3 differences
ok   comparison downloads as Markdown
ok   a new export replaces the old one
ok   a new export clears the comparison
ok   audit tab lists the fake export's problems
ok   spreadsheet section warns about rows that need a URL
ok   attachments button is off when the export has no usable files
ok   HTML inside course titles and descriptions shows as text and never runs
ok   reviewer: no JavaScript exceptions
browser checks passed

RESULT: ALL TESTS PASSED
```
