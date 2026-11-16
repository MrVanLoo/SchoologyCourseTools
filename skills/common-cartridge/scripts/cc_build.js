#!/usr/bin/env node
/*
 * cc_build.js: course workbook (.xlsx) or JSON spec -> Common Cartridge for Schoology.
 *
 *   node cc_build.js INPUT.xlsx|INPUT.json --out COURSE.imscc
 *        [--title "Course title"] [--files DIR] [--checklist PATH] [--no-rubric-table]
 *
 * Writes the cartridge and an after-import checklist (COURSE_After_Import.html
 * unless --checklist is given). Any error means nothing is written and the exit
 * code is 1. Uses only the vendored libraries in ./vendor, so no npm install.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var here = __dirname;
var core = require(path.join(here, 'core.js'));
var XLSX = require(path.join(here, 'vendor', 'xlsx.mini.min.js'));
var JSZip = require(path.join(here, 'vendor', 'jszip.min.js'));
var marked = require(path.join(here, 'vendor', 'marked.min.js')).marked;

function usage(msg) {
  if (msg) console.error('Error: ' + msg);
  console.error('Usage: node cc_build.js INPUT.xlsx|INPUT.json --out COURSE.imscc [--title "Course title"] [--files DIR] [--checklist PATH] [--no-rubric-table] [--manifest-id ID]');
  process.exit(2);
}

function parseArgs(argv) {
  var a = { rubricTable: true };
  for (var i = 0; i < argv.length; i++) {
    var k = argv[i];
    function next() { if (i + 1 >= argv.length) usage(k + ' needs a value.'); return argv[++i]; }
    if (k === '--out' || k === '-o') a.out = next();
    else if (k === '--title') a.title = next();
    else if (k === '--files') a.files = next();
    else if (k === '--checklist') a.checklist = next();
    else if (k === '--manifest-id') a.manifestId = next(); // tests only: fixes the one non-deterministic value
    else if (k === '--no-rubric-table') a.rubricTable = false;
    else if (k === '--no-inventory') a.noInventory = true;
    else if (k === '-h' || k === '--help') usage();
    else if (k.charAt(0) === '-') usage('unknown option ' + k);
    else if (!a.input) a.input = k;
    else usage('more than one input file given.');
  }
  if (!a.input) usage('no input file.');
  if (!a.out) usage('--out is required.');
  return a;
}

function loadFiles(dir) {
  var files = {};
  if (!dir) return files;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('--files folder not found: ' + dir);
  fs.readdirSync(dir).forEach(function (n) {
    var p = path.join(dir, n);
    if (fs.statSync(p).isFile() && n.charAt(0) !== '.') files[n] = fs.readFileSync(p);
  });
  return files;
}

function findPython() {
  var cands = process.env.PYTHON ? [process.env.PYTHON] : ['python3', 'python'];
  for (var i = 0; i < cands.length; i++) {
    var r = cp.spawnSync(cands[i], ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return cands[i];
  }
  return null;
}

function main() {
  var a = parseArgs(process.argv.slice(2));
  var ext = path.extname(a.input).toLowerCase();
  var input, specTitle = '';
  try {
    if (ext === '.json') {
      var spec = JSON.parse(fs.readFileSync(a.input, 'utf8'));
      specTitle = spec.title || '';
      input = core.fromSpec(spec);
    } else if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') {
      input = core.parseAll(core.readWorkbook(XLSX, new Uint8Array(fs.readFileSync(a.input))));
    } else {
      usage('input must be a .xlsx workbook or a .json spec.');
    }
  } catch (e) {
    console.error('ERROR: could not read ' + a.input + ': ' + e.message);
    process.exit(1);
  }
  var title = a.title || specTitle || path.basename(a.input, path.extname(a.input)).replace(/[_]+/g, ' ');
  var files;
  try { files = loadFiles(a.files); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }

  var r = core.build(input, { title: title, marked: marked, files: files, rubricTable: a.rubricTable, manifestId: a.manifestId });
  var rep = r.report;

  console.log('Course title: ' + rep.title);
  var order = core.TYPES.filter(function (t) { return rep.counts[t]; });
  console.log('Items: ' + (order.length ? order.map(function (t) { return rep.counts[t] + ' ' + t; }).join(', ') : 'none') + ' (' + rep.items + ' total, ' + rep.folders + ' folders)');
  if (rep.omitted.length) {
    console.log('Questions left out (no Common Cartridge type): ' + rep.omitted.length);
    rep.omitted.forEach(function (o) { console.log('  - ' + o.quiz + ': ' + o.type + ': ' + o.prompt); });
  }
  if (rep.warnings.length) {
    console.log('Warnings: ' + rep.warnings.length);
    rep.warnings.forEach(function (w) { console.log('  - ' + w); });
  }
  if (rep.errors.length) {
    console.error('Errors: ' + rep.errors.length + '. Nothing was written.');
    rep.errors.forEach(function (e) { console.error('  - ' + e); });
    process.exit(1);
  }

  var out = a.out;
  var checklistPath = a.checklist || out.replace(/\.imscc$/i, '') + '_After_Import.html';
  core.zip(JSZip, r.files, 'nodebuffer').then(function (buf) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, buf);
    fs.mkdirSync(path.dirname(path.resolve(checklistPath)), { recursive: true });
    fs.writeFileSync(checklistPath, r.checklistHtml);
    console.log('Wrote ' + out);
    console.log('Wrote ' + checklistPath);
    if (a.noInventory) return;
    var py = findPython();
    var inv = path.join(here, 'cc_inventory.py');
    if (!py) { console.log('(Python not found, so the inventory check was skipped. Run cc_inventory.py on the cartridge yourself.)'); return; }
    console.log('\n--- What Schoology will see (cc_inventory.py) ---');
    var tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ccinv_'));
    var res = cp.spawnSync(py, [inv, out, '--extract-to', tmp], { encoding: 'utf8' });
    process.stdout.write(res.stdout || '');
    if (res.status !== 0) process.stdout.write(res.stderr || '');
    fs.rmSync(tmp, { recursive: true, force: true });
  }).catch(function (e) {
    console.error('ERROR: could not write the cartridge: ' + e.message);
    process.exit(1);
  });
}

main();
