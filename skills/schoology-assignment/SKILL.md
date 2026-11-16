---
name: schoology-assignment
description: "Turn a Google Doc or Word document (or a whole folder of them) into a Schoology assignment the teacher can import: title, instructions, points, and rubric, packaged as a Common Cartridge (.imscc) with an after-import checklist. Use it whenever the user wants to get an assignment, activity, project, lab, handout, or rubric from a doc into Schoology, says things like 'make this a Schoology assignment', 'put these docs in Schoology', 'import this into my course', 'turn this rubric into an assignment', or shares a Google Doc or .docx while talking about Schoology, even if they never mention cartridges or imports. Requires the common-cartridge skill, which holds the build scripts."
compatibility: "Needs the common-cartridge skill installed. Node.js 18+ and Python 3 with openpyxl. pandoc for Word files. The Google Drive connector for Google Docs."
---

# Schoology assignment from a document

Bill, a high school engineering teacher, writes assignments in Google Docs and Word. Schoology has no file import for a single assignment and his account cannot use the Schoology API, so the only route in is a Common Cartridge imported through Resources. This skill reads the document, extracts the parts Schoology can hold, and builds the cartridge with the `common-cartridge` skill's scripts.

Never call the Schoology API and never drive a browser to create the assignment. The cartridge is the whole delivery.

## 0. Find the build scripts

All code lives in the `common-cartridge` skill. Its install path differs between claude.ai and Claude Code, so look it up:

```bash
CC=$(dirname "$(find /mnt/skills ~/.claude/skills .claude/skills -path '*common-cartridge/SKILL.md' 2>/dev/null | head -1)")
echo "$CC"
```

If that prints nothing or `.`, stop and tell the user: "This needs the common-cartridge skill. Install it, then ask again." Do not try to build a cartridge by hand: the format has rules that were learned from failed imports (see `$CC/references/build-format.md`).

## 1. Get the document

- **Google Doc**: read it through the Google Drive connector (search by name if the user gave a title instead of a link). Export or read it as Markdown or plain text with headings and tables intact.
- **Word (.docx)**: convert it with pandoc, keeping images aside:

  ```bash
  pandoc -f docx -t gfm --wrap=none --extract-media=media_DOCNAME DOC.docx -o DOC.md
  ```

  `--wrap=none` matters: the builder keeps single line breaks as line breaks, so pandoc's default wrapping would break sentences in the middle. If pandoc is missing, say so, and read the .docx with another tool (for example python-docx) rather than guessing at its contents.
- **PDF or pasted text**: work from the text you have and say what formatting was lost.

## 2. Extract the four parts and confirm them

From the document, find:

1. **Title**: usually the first heading or the document name. Activity numbers (`Activity 1.1.2`) belong in the title.
2. **Instructions**: everything a student needs, minus the title.
3. **Points**: a stated total ("20 points", "/20"). If none is stated, say so. Schoology will default to 100 if the cartridge has no points.
4. **Rubric**: a table with criteria as rows and score levels as columns (or the reverse). Record each criterion's title, optional description, and each level's points and description, highest first.

Show the user a short summary of those four things before building (title, points, rubric criteria with their top scores and total, and the first lines of the instructions). **If the points and the rubric total disagree, say so and ask which is right.** Do not pick one silently: either can be the typo.

For a folder of documents, skip the per-document confirmation (see "Batches" below).

## 3. Write the instructions as Markdown

- Leave the title out of the description. Schoology shows the title already; a repeated heading duplicates it.
- Keep headings, lists, bold, and links. Keep tables other than the rubric as Markdown tables.
- Remove the rubric table from the instructions: the builder adds its own copy at the end (see step 5).
- Keep links to the original document or to a student copy when the doc has them; teachers often want "Make a copy of the attached doc".

## 4. Images

Images cannot be embedded: Schoology moves embedded images to Unused Resources on import, and the teacher has to re-embed them by hand. Instead:

- Add each image as a File item in the same folder as the assignment (from pandoc's `--extract-media` folder, or downloaded from the Drive doc), and tell the user which ones to re-embed in the description after import, or
- link to the original document where students can see them.

Never put `![...](...)` or `<img>` in the description. The builder warns if you do.

## 5. Write a JSON spec and build

Write one spec per run. The schema is in `$CC/references/workbook-schema.md` (section "JSON spec"). A single assignment with a rubric:

```json
{
  "title": "Unit 1 assignments",
  "items": [
    {"unit": "Unit 1", "topic": "Lesson 1.1", "type": "Assignment", "title": "Activity 1.1.2 Gears",
     "description": "Use the attached worksheet...\n\n- Step one\n- Step two", "points": 20,
     "rubric": "Activity 1.1.2 rubric", "due": "", "category": ""}
  ],
  "rubrics": [
    {"name": "Activity 1.1.2 rubric", "criteria": [
      {"title": "Accuracy", "description": "", "levels": [{"points": 10, "description": "All correct"}, {"points": 5, "description": "Some errors"}, {"points": 0, "description": "Missing"}]}
    ]}
  ]
}
```

Ask which Unit and Topic folders the assignment belongs in if it is not obvious; blank puts it at the top level of the import. Due dates and grading categories go in the spec only so they print on the checklist; a cartridge cannot carry them.

```bash
node "$CC/scripts/cc_build.js" spec.json --out "OUTDIR/Activity_1.1.2.imscc" [--files DIR_WITH_IMAGES]
```

- For a batch of documents, put all items in one spec and build one cartridge.
- To add to a course workbook the teacher already keeps, run `python3 "$CC/scripts/workbook_io.py" append spec.json WORKBOOK.xlsx` and build the workbook instead.
- Any error means nothing was written. Fix the spec and rebuild. Read every warning.

## 6. Verify (mandatory)

`cc_build.js` prints the `cc_inventory.py` tree after it writes. Check that every assignment is there, in the right folder, with the right points. If the build printed "Python not found", run `python3 "$CC/scripts/cc_inventory.py" OUT.imscc` yourself. If you built a quiz, follow the answer-key cross-check in the common-cartridge skill.

## 7. Hand over

Give the user the `.imscc` and the `_After_Import.html` checklist, and tell them:

1. In Schoology, open **Resources**, choose **Import**, then **Common Cartridge**, and pick the file.
2. When it finishes, open the imported folder in Resources and use **Add to Course**.
3. Print the checklist. It lists the due dates, categories, and rubric to attach for each assignment, and has a rubric entry sheet.

### Rubrics: say exactly this much

Never claim the rubric was imported. No file can import a gradable Schoology rubric. What the cartridge does: the description ends with the rubric as a table students can read, and the checklist has an entry sheet laid out criterion by criterion for typing it into Schoology's rubric editor once (Resources, Add Resources, Add Rubric, which makes it reusable). Whether the table itself survives import is not yet confirmed by a live test, so do not promise how it will look.

## Batches

For a folder of documents, work through the whole list without stopping to check in with the user between documents. Bill asked for this. Make reasonable calls (for example, when points and rubric total disagree, use the rubric total and flag it), then finish with a **gap report** that names every document that was skipped or is incomplete, and why:

| Document | Status | What needs attention |
| --- | --- | --- |
| Activity 1.1.2 | Built | Points said 25, rubric totals 20. Used 20. |
| Project 1.3 | Skipped | Could not open: permission denied. |

Build one cartridge for the batch so the teacher imports once.
