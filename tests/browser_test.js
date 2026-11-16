#!/usr/bin/env node
/*
 * Headless test of the two offline pages (acceptance test 13, plus the reviewer).
 *
 *   node tests/browser_test.js CLI_CARTRIDGE.imscc
 *
 * Opens assets/Course_Cartridge_Builder.html from file:// in headless Chrome via
 * the DevTools protocol (Node's built-in WebSocket, no npm packages), loads the
 * example workbook and its attachment, clicks both download buttons, and compares
 * the downloaded cartridge with the CLI's cartridge for the same input. Also checks
 * that errors block the download and that a new workbook resets the attachments.
 * Then opens Course_Reviewer.html, loads the example export, and checks the
 * outline, workbook, attachments, and comparison downloads against the CLI.
 *
 * Exit codes: 0 pass, 1 fail, 3 no Chrome found (reported as "not run").
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var SK = path.join(ROOT, 'skills', 'common-cartridge');
var JSZip = require(path.join(SK, 'scripts', 'vendor', 'jszip.min.js'));
var PAGE = path.join(SK, 'assets', 'Course_Cartridge_Builder.html');
var REVIEWER = path.join(SK, 'assets', 'Course_Reviewer.html');
var WB = path.join(SK, 'assets', 'Course_Workbook_Example.xlsx');
var PDF = path.join(SK, 'assets', 'example_files', 'Truss_Worksheet.pdf');
var BAD = path.join(__dirname, 'out', 'errors', 'unknown_type.xlsx');
var cliCart = process.argv[2] ? path.resolve(process.argv[2]) : null;

function findChrome() {
  var c = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (var i = 0; i < c.length; i++) {
    if (!c[i]) continue;
    if (c[i].charAt(0) === '/') { if (fs.existsSync(c[i])) return c[i]; continue; }
    var r = cp.spawnSync('which', [c[i]], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

var fails = 0;
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  var chrome = findChrome();
  if (!chrome) { console.log('NOT RUN: no Chrome or Chromium found (set CHROME=/path/to/chrome).'); process.exit(3); }
  if (typeof WebSocket === 'undefined') { console.log('NOT RUN: this Node has no built-in WebSocket (needs Node 22+).'); process.exit(3); }
  var prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ccchrome_'));
  var dl = fs.mkdtempSync(path.join(os.tmpdir(), 'ccdl_'));
  var proc = cp.spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + prof,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  var wsUrl = await new Promise(function (res, rej) {
    var buf = '';
    var t = setTimeout(function () { rej(new Error('Chrome did not start')); }, 20000);
    proc.stderr.on('data', function (d) {
      buf += d;
      var m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(t); res(m[1]); }
    });
  });
  var ws = new WebSocket(wsUrl);
  await new Promise(function (r) { ws.onopen = r; });
  var id = 0, pending = {}, listeners = [];
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else listeners.forEach(function (f) { f(m); });
  };
  function send(method, params, sessionId) {
    return new Promise(function (res, rej) {
      var i = ++id; pending[i] = { res: res, rej: rej };
      var msg = { id: i, method: method, params: params || {} };
      if (sessionId) msg.sessionId = sessionId;
      ws.send(JSON.stringify(msg));
    });
  }
  var downloads = {};
  listeners.push(function (m) {
    if (m.method === 'Browser.downloadWillBegin') downloads[m.params.guid] = { name: m.params.suggestedFilename };
    if (m.method === 'Browser.downloadProgress' && downloads[m.params.guid]) downloads[m.params.guid].state = m.params.state;
  });
  try {
    await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: dl, eventsEnabled: true });
    var t = await send('Target.createTarget', { url: 'about:blank' });
    var s = (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
    await send('Page.enable', {}, s);
    await send('Runtime.enable', {}, s);
    var consoleErrors = [];
    listeners.push(function (m) {
      if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text + ' ' + JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description));
    });
    await send('Page.navigate', { url: 'file://' + PAGE }, s);
    async function ev(expr) {
      var r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s);
      if (r.exceptionDetails) throw new Error('page error: ' + r.exceptionDetails.text);
      return r.result.value;
    }
    async function until(expr, ms) {
      var end = Date.now() + (ms || 10000);
      while (Date.now() < end) { try { if (await ev(expr)) return true; } catch (e) { /* page not ready */ } await sleep(100); }
      return false;
    }
    check(await until('document.readyState === "complete" && !!window.CCCore && !!window.XLSX && !!window.JSZip && !!window.marked'), 'page loads from file:// with all libraries inline');
    var net = await ev('performance.getEntriesByType("resource").filter(function(e){return !/^(file|data|blob):/.test(e.name)}).length');
    check(net === 0, 'page makes no network requests');
    check(await ev('document.getElementById("dlCart").disabled'), 'download is disabled before a workbook is loaded');

    async function setFiles(sel, files) {
      var doc = await send('DOM.getDocument', {}, s);
      var q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel }, s);
      await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: files }, s);
    }
    await ev('(function(){var t=document.getElementById("title");t.value="Example course";t.dispatchEvent(new Event("input"));return 1})()');

    // error path first: a workbook with an unknown Type
    if (fs.existsSync(BAD)) {
      await setFiles('#wbInput', [BAD]);
      await until('/Fix these/.test(document.getElementById("result").textContent)');
      var errText = await ev('document.getElementById("result").textContent');
      check(/Row \d+/.test(errText), 'an error in the workbook is shown with its row number');
      check(await ev('document.getElementById("dlCart").disabled && document.getElementById("dlCheck").disabled'), 'errors block both downloads');
    }

    await setFiles('#wbInput', [WB]);
    await until('/still needed/.test(document.getElementById("fileList").textContent)');
    check(await ev('document.getElementById("dlCart").disabled'), 'a missing attachment blocks the download');
    await setFiles('#fInput', [PDF]);
    check(await until('/Ready\\./.test(document.getElementById("result").textContent)'), 'example workbook plus attachment builds with no errors');
    var treeText = await ev('document.querySelector(".tree").textContent');
    check(/Lesson 2\.1 Forces in Trusses/.test(treeText) && /Quiz/.test(treeText), 'folder tree with type tags is shown');
    check(await ev('document.querySelector(".tree .tag") !== null'), 'items carry a type tag');
    check(await ev('/Questions left out/.test(document.getElementById("result").textContent)'), 'the matching question is listed as left out');

    await ev('document.getElementById("dlCart").click(), 1');
    await ev('document.getElementById("dlCheck").click(), 1');
    var end = Date.now() + 15000;
    while (Date.now() < end && Object.keys(downloads).filter(function (g) { return downloads[g].state === 'completed'; }).length < 2) await sleep(100);
    var done = Object.keys(downloads).filter(function (g) { return downloads[g].state === 'completed'; });
    check(done.length === 2, 'both download buttons produce a file (' + Object.keys(downloads).map(function (g) { return downloads[g].name; }).join(', ') + ')');

    var cartGuid = done.filter(function (g) { return /\.imscc$/.test(downloads[g].name); })[0];
    var checkGuid = done.filter(function (g) { return /\.html$/.test(downloads[g].name); })[0];
    if (cartGuid && cliCart) {
      var a = await JSZip.loadAsync(fs.readFileSync(path.join(dl, cartGuid)));
      var b = await JSZip.loadAsync(fs.readFileSync(cliCart));
      var na = Object.keys(a.files).filter(function (n) { return !a.files[n].dir; }).sort();
      var nb = Object.keys(b.files).filter(function (n) { return !b.files[n].dir; }).sort();
      check(JSON.stringify(na) === JSON.stringify(nb), 'page and CLI cartridges have the same file list (' + na.length + ' files)');
      var diffs = [];
      for (var i = 0; i < na.length && na[i] === nb[i]; i++) {
        var x = await a.file(na[i]).async('nodebuffer'), y = await b.file(nb[i]).async('nodebuffer');
        if (na[i] === 'imsmanifest.xml') {
          x = Buffer.from(x.toString('utf8').replace(/<manifest identifier="[^"]*"/, '<manifest identifier=""'));
          y = Buffer.from(y.toString('utf8').replace(/<manifest identifier="[^"]*"/, '<manifest identifier=""'));
        }
        if (!x.equals(y)) diffs.push(na[i]);
      }
      check(diffs.length === 0, 'page and CLI file contents match apart from the manifest identifier' + (diffs.length ? ' (differ: ' + diffs.join(', ') + ')' : ''));
    }
    if (checkGuid) {
      var ch = fs.readFileSync(path.join(dl, checkGuid), 'utf8');
      check(/Rubrics to enter/.test(ch) && /Questions left out/.test(ch), 'downloaded checklist has the rubric entry sheet and the left-out questions');
    }

    // turn the rubric option off, then check a new workbook does not turn it back on
    await ev('(function(){var c=document.getElementById("rubricTable");c.checked=false;c.dispatchEvent(new Event("change"));return 1})()');

    // a new workbook resets the attachments
    await setFiles('#wbInput', [WB]);
    check(await until('/still needed/.test(document.getElementById("fileList").textContent)'), 'loading a new workbook clears the attachments');
    check(await ev('document.getElementById("rubricTable").checked === false'), 'the rubric checkbox keeps its setting');

    // an attachments .zip (like the one the reviewer saves) is unpacked
    var bundle = new JSZip();
    bundle.file('example_attachments/Truss_Worksheet.pdf', fs.readFileSync(PDF));
    var bundlePath = path.join(dl, 'Example_attachments.zip');
    fs.writeFileSync(bundlePath, await bundle.generateAsync({ type: 'nodebuffer' }));
    await setFiles('#fInput', [bundlePath]);
    check(await until('/Ready\\./.test(document.getElementById("result").textContent)'), 'builder: an attachments .zip is unpacked and satisfies the File row');
    check(consoleErrors.length === 0, 'builder: no JavaScript exceptions' + (consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''));

    // ------------------------------------------------------------ reviewer page
    console.log('-- Course_Reviewer.html');
    var OUTD = path.dirname(cliCart);
    async function newDownloads(n, ms) {
      var before = Object.keys(downloads).filter(function (g) { return downloads[g].state === 'completed'; });
      return async function () {
        var stop = Date.now() + (ms || 15000), got = [];
        while (Date.now() < stop) {
          got = Object.keys(downloads).filter(function (g) { return downloads[g].state === 'completed' && before.indexOf(g) < 0; });
          if (got.length >= n) break;
          await sleep(100);
        }
        return got;
      };
    }
    await send('Page.navigate', { url: 'file://' + REVIEWER }, s);
    check(await until('document.readyState === "complete" && !!window.CCReview && !!window.JSZip && !!window.marked && typeof TEMPLATE_B64 === "string"'), 'reviewer page loads from file:// with everything inline');
    check(await ev('document.getElementById("dlReport").disabled && document.getElementById("dlWb").disabled'), 'reviewer downloads are disabled before an export is loaded');
    var net2 = await ev('performance.getEntriesByType("resource").filter(function(e){return !/^(file|data|blob):/.test(e.name)}).length');
    check(net2 === 0, 'reviewer page makes no network requests');

    await setFiles('#cInput', [path.join(OUTD, 'not_a_cartridge.imscc')]);
    check(await until('/not a Common Cartridge/.test(document.getElementById("summary").textContent)'), 'a ZIP with no manifest is reported plainly');

    await setFiles('#cInput', [cliCart]);
    check(await until('/8 items in 3 folders/.test(document.getElementById("summary").textContent)'), 'reviewer summarizes the example export (8 items, 3 folders)');
    var wait = await newDownloads(1);
    await ev('document.getElementById("dlReport").click(), 1');
    var g1 = await wait();
    var outlineText = g1.length ? fs.readFileSync(path.join(dl, g1[0]), 'utf8') : '';
    check(outlineText === fs.readFileSync(path.join(__dirname, 'expected', 'example_outline.md'), 'utf8'), 'reviewer outline download equals tests/expected/example_outline.md');

    await ev('document.querySelector("[data-r=syllabus]").click(), 1');
    check(await ev('/TO FILL IN/.test(document.getElementById("report").textContent) && !document.getElementById("majorRow").hidden'), 'syllabus tab shows the skeleton and the threshold box');
    await ev('document.querySelector("[data-r=keys]").click(), 1');
    check(await ev('/Answer:\\s*B/.test(document.getElementById("report").textContent) && /newton \\| newtons \\| N/.test(document.getElementById("report").textContent)'), 'answer keys tab shows the letters and accepted short answers');
    check(await ev('document.getElementById("majorRow").hidden'), 'the threshold box is hidden on other tabs');

    wait = await newDownloads(2);
    await ev('document.getElementById("dlWb").click(), 1');
    await ev('document.getElementById("dlFiles").click(), 1');
    var g2 = await wait();
    var wbGuid = g2.filter(function (g) { return /\.xlsx$/.test(downloads[g].name); })[0];
    var zipGuid = g2.filter(function (g) { return /attachments\.zip$/.test(downloads[g].name); })[0];
    check(!!wbGuid && !!zipGuid, 'workbook and attachments download (' + g2.map(function (g) { return downloads[g].name; }).join(', ') + ')');
    var cliWb = path.join(OUTD, 'roundtrip.xlsx');
    if (wbGuid && fs.existsSync(cliWb)) {
      var wa = await JSZip.loadAsync(fs.readFileSync(path.join(dl, wbGuid))), wbb = await JSZip.loadAsync(fs.readFileSync(cliWb));
      var la = Object.keys(wa.files).filter(function (n) { return !wa.files[n].dir; }).sort(), lb = Object.keys(wbb.files).filter(function (n) { return !wbb.files[n].dir; }).sort();
      var wdiff = [];
      for (var wi = 0; wi < la.length; wi++) {
        if (la[wi] !== lb[wi] || !(await wa.file(la[wi]).async('nodebuffer')).equals(await wbb.file(lb[wi]).async('nodebuffer'))) wdiff.push(la[wi]);
      }
      check(la.length === lb.length && wdiff.length === 0, 'reviewer workbook has the same contents as cc_review.js workbook' + (wdiff.length ? ' (differ: ' + wdiff.join(', ') + ')' : ''));
    }
    if (zipGuid) {
      var za = await JSZip.loadAsync(fs.readFileSync(path.join(dl, zipGuid)));
      var pdfIn = za.file('Truss_Worksheet.pdf');
      check(!!pdfIn && (await pdfIn.async('nodebuffer')).equals(fs.readFileSync(PDF)), 'attachments .zip holds the original PDF, byte for byte');
    }

    await setFiles('#oInput', [path.join(OUTD, 'modified.imscc')]);
    check(await until('/3 differences/.test(document.getElementById("diffOut").textContent)'), 'comparing with the modified export finds 3 differences');
    wait = await newDownloads(1);
    await ev('document.getElementById("dlDiff").click(), 1');
    var g3 = await wait();
    check(g3.length === 1 && /3 differences/.test(fs.readFileSync(path.join(dl, g3[0]), 'utf8')), 'comparison downloads as Markdown');

    await setFiles('#cInput', [path.join(OUTD, 'fake_schoology_export.imscc')]);
    check(await until('/Fake Schoology Export/.test(document.getElementById("summary").textContent)'), 'a new export replaces the old one');
    check(await ev('document.getElementById("dlDiff").disabled && document.getElementById("diffOut").textContent === ""'), 'a new export clears the comparison');
    await ev('document.querySelector("[data-r=audit]").click(), 1');
    var auditText = await ev('document.getElementById("report").textContent');
    check(/Empty folders \(1\)/.test(auditText) && /Dropped video and embed content \(1\)/.test(auditText) && /Absolute href paths \(1\)/.test(auditText), 'audit tab lists the fake export\'s problems');
    check(/need a URL/.test(await ev('document.getElementById("wbInfo").textContent')), 'spreadsheet section warns about rows that need a URL');
    check(await ev('document.getElementById("dlFiles").disabled'), 'attachments button is off when the export has no usable files');
    // titles in an export are data: HTML inside them must show as text, not run
    var evil = new JSZip();
    evil.file('imsmanifest.xml', '<?xml version="1.0"?><manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imscp_v1p1"><metadata><lom><general><title><string>&lt;img src=x onerror="window.__pwned=1"&gt;Course</string></title></general></lom></metadata>' +
      '<organizations><organization><item identifier="root"><item identifier="f"><title>&lt;script&gt;window.__pwned=2&lt;/script&gt;Unit</title>' +
      '<item identifier="i" identifierref="r"><title>&lt;iframe src=x&gt;&lt;/iframe&gt;Page</title></item></item></item></organization></organizations>' +
      '<resources><resource identifier="r" type="webcontent" href="r/index.html"><file href="r/index.html"/></resource></resources></manifest>');
    evil.file('r/index.html', '<p>&lt;img src=x onerror="window.__pwned=3"&gt; text</p>');
    var evilPath = path.join(dl, 'html_in_titles.imscc');
    fs.writeFileSync(evilPath, await evil.generateAsync({ type: 'nodebuffer' }));
    await setFiles('#cInput', [evilPath]);
    await until('/Unit/.test(document.getElementById("report").textContent)');
    var probes = [];
    for (var rr of ['outline', 'audit', 'syllabus', 'keys']) {
      await ev('document.querySelector("[data-r=' + rr + ']").click(), 1');
      probes.push(await ev('document.querySelectorAll("#report script, #report img, #report iframe, #summary img, #wbInfo img").length'));
    }
    await sleep(300);
    check(probes.every(function (n) { return n === 0; }) && !(await ev('window.__pwned')) && /<script>window/.test(await ev('document.querySelector("[data-r=outline]").click(), document.getElementById("report").textContent')),
      'HTML inside course titles and descriptions shows as text and never runs');
    check(consoleErrors.length === 0, 'reviewer: no JavaScript exceptions' + (consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''));
  } finally {
    try { await send('Browser.close'); } catch (e) { /* already closed */ }
    if (proc.exitCode === null) {
      await new Promise(function (r) { proc.once('exit', r); setTimeout(function () { try { proc.kill(); } catch (e) { /* gone */ } r(); }, 3000); });
    }
    [prof, dl].forEach(function (d) {
      try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp dir, harmless */ }
    });
  }
  console.log(fails ? fails + ' browser check(s) failed' : 'browser checks passed');
  process.exit(fails ? 1 : 0);
}

main().catch(function (e) { console.error('FAIL browser test crashed: ' + e.stack); process.exit(1); });
