---
name: common-cartridge
description: "Work with IMS Common Cartridge course exports — any .imscc file, and .zip files that are actually Common Cartridge packages. Use this skill whenever the user uploads, mentions, or asks about an .imscc file, a Common Cartridge, an IMS/1EdTech course package, or an LMS course export/import (Schoology, Canvas, Blackboard, Moodle, D2L/Brightspace, Sakai). Trigger it for requests like 'analyze my course export', 'map what's in this cartridge', 'build a course outline from this', 'pull the quiz/answer key out of this course', 'convert this course for another LMS', or 'what assignments are in here' — even if the user doesn't say the words 'Common Cartridge'. A course export is the course's structure and materials (assignments, pages, quizzes, links, files), NOT student submissions or grades; say so if the user seems to expect student work."
compatibility: "Python 3 with standard library only (zipfile, xml.etree). No third-party packages required."
---

# Common Cartridge (.imscc)

## What this format is

A Common Cartridge is a vendor-neutral packaging standard (from IMS Global / 1EdTech) that LMSs use to export and import courses. Despite the `.imscc` extension, **the file is a ZIP archive.** It never contains student submissions or grades — only the course's structure and teaching materials. Make this clear early if a user calls it "student work" or expects to find turned-in assignments; what's actually inside is the assignment *prompts*, pages, quizzes, links, and attached files.

Inside every cartridge:

- **`imsmanifest.xml`** at the root — the source of truth. It has two halves: `<organizations>` (the course tree: units → topics → items, with human titles and order) and `<resources>` (every file/link, keyed by identifier). Item nodes in the tree point to resources via `identifierref`.
- **Resource folders/files** — HTML pages, XML descriptors (for links, discussions, quizzes), and attached media (PDFs, images, docx).

## Workflow

Follow these steps in order. **Do not `cat` the .imscc directly** — it prints binary garbage. Treat it as a ZIP.

### 1. Inventory first (always start here)

Run the bundled inventory script. It extracts the cartridge, parses the manifest, classifies every item, and prints a structured map plus a flags section.

```bash
python3 scripts/cc_inventory.py /path/to/course.imscc
```

Add `--extract-to <dir>` to keep the unzipped files for later steps (extracting pages, reading attachments), and `--json` to get machine-readable output you can post-process.

The script's output is your map. Present a cleaned version to the user: course title, CC version + source LMS, counts by content type, the unit/topic tree, and any flags (see below). Lead with the "not student work" clarification if it might be an expectation mismatch.

### 2. Build whatever the user actually wants

Common follow-on deliverables, all built on the parsed manifest:

- **Clean course outline** — walk the organization tree, render groupings as headings and items as bullets with a type tag. A sensible default hierarchy: Unit = H1, Part = H2, Topic/Project = H3, deeper groupings = H4, items = bullets like `- *Assignment* (10 pts) — **Title**: one-line description`. Confirm formatting preferences on a small sample before rendering all items — heading levels, whether to show URLs, points, and descriptions vary by user. Mirror the *actual* tree structure; don't invent groupings the manifest doesn't have.
- **Quiz / answer key** — parse the QTI XML. See `references/cc-format.md`.
- **Assignment text dump** — strip the HTML pages to plain text.
- **Link list** — pull every `<url href>` from the web-link resources.
- **Convert for another LMS** — a valid CC imports into most LMSs directly; if the user wants a different format (spreadsheet, docx), build it from the parsed data.

### 3. Read the format reference when you hit specifics

`references/cc-format.md` documents the resource-type strings, how to extract a QTI answer key, the `$IMS-CC-FILEBASE$` image-path convention, and vendor-specific quirks. Read it before parsing quizzes or debugging odd resources.

## Flags to always surface

Course exports are lossy and messy. The inventory script detects these; always report them because they affect whether the course is usable:

- **Dropped embeds (empty resource folders).** Schoology in particular exports many embedded videos as empty folders — the title survives but the URL does not. These are unrecoverable from the file; the user must relink from their originals. Flag each by title.
- **Recoverable links inside content.** Some videos survive as web-link resources (a real `<url>`, often YouTube), and some assignment pages have YouTube/other links embedded in their instruction HTML. Surface these — they're easy to miss and often what the user is looking for.
- **Duplicate resources / items.** Exports frequently double up (the same assignment or file listed twice). Note them rather than silently collapsing.
- **Broken absolute paths.** hrefs like `/var/www/html/...` are export artifacts that won't resolve.

## Notes

- The manifest is authoritative for structure and titles. Get the tree and titles from `<organizations>`, and type/content from the matching `<resources>` entry — don't try to infer structure from folder names.
- XML namespaces vary by CC version (1.0–1.3) and vendor. Match tags by local name (ignore the namespace prefix), as the script does, so the code survives version differences.
- If the file is a `.zip` the user says is a course export, treat it exactly the same — check for `imsmanifest.xml` at the root.
