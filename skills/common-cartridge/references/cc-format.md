# Common Cartridge format reference

Read this when parsing quizzes, resolving image paths, or debugging vendor-specific oddities. For a general map of a cartridge, the `cc_inventory.py` script already handles the common cases; this file is for going deeper.

## Manifest structure

`imsmanifest.xml` (root of the ZIP) has:

- `<metadata>` — schema name/version and course title (`<lomimscc:lom>/general/title/string`).
- `<organizations>/<organization>` — the course tree. Nested `<item>` elements. An item with a `title` but no `identifierref` is a **grouping/folder** (unit, part, topic). An item with `identifierref="ccresXXXX"` is a **leaf** pointing to a resource. Order in the file is the display order.
- `<resources>` — one `<resource identifier="..." type="..." href="...">` per link/page/file. The `type` string is how you classify it.

Always match XML tags by **local name**, ignoring the namespace prefix — namespaces differ across CC 1.0–1.3 and across vendors. In ElementTree, iterate and compare `elem.tag.split('}')[-1]`.

## Resource `type` strings

| `type` (starts with)                     | Meaning        | Where the content is |
| ---------------------------------------- | -------------- | -------------------- |
| `imswl_xmlv1p2` (imswl_*)                | Web link       | `<url href="...">` inside the resource's `.xml` |
| `imsdt_xmlv1p2` (imsdt_*)                | Discussion     | `<text>` inside the `.xml` (HTML-encoded) |
| `imsqti_...` / `.../assessment`          | Quiz (QTI)     | QTI XML — see below |
| `webcontent` + `.html`, `intendeduse="assignment"` | Assignment | the `.html` file |
| `webcontent` + `.html` (no assignment use) | Page/content | the `.html` file |
| `webcontent` + file extension (.pdf/.docx/.png/…) | Attached file | the file itself |
| `webcontent` + empty folder / href ending `/` | Dropped embed | nothing — content was not exported |
| `associatedcontent/...`                  | Supporting HTML (e.g. "learning goals") | the `.html` file |
| `imsbasiclti` / `imslti...`              | LTI tool link  | XML descriptor with launch URL |

## Extracting a QTI answer key

QTI 1.2 assessment XML (`questestinterop/assessment`):

- Each question is an `<item>`. Its type is in `itemmetadata` → `cc_profile` (`cc.multiple_choice.v0p1`, `cc.multiple_response.v0p1`, `cc.true_false.v0p1`, `cc.fib.v0p1` fill-in-blank, `cc.essay.v0p1`, etc.).
- The prompt is in `presentation/material/mattext` (often HTML-encoded; unescape it). Images use the `$IMS-CC-FILEBASE$` placeholder — see below.
- Answer choices are `response_label` elements, each with an `ident` and its text in `material/mattext`.
- **The correct answer(s)** are in `resprocessing/respcondition`: a `<varequal respident="...">IDENT</varequal>` names the correct `response_label` ident, and `<setvar ... varname="SCORE">100</setvar>` marks the scoring branch. Multiple-response questions wrap several `varequal` in an `<and>`. Map each winning ident back to its `response_label` text to produce a human-readable key.

Count questions by counting `<item ident=` occurrences.

## `$IMS-CC-FILEBASE$` image paths

Inside HTML pages and QTI text, embedded images reference `$IMS-CC-FILEBASE$../resources/filename.png`. `$IMS-CC-FILEBASE$` resolves to the cartridge root, so the real file is at `<extract-dir>/resources/filename.png`. Replace the placeholder with the extract path (or a web path) when rendering or extracting content.

## Vendor-specific quirks

**Schoology** (resource folders named `ccresNNNNNNN/`):
- Embedded videos are frequently exported as **empty folders** — title in the manifest, no URL anywhere. Unrecoverable from the file. (Some videos instead survive as `imswl` web links with a real YouTube URL — check both.)
- Assignment HTML often carries a hidden field `<input name="sch-grade-item-max-points" value="N">` — that's the point value.
- Duplicate `<resource>` entries and duplicate tree items are common.
- Broken absolute hrefs like `/var/www/html/sgy_pkg/...` appear for some discussion/attachment resources; they don't resolve.

**Canvas**: adds `course_settings/` and non-standard metadata; assignment/quiz content may live in `canvas_export.txt` or per-item folders. QTI is standard.

**Moodle / Blackboard / D2L**: standard CC structure; differences are mostly in how richly they populate metadata and which optional resource types they use.

## Sanity checks

- Total leaf items in the tree should roughly equal usable resources; a big gap usually means dropped embeds.
- If `imsmanifest.xml` is missing at the root, it is not a valid Common Cartridge (or it's double-zipped — check for a nested archive).
