---
name: schoology-course-review
description: "Review a built Schoology course from its Common Cartridge export: a clean outline, a syllabus draft, an audit of problems (missing points, empty descriptions, dropped videos, duplicates, broken links, empty folders), an editable spreadsheet of the whole course, or a list of what changed between two exports. Use it whenever the user wants to look over, summarize, check, clean up, document, or compare a Schoology course, asks for a syllabus or outline from their course, asks what is in their course or what is broken in it, wants their course in a spreadsheet to edit, or uploads a Schoology .imscc export, even if they never say 'cartridge' or 'export'. Also use it to explain how to export a course from Schoology. Requires the common-cartridge skill, which holds the scripts."
compatibility: "Needs the common-cartridge skill installed. Node.js 18+ (no npm install). Python 3 for the cc_inventory.py map, or use cc_review.js inventory instead."
---

# Schoology course review

Bill, a high school engineering teacher, builds courses in Schoology and wants to review them outside it: an outline to scan, a syllabus to start from, a list of things to fix, and a spreadsheet he can edit and re-import. Schoology's API is closed to his account, so the only way to get a course out is a Common Cartridge export. This skill tells you how to get that export and which script answers which request.

Never call the Schoology API and never drive a browser. Nothing here fetches anything from the web; link checks look at the URL's shape only.

## 0. Find the scripts

All code lives in the `common-cartridge` skill:

```bash
CC=$(find /mnt/skills "$HOME/.claude/skills" .claude/skills "$HOME/Library/Application Support/Claude/local-agent-mode-sessions" \
        -path '*common-cartridge/scripts/cc_build.js' 2>/dev/null | head -1)
CC=${CC%/scripts/cc_build.js}
echo "$CC"
```

The search looks for `scripts/cc_build.js`, not just `SKILL.md`, because an older analysis-only `common-cartridge` may also be installed and has no build scripts. The folders it searches are where claude.ai, Claude Code, and the Claude desktop app (for skills synced from a claude.ai account) keep skills.

If that prints nothing, stop and tell the user: "This needs the common-cartridge skill. Install it, then ask again."

## 1. Get the export

If the user has not given you an `.imscc` file, walk them through it:

1. In the course, open **Course Options** and choose **Save Course to Resources**. Pick a folder in Resources.
2. In **Resources**, find that folder, open its menu, and choose **Export**. Pick **Common Cartridge**.
3. Schoology prepares the file in the background. Download it from **Transfer History** (in Resources). The download link expires after about a day.
4. Upload the `.imscc` here.

A `.zip` that holds `imsmanifest.xml` at its root is the same thing; treat it as an `.imscc`.

## 2. Always start with the inventory

```bash
python3 "$CC/scripts/cc_inventory.py" COURSE.imscc     # or: node "$CC/scripts/cc_review.js" inventory COURSE.imscc
```

It prints counts by type, flags, and the tree. Read it before anything else so you know the course's shape, and mention any flags (dropped videos especially) in your answer.

### Bill can also do this without you

`$CC/assets/Course_Reviewer.html` is an offline page that runs the same engine as `cc_review.js`: he drops an export on it and gets the outline, the problems list, the syllabus skeleton, answer keys, the workbook with its attachments, and a comparison with an older export. Nothing is uploaded. When he asks how to look over a course on his own, or asks for the same report again for another course, offer him that page.

## 3. Pick the subcommand

| The user wants | Run |
| --- | --- |
| An outline, a map, "what's in my course" | `node "$CC/scripts/cc_review.js" outline COURSE.imscc -o outline.md` |
| What is wrong, what to fix, a cleanup list | `node "$CC/scripts/cc_review.js" audit COURSE.imscc -o audit.md` |
| A syllabus | `node "$CC/scripts/cc_review.js" syllabus COURSE.imscc -o syllabus_skeleton.md [--major-min POINTS]` |
| The course in a spreadsheet, to edit or rebuild | `node "$CC/scripts/cc_review.js" workbook COURSE.imscc -o course.xlsx [--files-dir DIR]` |
| What changed between two exports | `node "$CC/scripts/cc_review.js" diff OLD.imscc NEW.imscc -o diff.md` |
| An answer key | `node "$CC/scripts/cc_review.js" keys COURSE.imscc` (JSON), or `workbook` (Questions tab) |

Notes on each:

- **outline** uses the format Bill approved: Unit as H1, Part as H2, Topic or Project as H3, deeper groups as H4, and items as bullets such as `- *Assignment* (10 pts) — **Title**: one-line description`. Do not restyle it.
- **audit** groups findings by type with counts and gives the folder path of each. Duplicate resource identifiers and absolute `/var/www/...` paths are Schoology export artifacts: report them, but say they are not mistakes in the course. "Assignments at 100 points" is a prompt to check, since 100 is Schoology's default when no points were set.
- **syllabus** writes a skeleton: the unit sequence with topics, major assignments per unit (points at or above `--major-min`, default the 75th percentile of assignment points), and a points table by unit and by type. Then **write the syllabus document from the skeleton**, in plain teacher language, and **leave every `[TO FILL IN]` blank visible**: course description, grading policy, grading categories, due dates, materials, and contact details are not in the export. Do not invent them, and do not fill them from general knowledge of the subject. Ask the user for them, or leave them marked.
- **workbook** writes the course workbook (schema in `$CC/references/workbook-schema.md`). Descriptions are kept as the original HTML, files are copied to the `--files-dir` folder (default: next to the workbook), quizzes fill the Questions tab with their answers, and dropped embeds become Link rows with a blank URL and a note so the builder stops until a URL is added. It prints how deep the course is and whether ` > ` was used for folders deeper than two levels. Rebuild with `node "$CC/scripts/cc_build.js" course.xlsx --out course.imscc --files DIR` or the offline builder page.
- **diff** matches items by folder path plus title and lists added, removed, moved, renamed, and changed items (points, description text, URL, quiz questions).

## 4. What an export cannot contain

Say this whenever the request touches it, before the user goes looking:

- **Student work and grades.** An export is the course's materials, never submissions or scores.
- **Rubrics.** Schoology leaves them out of every export, so the workbook's Rubrics tab is always empty.
- **Most embedded videos.** The title survives but the URL does not (an empty resource folder). The teacher must relink them from the originals. The audit lists each one.
- **Due dates and grading categories.** In the one export examined so far, neither was present. Treat them as missing unless the inventory shows otherwise.
- **Quiz question points.** On re-import Schoology sets every question to 1 point.

## 5. Hand over

Give the user the files, then a short summary in plain language: how many items, the biggest problems the audit found (by count), and anything they must fill in by hand. Keep jargon out; if you must name a file format, explain it in one line.
