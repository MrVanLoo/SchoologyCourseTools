# Building cartridges that Schoology imports

Read this before changing `core.js`, or when an import into Schoology behaves oddly. It records what `core.js` emits and why.

Every rule has a status:

- **Verified**: Bill imported a file built this way into Schoology and it worked.
- **Untested**: built to the Common Cartridge 1.2 spec, not yet through a live import. The live test pack (`dist/live-tests/`) exists to settle these.

Keep verified rules exactly as they are. Do not describe an untested rule as working, in code comments, skill text, or anything a teacher reads.

## Status at a glance

| Rule | Status |
| --- | --- |
| Package: ZIP with `imsmanifest.xml` at the root, CC 1.2 namespaces | Verified for quizzes at 1.2 |
| Folders as nested `<item>` nodes inside one `<item identifier="root">` | Verified |
| Assignment resource and bare HTML fragment with the hidden points input | Verified at CC 1.1. At 1.2: untested (live test A) |
| Page: bare fragment, no points input | Verified |
| Link (`imswl_xmlv1p2`) | Verified at CC 1.1. At 1.2: untested (live test B) |
| Quiz: QTI 1.2 multiple choice, multiple response, true/false | Verified (nine real quizzes) |
| Quiz: short answer (`cc.fib.v0p1`) and essay (`cc.essay.v0p1`) | Untested (live test C) |
| Discussion (`imsdt_xmlv1p2`) | Untested (live test B) |
| File (`webcontent`, href is the file) | Untested (live test B) |
| Rubric as an HTML table at the end of the description | Untested: built once before, import result unknown (live test A) |
| Matching question through QTI 2.1 import (not a cartridge) | Untested (live test D) |
| Folders three levels deep | Untested (live test B). Two levels are verified. |

## Package

- An `.imscc` is a ZIP with `imsmanifest.xml` at the root. `core.js` writes the manifest as the first entry.
- Emit Common Cartridge 1.2. The namespaces and `schemaLocation` strings are in `core.js`. Schoology's own exports are 1.2.
- Folders are nested `<item>` nodes with a `<title>` and no `identifierref`, all inside one `<item identifier="root">`. **Anything not in the tree lands in Schoology's Unused Resources folder.**
- Each resource's files live in a directory named after the resource identifier (`R_0003/index.html`). `cc_inventory.py` depends on this layout.
- The manifest `identifier` is the only value that changes from build to build (it is a timestamp). Everything else is deterministic, so two builds of the same input differ only there.

## Assignment

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

- No `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>`. **A full document makes Schoology duplicate the title into the description and ignore the points.**
- The title appears nowhere in the HTML. Schoology takes the assignment name from the manifest item `<title>`.
- Points exist only in that hidden input, appended last, with the attributes in that order. There is no manifest field for points. Without the input, Schoology defaults the assignment to 100.
- The empty `<metadata/>` stays.
- `core.js` strips any copy of the points input from the description before appending its own, so there is never more than one.

## Page

Same as an assignment without `intendeduse` and without the points input. Bare fragment, no title in the file.

## Link

`imswl_xmlv1p2` resource with a `weblink.xml`:

```xml
<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imswl_v1p2" ...>
  <title>Truss (Wikipedia)</title>
  <url href="https://en.wikipedia.org/wiki/Truss" target="_blank"/>
</webLink>
```

`&` in a URL is written as `&amp;` in the XML. Readers must unescape it (ElementTree does this for you).

## Quiz

Resource type `imsqti_xmlv1p2/imscc_xmlv1p2/assessment` with `<metadata/>` and one `assessment_qti.xml`. QTI 1.2 with the Common Cartridge profiles:

| Profile | Scoring |
| --- | --- |
| `cc.multiple_choice.v0p1` | one `varequal` naming the right choice |
| `cc.multiple_response.v0p1` | all or nothing: an `<and>` of each right choice plus a `<not>` around each wrong one |
| `cc.true_false.v0p1` | choices with idents `true` and `false` |
| `cc.fib.v0p1` (untested) | one `respcondition` per accepted answer, each with a single `varequal case="No"` |
| `cc.essay.v0p1` (untested) | `response_str`, no scoring condition, `qmd_computerscored` = No |

- Prompts and choice text are stored as HTML inside `mattext texttype="text/html"`, escaped once for HTML and once for XML.
- Common Cartridge has no matching or ordering type. Leave those questions out, list them on the checklist, and never fake them as another type.
- **Schoology resets every imported question to 1 point.** The checklist says so.

## Discussion (untested)

`imsdt_xmlv1p2` with a `discussion.xml`:

```xml
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imsdt_v1p2" ...>
  <title>Design tradeoffs</title>
  <text texttype="text/html">&lt;p&gt;escaped HTML&lt;/p&gt;</text>
</topic>
```

## File (untested)

A `webcontent` resource whose `href` is the file itself, `R_0005/handout.pdf`. `core.js` replaces spaces and unusual characters in the file name with `_`, so the href never needs URL encoding.

## Known Schoology behavior

- **Images** embedded in a description are moved to Unused Resources on import, and the teacher has to re-embed them. Do not embed images. `core.js` warns when a description contains `<img` (including a Markdown image).
- **Rubrics** cannot be imported by any file. The cartridge export omits them and nothing in the import reads one. The toolkit handles rubrics two ways: an HTML table appended to the assignment description (import result unknown, so it is in live test A), and an entry sheet on the after-import checklist that the teacher types into Schoology's rubric editor once.
- **Embedded videos** are mostly dropped on export. The resource directory exists and is empty. `cc_inventory.py` reports this as `missing_video`.
- **Export artifacts**: exports contain duplicate resource identifiers and some absolute `href` paths (`/var/www/html/sgy_pkg/...`). Report them, do not fail on them.
- **Due dates, grading categories, and rubric attachment** cannot be carried in a cartridge. They are printed on the checklist.

## Import path

Resources, Import, Common Cartridge, pick the file. When it finishes, open the new folder in Resources and use Add to Course.
