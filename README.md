# Schoology course tools

Tools for getting course content into and out of Schoology without the Schoology API. The only file route in is a Common Cartridge (`.imscc`) imported through Resources. The only route out is a Common Cartridge export.

## For teachers: two offline pages

Both pages are single HTML files. Download one, open it in a browser, and drop a file on it. Nothing is uploaded, and they work with no internet.

| Page | Drop on it | You get |
| --- | --- | --- |
| [`Course_Cartridge_Builder.html`](skills/common-cartridge/assets/Course_Cartridge_Builder.html) | A course workbook (`.xlsx`) and any attachments | A cartridge to import, and a printable after-import checklist |
| [`Course_Reviewer.html`](skills/common-cartridge/assets/Course_Reviewer.html) | A Schoology export (`.imscc`) | An outline, a list of problems to fix, a syllabus draft, answer keys, an editable workbook, and a comparison with an older export |

To start a new course workbook, use [`Course_Workbook_Template.xlsx`](skills/common-cartridge/assets/Course_Workbook_Template.xlsx). [`Course_Workbook_Example.xlsx`](skills/common-cartridge/assets/Course_Workbook_Example.xlsx) shows every item type. Its **Read me** tab explains the columns.

**Import a cartridge:** in Schoology, open Resources, then Import, then Common Cartridge. When it finishes, use Add to Course on the new folder.

**Export a course:** first open Course Options and choose Save Course to Resources. Then, in Resources, choose Export, then Common Cartridge on that folder. Download the file from Transfer History within a day.

What a cartridge cannot carry, and you set by hand after import:

- due dates
- grading categories
- gradable rubrics
- quiz question points (Schoology sets each imported question to 1 point)
- matching and ordering questions

The checklist lists each of these for the course you built.

## For Claude: three skills

| Skill | Use |
| --- | --- |
| [`common-cartridge`](skills/common-cartridge/SKILL.md) | Read and build cartridges. Holds all the code. |
| [`schoology-assignment`](skills/schoology-assignment/SKILL.md) | A Google Doc or Word doc becomes a Schoology assignment with points and a rubric. |
| [`schoology-course-review`](skills/schoology-course-review/SKILL.md) | An export becomes an outline, audit, syllabus draft, workbook, or diff. |

Packaged copies are in [`dist/`](dist/). Install `common-cartridge` first: the other two use its scripts.

## Live import tests

Some format rules have not yet been confirmed by a real Schoology import. [`dist/live-tests/`](dist/live-tests/) has four test files and a [checklist](dist/live-tests/README.md) for importing them by hand. [`skills/common-cartridge/references/build-format.md`](skills/common-cartridge/references/build-format.md) records which rules are verified and which still wait on these tests.

## For developers

```bash
tests/run_all.sh
```

This rebuilds every generated file (workbooks, both pages, live tests, `.skill` packages), then runs the acceptance tests.

It needs:
- Node 22 or later
- Python 3 with `openpyxl`
- `zip`
- Chrome or Chromium

Set `PYTHON=` or `CHROME=` if they are not on the default path.

- [`HANDOFF.md`](HANDOFF.md) is the original build brief.
- [`REPORT.md`](REPORT.md) says what was built, every decision the brief did not cover, and what is not tested.
- Command-line tools live in [`skills/common-cartridge/scripts/`](skills/common-cartridge/scripts/):
  - `cc_build.js` turns a workbook or JSON spec into a cartridge.
  - `cc_review.js` reviews an export.
  - `cc_inventory.py` maps any cartridge.
