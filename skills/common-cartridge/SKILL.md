---
name: common-cartridge
description: "Read and build IMS Common Cartridge (.imscc) course packages, the files Schoology, Canvas, Moodle, Blackboard, and D2L use to export and import courses. Use it whenever the user uploads, mentions, or asks about an .imscc file, a Common Cartridge, or a .zip that is a course export, for requests like 'analyze my course export', 'map what's in this cartridge', 'build a course outline from this', 'pull the answer key out of this course', or 'what assignments are in here'. Also use it whenever the user wants to make something to import into Schoology or another LMS: turning a course spreadsheet or workbook into a cartridge, or bulk-creating assignments, quizzes, pages, links, discussions, files, or folders. Trigger even if the user never says 'Common Cartridge'. An export holds course structure and materials, never student submissions or grades; say so if the user expects student work."
compatibility: "Build and review: Node.js 18+ with no npm install (libraries are bundled in scripts/vendor). cc_inventory.py: Python 3 standard library. workbook_io.py append and make_template.py: Python 3 with openpyxl. The two offline pages need only a web browser."
---

# Common Cartridge (.imscc)

This skill has two halves. **Analyze** reads a cartridge someone exported. **Build** writes a cartridge that Schoology will import. The two schoology-* skills (`schoology-assignment`, `schoology-course-review`) call the scripts here, so keep the script names and arguments stable.

All paths below are relative to this skill's folder. Find it with:

```bash
CC=$(dirname "$(find /mnt/skills ~/.claude/skills .claude/skills -path '*common-cartridge/SKILL.md' 2>/dev/null | head -1)")
```

## What this format is

A Common Cartridge is a vendor-neutral packaging standard (from IMS Global / 1EdTech) that LMSs use to export and import courses. Despite the `.imscc` extension, **the file is a ZIP archive.** It never contains student submissions or grades, only the course's structure and teaching materials. Make this clear early if a user calls it "student work" or expects to find turned-in assignments; what's actually inside is the assignment *prompts*, pages, quizzes, links, and attached files.

Inside every cartridge:

- **`imsmanifest.xml`** at the root, the source of truth. It has two halves: `<organizations>` (the course tree: units, topics, items, with human titles and order) and `<resources>` (every file and link, keyed by identifier). Item nodes in the tree point to resources via `identifierref`.
- **Resource folders and files**: HTML pages, XML descriptors (for links, discussions, quizzes), and attached media (PDFs, images, docx).

## Analyze workflow

Follow these steps in order. **Do not `cat` the .imscc directly**: it prints binary garbage. Treat it as a ZIP.

### 1. Inventory first (always start here)

Run the bundled inventory script. It extracts the cartridge, parses the manifest, classifies every item, and prints a structured map plus a flags section.

```bash
python3 $CC/scripts/cc_inventory.py /path/to/course.imscc
```

Add `--extract-to <dir>` to keep the unzipped files for later steps (extracting pages, reading attachments), and `--json` to get machine-readable output you can post-process. Without Python, `node $CC/scripts/cc_review.js inventory course.imscc [--json]` gives the same map (the tests check that the two `--json` outputs are identical).

The script's output is your map. Present a cleaned version to the user: course title, CC version and source LMS, counts by content type, the unit and topic tree, and any flags (see below). Lead with the "not student work" clarification if it might be an expectation mismatch.

### 2. Build whatever the user actually wants

Common follow-on deliverables, all built on the parsed manifest. `scripts/cc_review.js` (Node, no install) produces most of them directly. It runs the same engine (`review_core.js`) as `assets/Course_Reviewer.html`, the offline page a teacher can use without you.

- **Clean course outline**: `node $CC/scripts/cc_review.js outline course.imscc -o outline.md`. It walks the organization tree and renders groupings as headings and items as bullets with a type tag. The hierarchy Bill approved: Unit = H1, Part = H2, Topic/Project = H3, deeper groupings = H4, items as bullets like `- *Assignment* (10 pts) — **Title**: one-line description`. Headings follow the real tree depth, so a course with only Unit and Topic gets H1 and H2. Confirm formatting preferences on a small sample before rendering everything for a new user: heading levels, whether to show URLs, points, and descriptions vary by person. Mirror the *actual* tree structure; don't invent groupings the manifest doesn't have.
- **Quiz / answer key**: `node $CC/scripts/cc_review.js keys course.imscc` prints every quiz's questions, choices, and correct answers as JSON (`correct` holds zero-based indexes; `correct_letters` the letters). The `workbook` subcommand also writes them to the Questions tab. Format details in `references/cc-format.md`.
- **Assignment text dump**: strip the HTML pages to plain text.
- **Link list**: every `<url href>` from the web-link resources (unescape `&amp;`).
- **Editable spreadsheet**: `node $CC/scripts/cc_review.js workbook course.imscc -o course.xlsx [--files-dir DIR]` writes the course workbook (see Build), which can be edited and rebuilt.
- **Audit, syllabus draft, version diff**: `cc_review.js audit | syllabus | diff`. The `schoology-course-review` skill explains when to use each.
- **Convert for another LMS**: a valid CC imports into most LMSs directly; if the user wants a different format (spreadsheet, docx), build it from the parsed data.

### 3. Read the format reference when you hit specifics

`references/cc-format.md` documents the resource-type strings, how to extract a QTI answer key, the `$IMS-CC-FILEBASE$` image-path convention, and vendor-specific quirks. Read it before parsing quizzes or debugging odd resources.

### Flags to always surface

Course exports are lossy and messy. The inventory script detects these; always report them because they affect whether the course is usable:

- **Dropped embeds (empty resource folders).** Schoology in particular exports many embedded videos as empty folders: the title survives but the URL does not. These are unrecoverable from the file; the user must relink from their originals. Flag each by title.
- **Recoverable links inside content.** Some videos survive as web-link resources (a real `<url>`, often YouTube), and some assignment pages have YouTube or other links embedded in their instruction HTML. Surface these; they're easy to miss and often what the user is looking for.
- **Duplicate resources and items.** Exports frequently double up (the same assignment or file listed twice). Note them rather than silently collapsing.
- **Broken absolute paths.** hrefs like `/var/www/html/...` are export artifacts that won't resolve.

### Notes

- The manifest is authoritative for structure and titles. Get the tree and titles from `<organizations>`, and type and content from the matching `<resources>` entry. Don't infer structure from folder names.
- XML namespaces vary by CC version (1.0 to 1.3) and vendor. Match tags by local name (ignore the namespace prefix), as the scripts do, so the code survives version differences.
- If the file is a `.zip` the user says is a course export, treat it exactly the same: check for `imsmanifest.xml` at the root.

## Build workflow

Schoology's REST API is closed to Bill's account, so the only way in is a cartridge imported through Resources. Never call the Schoology API or drive a browser to create content.

### 1. Pick the input

- **Course workbook (.xlsx)** when a teacher is planning or editing a whole unit or course, or will keep editing it later. Start from `assets/Course_Workbook_Template.xlsx`; `assets/Course_Workbook_Example.xlsx` shows every item type. Schema: `references/workbook-schema.md`. Content stays on one Course sheet with Unit and Topic repeated on every row; Bill found a tab-per-unit design confusing.
- **JSON spec** when you are generating content yourself (for example from documents the user gave you). It is easier to write correctly than a spreadsheet and runs the same checks. Schema at the end of `references/workbook-schema.md`. To add spec content to a teacher's existing workbook instead, use `python3 $CC/scripts/workbook_io.py append SPEC.json WORKBOOK.xlsx`.

Write descriptions as Markdown (or HTML starting with `<`). Never put the item's title in its description: Schoology already shows the title, and a repeated heading looks broken. Never embed images: Schoology moves them to Unused Resources on import. Add images as File items instead.

### 2. Build

```bash
node $CC/scripts/cc_build.js INPUT.xlsx|INPUT.json --out COURSE.imscc \
     [--title "Course title"] [--files DIR] [--checklist PATH] [--no-rubric-table]
```

- `--title` names the folder Schoology creates. Default: the spec's `title`, then the input file name.
- `--files` is the folder holding the attachments that File rows name.
- `--no-rubric-table` stops rubrics being appended to descriptions as tables. Leave it on by default.
- It writes the cartridge and `COURSE_After_Import.html`, a printable checklist of everything a cartridge cannot carry: due dates, grading categories, which rubric to attach, a rubric entry sheet, and quiz questions that were left out.
- **Any error means nothing is written and the exit code is 1.** Errors name the row (`Row 7 (Title): ...`). Fix the input and rebuild. Warnings do not block; read them anyway and pass the important ones on.
- After writing, it runs `cc_inventory.py` on the result and prints the tree, which is what Schoology will see.

Teachers who want to build without you can use `assets/Course_Cartridge_Builder.html`: a single offline page (works from `file://`, nothing uploaded) where they drop the workbook and attachments and download the cartridge and checklist. Its companion `assets/Course_Reviewer.html` does the review side the same way. Regenerate both with `node scripts/build_html.js` after changing `core.js` or `review_core.js` (run `make_template.py` first if the workbook layout changed: the reviewer page carries a copy of the template).

### 3. Verify (mandatory, every build)

Do not hand over a cartridge you have not verified.

1. Run `python3 $CC/scripts/cc_inventory.py COURSE.imscc` (cc_build.js does this unless `--no-inventory`). Check the counts by type and the folder tree against the source: every item present, in the right folder, with the right points.
2. **For every quiz, read the answer key back out of the built QTI and compare it with the source document's key**, question by question:

   ```bash
   node $CC/scripts/cc_review.js keys COURSE.imscc
   ```

   `correct_letters` gives the answer letters (`correct` the same as zero-based indexes); true/false and short answer are in `answers`. This cross-check once caught a real error in one of Bill's source documents, so report any disagreement to the user instead of silently picking one.
3. Read the build's warnings and the checklist. Anything on them is something the user must do by hand.

### 4. Hand over

Give the user the `.imscc` and the checklist, and the import path: **Resources, Import, Common Cartridge**, then open the imported folder and use **Add to Course**. Tell them plainly:

- Due dates, categories, and rubrics must be set by hand (the checklist lists each one).
- Rubrics are never imported as gradable rubrics. The description shows a table; the checklist has the entry sheet. Never claim a rubric was imported.
- Schoology sets every imported quiz question to 1 point.
- Matching and ordering questions were left out (Common Cartridge has no such type) and are on the checklist.

### Format rules

`references/build-format.md` records exactly what `core.js` emits and which rules were confirmed by a live import into Schoology. The verified rules are fixed: do not change them to make something else easier. The most important ones, and why:

- Assignment HTML is a bare fragment, never a full document. A full document makes Schoology copy the title into the description and ignore the points.
- Points live only in `<input name="sch-grade-item-max-points" type="hidden" value="N">`, appended last. Without it Schoology uses 100.
- Every item must sit in the organization tree, or Schoology drops it into Unused Resources.
- Short answer, essay, discussion, file, link at CC 1.2, the rubric table, and three-level folders are built to spec but **untested** in a live import. Do not describe them as working. `dist/live-tests/` in the project holds the test files Bill imports to settle them.

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/cc_inventory.py` | Map of a cartridge: counts, flags, tree. `--json`, `--extract-to`. |
| `scripts/cc_review.js` | `inventory`, `outline`, `workbook`, `audit`, `syllabus`, `diff`, `keys` on a cartridge (`--json` for inventory, audit, diff). |
| `scripts/review_core.js` | The review engine, shared by the CLI and the reviewer page. |
| `scripts/cc_build.js` | Workbook or JSON spec to cartridge plus checklist. |
| `scripts/core.js` | The build engine, shared by the CLI and the offline page. |
| `scripts/workbook_io.py` | Writes the workbook; `append SPEC.json WORKBOOK.xlsx`. |
| `scripts/make_template.py` | Regenerates the two workbook assets and the example attachment. |
| `scripts/build_html.js` | Regenerates both offline pages in `assets/`. |
