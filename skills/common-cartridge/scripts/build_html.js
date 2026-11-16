#!/usr/bin/env node
/*
 * build_html.js: stitches the engines (core.js, review_core.js), the vendored
 * libraries, and the page UIs into two self-contained pages that work from
 * file:// with no network:
 *
 *   Course_Cartridge_Builder.html  workbook -> cartridge + checklist
 *   Course_Reviewer.html           export -> outline, audit, syllabus, answer keys,
 *                                   workbook, and a comparison of two exports
 *
 *   node build_html.js [OUT_DIR]
 *
 * OUT_DIR defaults to ../assets. Run make_template.py first: the reviewer page
 * carries a copy of Course_Workbook_Template.xlsx inside it.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var here = __dirname;
var outDir = process.argv[2] || path.join(here, '..', 'assets');

function inline(file) {
  // A literal "</script" inside a library would end the script tag early.
  return fs.readFileSync(path.join(here, file), 'utf8').replace(/<\/script/gi, '<\\/script');
}

var CSS = [
  ':root{--ink:#1c2430;--muted:#4a5563;--line:#9aa3ad;--soft:#eef1f4;--bg:#fff;--accent:#1a4f8b;--err:#a4161a;--errbg:#fdeeee;--warn:#7a4b00;--warnbg:#fff6e0;--ok:#1d6b35}',
  '*{box-sizing:border-box}',
  'body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 Arial,Helvetica,sans-serif}',
  'main{max-width:860px;margin:0 auto;padding:24px 16px 64px}',
  'h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:0 0 8px}',
  '.lead{margin:0 0 4px}.private{margin:0 0 24px;color:var(--muted)}',
  'section{border:1px solid var(--line);border-radius:6px;padding:16px;margin:0 0 16px}',
  '.num{display:inline-block;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;text-align:center;line-height:26px;font-size:15px;margin-right:8px}',
  'label.field{display:block;font-weight:bold;margin-bottom:4px}',
  'input[type=text]{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:4px}',
  '.drop{border:2px dashed var(--line);border-radius:6px;padding:20px;text-align:center;background:var(--soft)}',
  '.drop.over{border-color:var(--accent);background:#e3ecf7}',
  '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
  '.btn{display:inline-block;font:inherit;font-weight:bold;padding:9px 16px;border-radius:4px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}',
  '.btn.secondary{background:#fff;color:var(--accent)}',
  '.btn[disabled]{background:#c9ced4;border-color:#c9ced4;color:#4a5563;cursor:not-allowed}',
  'input:focus-visible,button:focus-visible,.sr:focus-visible+label,input[type=file]:focus-visible+label{outline:3px solid #f2a900;outline-offset:2px}',
  '.status{margin:8px 0 0;color:var(--muted)}',
  '.checkline{display:flex;gap:8px;align-items:flex-start;margin-top:12px}.checkline input{width:18px;height:18px;margin-top:3px}',
  '.msgs{border-radius:6px;padding:12px 16px;margin:0 0 12px}.msgs h3{margin:0 0 6px;font-size:16px}.msgs ul{margin:0;padding-left:20px}',
  '.errors{background:var(--errbg);border:1px solid var(--err)}.errors h3{color:var(--err)}',
  '.warnings{background:var(--warnbg);border:1px solid #c58b00}.warnings h3{color:var(--warn)}',
  '.tree{list-style:none;padding-left:0;margin:0}.tree ul{list-style:none;padding-left:22px;margin:0}',
  '.tree li{padding:2px 0}.folder{font-weight:bold}',
  '.tag{display:inline-block;min-width:88px;font-size:13px;font-weight:bold;padding:1px 6px;border-radius:3px;margin-right:8px;background:var(--soft);border:1px solid var(--line);text-align:center}',
  '.pts{color:var(--muted)}',
  '.files{margin:8px 0 0;padding-left:20px}.have{color:var(--ok)}.miss{color:var(--err);font-weight:bold}',
  '.downloads{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}',
  '.counts{margin:0 0 12px}',
  '@media (max-width:520px){.tag{min-width:0}}'
].join('\n');

var BODY = [
  '<main>',
  '<h1>Course cartridge builder</h1>',
  '<p class="lead">Turn a course workbook into a file you can import into Schoology.</p>',
  '<p class="private">Nothing is uploaded: everything happens on this computer, and it works with no internet.</p>',

  '<section aria-labelledby="s1"><h2 id="s1"><span class="num">1</span>Course title</h2>',
  '<label class="field" for="title">Name of the folder Schoology will create</label>',
  '<input type="text" id="title" autocomplete="off" placeholder="For example: Principles of Engineering, Unit 2">',
  '</section>',

  '<section aria-labelledby="s2"><h2 id="s2"><span class="num">2</span>Workbook</h2>',
  '<div class="drop" id="wbDrop"><p style="margin:0 0 10px">Drag the course workbook (.xlsx) here, or</p>',
  '<input class="sr" type="file" id="wbInput" accept=".xlsx,.xlsm,.xls"><label for="wbInput" class="btn">Choose workbook</label></div>',
  '<p class="status" id="wbStatus" aria-live="polite">No workbook yet.</p>',
  '<div class="checkline"><input type="checkbox" id="rubricTable" checked><label for="rubricTable">Add each rubric as a table at the end of its assignment description, so students can read it. (The gradable rubric still has to be typed into Schoology. The checklist shows how.)</label></div>',
  '</section>',

  '<section aria-labelledby="s3"><h2 id="s3"><span class="num">3</span>Attachments</h2>',
  '<p style="margin:0 0 10px">Only needed if the workbook has File rows. Add the files those rows name. You can also drop the attachments .zip that the Course reviewer saves.</p>',
  '<div class="drop" id="fDrop"><p style="margin:0 0 10px">Drag the files here, or</p>',
  '<input class="sr" type="file" id="fInput" multiple><label for="fInput" class="btn secondary">Choose files</label></div>',
  '<div id="fileList" aria-live="polite"></div>',
  '</section>',

  '<section aria-labelledby="s4"><h2 id="s4"><span class="num">4</span>Check and download</h2>',
  '<div id="result" aria-live="polite"><p class="status">Add a workbook to see what will be built.</p></div>',
  '<div class="downloads">',
  '<button type="button" class="btn" id="dlCart" disabled>Download cartridge (.imscc)</button>',
  '<button type="button" class="btn secondary" id="dlCheck" disabled>Download after-import checklist</button>',
  '</div>',
  '<p class="status">Then in Schoology: Resources, Import, Common Cartridge. When it finishes, use Add to Course on the new folder. Print the checklist and work through it.</p>',
  '</section>',
  '</main>'
].join('\n');

var APP = function () {
  /* eslint-disable no-var */
  var $ = function (id) { return document.getElementById(id); };
  var state = { wbName: '', sheets: null, files: {}, result: null, readError: '' };

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slug(t) { return (String(t).trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || 'course'); }
  function readBytes(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(new Uint8Array(r.result)); };
      r.onerror = function () { rej(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  function loadWorkbook(file) {
    // A new workbook starts over: results, attachments, and messages are cleared.
    var hadFiles = Object.keys(state.files).length > 0;
    state = { wbName: file.name, sheets: null, files: {}, result: null, readError: '' };
    if (!$('title').value.trim() || $('title').dataset.auto === '1') {
      $('title').value = file.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ');
      $('title').dataset.auto = '1';
    }
    $('wbStatus').textContent = 'Reading ' + file.name + '...';
    readBytes(file).then(function (bytes) {
      try { state.sheets = CCCore.readWorkbook(XLSX, bytes); }
      catch (e) { state.readError = 'This file could not be read as a course workbook: ' + e.message; }
      $('wbStatus').textContent = state.readError ? 'Could not read ' + file.name + '.' : 'Loaded ' + file.name + '.' + (hadFiles ? ' The attachments from before were cleared, so add them again.' : '');
      rebuild();
    }, function () { state.readError = 'The file could not be opened.'; rebuild(); });
  }

  // A .zip that no File row names is a bundle of attachments (for example the one
  // the Course reviewer saves), so its files are added one by one.
  function addFiles(list) {
    var named = (state.needed || []).map(function (it) { return it.file.split(/[\\/]/).pop().toLowerCase(); });
    var jobs = Array.prototype.map.call(list, function (f) {
      return readBytes(f).then(function (b) {
        if (/\.zip$/i.test(f.name) && named.indexOf(f.name.toLowerCase()) < 0) {
          return JSZip.loadAsync(b).then(function (z) {
            var inner = Object.keys(z.files).filter(function (n) { return !z.files[n].dir && !/(^|\/)(__MACOSX|\.)/.test(n); });
            return Promise.all(inner.map(function (n) {
              return z.files[n].async('uint8array').then(function (x) { state.files[n.split('/').pop()] = x; });
            }));
          }, function () { state.files[f.name] = b; });
        }
        state.files[f.name] = b;
      });
    });
    Promise.all(jobs).then(rebuild);
  }

  function rebuild() {
    state.result = null;
    if (state.sheets) {
      var input = CCCore.parseAll(state.sheets);
      state.result = CCCore.build(input, {
        title: $('title').value.trim() || 'Imported course',
        marked: marked, files: state.files, rubricTable: $('rubricTable').checked
      });
      state.needed = input.course.items.filter(function (it) { return it.type === 'File'; });
    }
    render();
  }

  function renderFiles() {
    var names = Object.keys(state.files);
    var need = (state.needed || []);
    var h = '';
    if (need.length) {
      h += '<ul class="files">';
      need.forEach(function (it) {
        var want = it.file.split(/[\\/]/).pop().toLowerCase();
        var ok = names.some(function (n) { return n.toLowerCase() === want; });
        h += '<li>' + esc(it.file) + ' (for "' + esc(it.title) + '"): ' + (ok ? '<span class="have">added</span>' : '<span class="miss">still needed</span>') + '</li>';
      });
      h += '</ul>';
    } else if (state.sheets) {
      h += '<p class="status">This workbook has no File rows.</p>';
    }
    var extra = names.filter(function (n) { return !need.some(function (it) { return it.file.split(/[\\/]/).pop().toLowerCase() === n.toLowerCase(); }); });
    if (extra.length) h += '<p class="status">Added but not used by any File row: ' + extra.map(esc).join(', ') + '</p>';
    $('fileList').innerHTML = h;
  }

  function treeHtml(lines) {
    var h = '<ul class="tree">', depth = 0;
    lines.forEach(function (l, i) {
      while (depth > l.depth) { h += '</ul></li>'; depth--; }
      if (l.folder !== undefined) {
        h += '<li><span class="folder">' + esc(l.folder) + '</span><ul>';
        depth++;
      } else {
        h += '<li><span class="tag">' + esc(l.type) + '</span>' + esc(l.title) +
          (l.type === 'Assignment' ? ' <span class="pts">(' + (l.points === null ? 'no points: Schoology will use 100' : l.points + ' pts') + ')</span>' : '') + '</li>';
      }
    });
    while (depth > 0) { h += '</ul></li>'; depth--; }
    return h + '</ul>';
  }

  function render() {
    renderFiles();
    var r = state.result, h = '';
    var blocked = true;
    if (state.readError) {
      h = '<div class="msgs errors" role="alert"><h3>Cannot build</h3><ul><li>' + esc(state.readError) + '</li></ul></div>';
    } else if (r) {
      var rep = r.report;
      if (rep.errors.length) {
        h += '<div class="msgs errors" role="alert"><h3>Fix these before downloading (' + rep.errors.length + ')</h3><ul>' +
          rep.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
      }
      if (rep.warnings.length) {
        h += '<div class="msgs warnings"><h3>Check these (' + rep.warnings.length + '). They do not stop the download.</h3><ul>' +
          rep.warnings.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
      }
      if (rep.omitted.length) {
        h += '<div class="msgs warnings"><h3>Questions left out (' + rep.omitted.length + ')</h3><p style="margin:0 0 6px">Common Cartridge has no matching or ordering type. They are listed on the checklist to add by hand.</p><ul>' +
          rep.omitted.map(function (o) { return '<li>' + esc(o.quiz) + ': ' + esc(o.type) + ': ' + esc(o.prompt) + '</li>'; }).join('') + '</ul></div>';
      }
      var parts = CCCore.TYPES.filter(function (t) { return rep.counts[t]; }).map(function (t) { return rep.counts[t] + ' ' + t; });
      if (!rep.errors.length) {
        blocked = false;
        h += '<p class="counts"><strong>Ready.</strong> ' + rep.items + ' items in ' + rep.folders + ' folders: ' + esc(parts.join(', ')) + '.</p>';
      }
      h += '<h3 style="font-size:16px;margin:12px 0 6px">What Schoology will show</h3>' + treeHtml(r.tree);
    } else {
      h = '<p class="status">Add a workbook to see what will be built.</p>';
    }
    $('result').innerHTML = h;
    $('dlCart').disabled = blocked;
    $('dlCheck').disabled = blocked;
  }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function wireDrop(zone, onFiles) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
  }

  // Dropping a file anywhere else should not navigate away from the page.
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  wireDrop($('wbDrop'), function (fl) { loadWorkbook(fl[0]); });
  wireDrop($('fDrop'), addFiles);
  $('wbInput').addEventListener('change', function () { if (this.files.length) loadWorkbook(this.files[0]); this.value = ''; });
  $('fInput').addEventListener('change', function () { if (this.files.length) addFiles(this.files); this.value = ''; });
  $('rubricTable').addEventListener('change', rebuild);
  $('title').addEventListener('input', function () { this.dataset.auto = '0'; if (state.sheets) rebuild(); });
  $('dlCart').addEventListener('click', function () {
    if (!state.result || state.result.report.errors.length) return;
    var name = slug($('title').value || 'course') + '.imscc';
    CCCore.zip(JSZip, state.result.files, 'blob').then(function (b) { save(b, name); });
  });
  $('dlCheck').addEventListener('click', function () {
    if (!state.result || state.result.report.errors.length) return;
    save(new Blob([state.result.checklistHtml], { type: 'text/html' }), slug($('title').value || 'course') + '_After_Import.html');
  });
};


// ======================================================================== reviewer page

var REVIEW_CSS = [
  '.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}',
  '.tabs button{font:inherit;padding:7px 14px;border-radius:4px;border:1px solid var(--accent);background:#fff;color:var(--accent);cursor:pointer}',
  '.tabs button[aria-pressed=true]{background:var(--accent);color:#fff;font-weight:bold}',
  '.report{border:1px solid var(--line);border-radius:6px;padding:4px 18px 12px;max-height:620px;overflow:auto;background:#fff}',
  '.report h1{font-size:21px;margin:16px 0 8px}.report h2{font-size:18px;margin:16px 0 6px}.report h3{font-size:16px;margin:14px 0 6px}.report h4{font-size:15px;margin:12px 0 4px}',
  '.report table{border-collapse:collapse;margin:8px 0}.report th,.report td{border:1px solid var(--line);padding:4px 8px;text-align:left}',
  '.report blockquote{margin:8px 0;padding:4px 12px;border-left:4px solid var(--line);color:var(--muted)}',
  '.report code{background:var(--soft);padding:0 3px;border-radius:3px;word-break:break-all}',
  '.report a{color:var(--accent);word-break:break-all}',
  '.facts{margin:8px 0 0;padding-left:20px}',
  'details{margin:0 0 12px}summary{cursor:pointer;font-weight:bold;color:var(--accent)}details ol{margin:8px 0 0}',
  '.inline{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.inline input{width:110px}',
  '.note{color:var(--muted)}',
  '[hidden]{display:none !important}'
].join('\n');

var REVIEW_BODY = [
  '<main>',
  '<h1>Course reviewer</h1>',
  '<p class="lead">Look over a Schoology course export: an outline, a list of problems to fix, a syllabus draft, answer keys, or a spreadsheet you can edit and rebuild.</p>',
  '<p class="private">Nothing is uploaded: everything happens on this computer, and it works with no internet.</p>',

  '<section aria-labelledby="r1"><h2 id="r1"><span class="num">1</span>Course export</h2>',
  '<details><summary>How to get the export from Schoology</summary><ol>',
  '<li>In the course, open Course Options and choose Save Course to Resources.</li>',
  '<li>In Resources, open that folder\'s menu and choose Export, then Common Cartridge.</li>',
  '<li>Download the file from Transfer History. The link stops working after about a day.</li></ol></details>',
  '<div class="drop" id="cDrop"><p style="margin:0 0 10px">Drag the export (.imscc) here, or</p>',
  '<input class="sr" type="file" id="cInput" accept=".imscc,.zip"><label for="cInput" class="btn">Choose export</label></div>',
  '<div id="summary" aria-live="polite"><p class="status">No export yet.</p></div>',
  '</section>',

  '<section aria-labelledby="r2"><h2 id="r2"><span class="num">2</span>Reports</h2>',
  '<div class="tabs" role="group" aria-label="Report">',
  '<button type="button" data-r="outline" aria-pressed="true">Outline</button>',
  '<button type="button" data-r="audit" aria-pressed="false">Problems to fix</button>',
  '<button type="button" data-r="syllabus" aria-pressed="false">Syllabus draft</button>',
  '<button type="button" data-r="keys" aria-pressed="false">Answer keys</button>',
  '</div>',
  '<div class="inline" id="majorRow" hidden><label for="majorMin">Count assignments as major at or above</label><input type="text" inputmode="decimal" id="majorMin" placeholder="auto"><span class="note">points. Leave blank to use the top quarter of point values.</span></div>',
  '<div class="report" id="report" tabindex="0" aria-live="polite"><p class="status">Add an export to see the reports.</p></div>',
  '<div class="downloads"><button type="button" class="btn secondary" id="dlReport" disabled>Download this report (.md)</button></div>',
  '<p class="status">The .md files open in any text editor, and paste cleanly into a Google Doc.</p>',
  '</section>',

  '<section aria-labelledby="r3"><h2 id="r3"><span class="num">3</span>Spreadsheet</h2>',
  '<p style="margin:0 0 10px">The whole course as a course workbook. Edit it, then turn it back into a cartridge with the Course cartridge builder.</p>',
  '<div id="wbInfo"><p class="status">Add an export first.</p></div>',
  '<div class="downloads">',
  '<button type="button" class="btn" id="dlWb" disabled>Download workbook (.xlsx)</button>',
  '<button type="button" class="btn secondary" id="dlFiles" disabled>Download attachments (.zip)</button>',
  '</div>',
  '</section>',

  '<section aria-labelledby="r4"><h2 id="r4"><span class="num">4</span>Compare with another export</h2>',
  '<p style="margin:0 0 10px">Optional. Add an older export of the same course to see what was added, removed, moved, renamed, or changed since then.</p>',
  '<div class="drop" id="oDrop"><p style="margin:0 0 10px">Drag the older export here, or</p>',
  '<input class="sr" type="file" id="oInput" accept=".imscc,.zip"><label for="oInput" class="btn secondary">Choose older export</label></div>',
  '<div id="diffOut" aria-live="polite"></div>',
  '<div class="downloads"><button type="button" class="btn secondary" id="dlDiff" disabled>Download comparison (.md)</button></div>',
  '</section>',
  '</main>'
].join('\n');

var REVIEW_APP = function () {
  /* eslint-disable no-var */
  var $ = function (id) { return document.getElementById(id); };
  var state = { course: null, name: '', report: 'outline', old: null, oldName: '', diff: null, rows: null, error: '' };
  var TAGS = { assignment: 'Assignment', page: 'Page', link: 'Link', video: 'Video', discussion: 'Discussion', file: 'File', quiz: 'Quiz', missing_video: 'Dropped video', missing: 'Dropped item', other: 'Other' };

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slug(t) { return (String(t).trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || 'course'); }
  function readBytes(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(new Uint8Array(r.result)); };
      r.onerror = function () { rej(r.error); };
      r.readAsArrayBuffer(file);
    });
  }
  function templateBytes() {
    var bin = atob(TEMPLATE_B64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Report text comes from the export, so "<" and "&" are escaped before Markdown
  // is rendered: no tag in a course title can turn into live HTML here.
  function md(text) { return marked.parse(String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;'), { gfm: true }); }

  function keysMarkdown(keys) {
    var L = ['# Answer keys: ' + state.course.title, ''];
    if (!keys.length) L.push('This course has no quizzes.');
    keys.forEach(function (k) {
      L.push('## ' + k.quiz, '', 'Folder: ' + k.folder, '');
      k.questions.forEach(function (q, i) {
        var ans = q.type === 'mc' || q.type === 'mr' ? q.correct_letters : (q.answers ? q.answers.join(' | ') : '');
        var type = { mc: 'Multiple choice', mr: 'Select all', tf: 'True/False', fib: 'Short answer', essay: 'Essay' }[q.type] || 'Unknown type';
        L.push((i + 1) + '. ' + q.prompt + ' *(' + type + ')*');
        (q.choices || []).forEach(function (ch, j) { L.push('    - ' + 'ABCDEFGH'.charAt(j) + '. ' + ch); });
        L.push('', '    **Answer:** ' + (q.type === 'essay' ? 'graded by hand' : (ans || '(none marked)')), '');
      });
    });
    return L.join('\n');
  }
  function reportText() {
    var c = state.course;
    if (state.report === 'outline') return CCReview.outline(c);
    if (state.report === 'audit') return CCReview.audit(c).markdown;
    if (state.report === 'syllabus') {
      var v = $('majorMin').value.trim(), n = v === '' ? null : Number(v);
      return CCReview.syllabus(c, { majorMin: n !== null && isFinite(n) ? n : null });
    }
    return keysMarkdown(CCReview.answerKeys(c));
  }
  var NAMES = { outline: 'outline', audit: 'problems', syllabus: 'syllabus_draft', keys: 'answer_keys' };

  function loadExport(file, which) {
    var label = which === 'old' ? $('diffOut') : $('summary');
    label.innerHTML = '<p class="status">Reading ' + esc(file.name) + '...</p>';
    readBytes(file).then(function (bytes) { return CCReview.load(JSZip, bytes); }).then(function (c) {
      if (which === 'old') { state.old = c; state.oldName = file.name; }
      else {
        // A new export starts over, including any comparison.
        state = { course: c, name: file.name, report: state.report, old: null, oldName: '', diff: null, rows: CCReview.workbookRows(c), error: '' };
        $('diffOut').innerHTML = '';
      }
      render();
    }, function (e) {
      if (which === 'old') { state.old = null; label.innerHTML = '<div class="msgs errors" role="alert"><h3>Could not read ' + esc(file.name) + '</h3><ul><li>' + esc(e.message) + '</li></ul></div>'; $('dlDiff').disabled = true; return; }
      state = { course: null, name: file.name, report: state.report, old: null, oldName: '', diff: null, rows: null, error: e.message };
      render();
    });
  }

  function render() {
    var c = state.course;
    if (state.error) {
      $('summary').innerHTML = '<div class="msgs errors" role="alert"><h3>Could not read ' + esc(state.name) + '</h3><ul><li>' + esc(state.error) + '</li><li>An export from Schoology ends in .imscc. A .zip works only if it has imsmanifest.xml inside.</li></ul></div>';
    } else if (c) {
      var inv = CCReview.inventory(c), f = inv.flags;
      var counts = Object.keys(inv.counts).map(function (k) { return inv.counts[k] + ' ' + (TAGS[k] || k); }).join(', ');
      var h = '<p class="counts" style="margin-top:12px"><strong>' + esc(c.title) + '</strong>: ' + c.items.length + ' items in ' + c.folders.length + ' folders' + (counts ? ' (' + esc(counts) + ')' : '') + '.</p><ul class="facts">';
      if (f.dropped_embeds.length) h += '<li><strong>' + f.dropped_embeds.length + ' embedded video(s) or item(s) were dropped by the export.</strong> Only the title survives. See Problems to fix.</li>';
      if (f.embedded_links.length) h += '<li>' + f.embedded_links.length + ' YouTube link(s) are inside descriptions, which is easy to miss. See the outline.</li>';
      if (f.duplicate_resources.length || f.broken_absolute_hrefs.length) h += '<li>The export has duplicate or broken internal references. These come from Schoology\'s export, not from your course.</li>';
      h += '<li class="note">No export contains student work, grades, or rubrics.</li></ul>';
      $('summary').innerHTML = h;
    } else $('summary').innerHTML = '<p class="status">No export yet.</p>';

    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.r === state.report)); });
    $('majorRow').hidden = state.report !== 'syllabus';
    $('report').innerHTML = c ? md(reportText()) : '<p class="status">Add an export to see the reports.</p>';
    if (c && state.report === 'syllabus') $('report').insertAdjacentHTML('afterbegin', '<div class="msgs warnings"><h3>This is a starting point, not a finished syllabus.</h3>Everything marked TO FILL IN is missing from the export. Fill it in or delete it.</div>');
    $('dlReport').disabled = !c;

    if (c) {
      var w = state.rows;
      var m = '<p class="counts">' + w.course.length + ' rows, ' + w.questions.length + ' quiz questions' + (w.files.length ? ', ' + w.files.length + ' attachment(s)' : '') + '.</p><ul class="facts">';
      var isSub = function (x) { return x !== undefined && /^\s+-\s+/.test(x); };
      w.messages.forEach(function (x, i) {
        // "  - detail" lines are listed under the message before them
        var sub = isSub(x), nextSub = isSub(w.messages[i + 1]), prevSub = i > 0 && isSub(w.messages[i - 1]);
        if (sub && !prevSub) m += '<ul>';
        m += '<li>' + esc(x.replace(/^\s+-\s+/, '')) + (sub || !nextSub ? '</li>' : '');
        if (sub && !nextSub) m += '</ul></li>';
      });
      m += '</ul>';
      if (w.files.length) m += '<p class="status">When you rebuild, drop the attachments .zip into the builder\'s Attachments box.</p>';
      $('wbInfo').innerHTML = m;
    } else $('wbInfo').innerHTML = '<p class="status">Add an export first.</p>';
    $('dlWb').disabled = !c;
    $('dlFiles').disabled = !(c && state.rows.files.length);

    state.diff = null;
    if (c && state.old) {
      state.diff = CCReview.diff(state.old, c);
      $('diffOut').innerHTML = '<p class="status">Comparing ' + esc(state.oldName) + ' (older) with ' + esc(state.name) + ' (newer).</p><div class="report">' + md(state.diff.markdown) + '</div>';
    } else if (state.old && !c) $('diffOut').innerHTML = '<p class="status">Add the newer export in step 1 too.</p>';
    else if (state.old) $('diffOut').innerHTML = '';
    $('dlDiff').disabled = !state.diff;
  }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function wireDrop(zone, onFiles) {
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
  }
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  wireDrop($('cDrop'), function (fl) { loadExport(fl[0], 'new'); });
  wireDrop($('oDrop'), function (fl) { loadExport(fl[0], 'old'); });
  $('cInput').addEventListener('change', function () { if (this.files.length) loadExport(this.files[0], 'new'); this.value = ''; });
  $('oInput').addEventListener('change', function () { if (this.files.length) loadExport(this.files[0], 'old'); this.value = ''; });
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () { state.report = b.dataset.r; render(); });
  });
  $('majorMin').addEventListener('input', function () { if (state.course) render(); });
  $('dlReport').addEventListener('click', function () {
    if (!state.course) return;
    save(new Blob([reportText()], { type: 'text/markdown' }), slug(state.course.title) + '_' + NAMES[state.report] + '.md');
  });
  $('dlDiff').addEventListener('click', function () {
    if (!state.diff) return;
    save(new Blob([state.diff.markdown], { type: 'text/markdown' }), slug(state.course.title) + '_changes.md');
  });
  $('dlWb').addEventListener('click', function () {
    if (!state.course) return;
    var w = state.rows;
    CCReview.writeWorkbook(JSZip, templateBytes(), { Course: w.course, Rubrics: w.rubrics, Questions: w.questions }).then(function (bytes) {
      save(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), slug(state.course.title) + '_workbook.xlsx');
    });
  });
  $('dlFiles').addEventListener('click', function () {
    if (!state.course || !state.rows.files.length) return;
    var z = new JSZip();
    state.rows.files.forEach(function (f) { z.file(f.name, f.bytes); });
    z.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (b) { save(b, slug(state.course.title) + '_attachments.zip'); });
  });
};

// ======================================================================== write the pages

function page(title, css, body, scripts, app, prelude) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + title + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + body + '\n' +
    scripts.map(function (f) { return '<script>\n' + inline(f) + '\n</script>\n'; }).join('') +
    '<script>\n' + (prelude || '') + '(' + app.toString().replace(/<\/script/gi, '<\\/script') + ')();\n</script>\n</body>\n</html>\n';
}
function write(name, html) {
  var out = path.join(outDir, name);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html);
  console.log('Wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
}

write('Course_Cartridge_Builder.html', page('Course cartridge builder', CSS, BODY,
  ['vendor/xlsx.mini.min.js', 'vendor/jszip.min.js', 'vendor/marked.min.js', 'core.js'], APP));

var templatePath = path.join(here, '..', 'assets', 'Course_Workbook_Template.xlsx');
if (!fs.existsSync(templatePath)) { console.error('ERROR: ' + templatePath + ' is missing. Run make_template.py first.'); process.exit(1); }
write('Course_Reviewer.html', page('Course reviewer', CSS + '\n' + REVIEW_CSS, REVIEW_BODY,
  ['vendor/jszip.min.js', 'vendor/marked.min.js', 'review_core.js'], REVIEW_APP,
  'var TEMPLATE_B64 = "' + fs.readFileSync(templatePath).toString('base64') + '";\n'));
