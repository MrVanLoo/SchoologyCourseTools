#!/usr/bin/env node
/*
 * cc_review.js: turn a Common Cartridge export into things a teacher can review.
 *
 *   node cc_review.js inventory COURSE.imscc [--json] [-o FILE]
 *   node cc_review.js outline   COURSE.imscc [-o outline.md]
 *   node cc_review.js workbook  COURSE.imscc -o course.xlsx [--files-dir DIR]
 *   node cc_review.js audit     COURSE.imscc [-o audit.md] [--json]
 *   node cc_review.js syllabus  COURSE.imscc [-o syllabus.md] [--major-min POINTS]
 *   node cc_review.js diff      OLD.imscc NEW.imscc [-o diff.md] [--json]
 *   node cc_review.js keys      COURSE.imscc [-o keys.json]
 *
 * The same engine (review_core.js) runs in Course_Reviewer.html. Uses only the
 * vendored JSZip, so no npm install. Nothing is fetched from the web.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var here = __dirname;
var R = require(path.join(here, 'review_core.js'));
var JSZip = require(path.join(here, 'vendor', 'jszip.min.js'));
var TEMPLATE = path.join(here, '..', 'assets', 'Course_Workbook_Template.xlsx');

var CMDS = ['inventory', 'outline', 'workbook', 'audit', 'syllabus', 'diff', 'keys'];

function usage(msg) {
  if (msg) console.error('Error: ' + msg);
  console.error('Usage: node cc_review.js ' + CMDS.join('|') + ' COURSE.imscc [OTHER.imscc for diff] [-o OUT] [--json] [--files-dir DIR] [--major-min N]');
  process.exit(2);
}

function parseArgs(argv) {
  var a = { pos: [] };
  for (var i = 0; i < argv.length; i++) {
    var k = argv[i];
    var next = function () { if (i + 1 >= argv.length) usage(k + ' needs a value.'); return argv[++i]; };
    if (k === '-o' || k === '--out') a.out = next();
    else if (k === '--files-dir') a.filesDir = next();
    else if (k === '--major-min') { a.majorMin = Number(next()); if (!isFinite(a.majorMin)) usage('--major-min must be a number.'); }
    else if (k === '--json') a.json = true;
    else if (k === '-h' || k === '--help') usage();
    else if (k.charAt(0) === '-') usage('unknown option ' + k);
    else a.pos.push(k);
  }
  a.cmd = a.pos.shift();
  if (CMDS.indexOf(a.cmd) < 0) usage(a.cmd ? 'unknown command ' + a.cmd : 'no command.');
  if (a.cmd === 'diff' ? a.pos.length !== 2 : a.pos.length !== 1) usage(a.cmd === 'diff' ? 'diff needs two cartridges.' : 'give one cartridge.');
  if (a.cmd === 'workbook' && !a.out) usage('workbook needs -o OUT.xlsx');
  return a;
}

function load(p) {
  if (!fs.existsSync(p)) { console.error('ERROR: file not found: ' + p); process.exit(1); }
  return R.load(JSZip, fs.readFileSync(p)).catch(function (e) {
    console.error('ERROR: ' + p + ' could not be read as a Common Cartridge: ' + e.message);
    process.exit(1);
  });
}

function writeOut(text, out) {
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, text);
    console.log('Wrote ' + out);
  } else process.stdout.write(text);
}

function main() {
  var a = parseArgs(process.argv.slice(2));
  if (a.cmd === 'diff') {
    return Promise.all([load(a.pos[0]), load(a.pos[1])]).then(function (cs) {
      var d = R.diff(cs[0], cs[1]);
      writeOut(a.json ? JSON.stringify(d.result, null, 1) + '\n' : d.markdown, a.out);
    });
  }
  return load(a.pos[0]).then(function (c) {
    if (a.cmd === 'inventory') return writeOut(a.json ? JSON.stringify(R.inventory(c), null, 2) + '\n' : R.inventoryText(c), a.out);
    if (a.cmd === 'outline') return writeOut(R.outline(c), a.out);
    if (a.cmd === 'audit') {
      var au = R.audit(c);
      return writeOut(a.json ? JSON.stringify(au.findings, null, 1) + '\n' : au.markdown, a.out);
    }
    if (a.cmd === 'syllabus') return writeOut(R.syllabus(c, { majorMin: a.majorMin }), a.out);
    if (a.cmd === 'keys') return writeOut(JSON.stringify(R.answerKeys(c), null, 1) + '\n', a.out);
    if (a.cmd === 'workbook') {
      var w = R.workbookRows(c), warnings = [];
      return R.writeWorkbook(JSZip, fs.readFileSync(TEMPLATE), { Course: w.course, Rubrics: w.rubrics, Questions: w.questions }, function (m) { warnings.push(m); })
        .then(function (bytes) {
          fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
          fs.writeFileSync(a.out, bytes);
          console.log('Wrote ' + a.out + ': ' + w.course.length + ' course rows, ' + w.questions.length + ' questions.');
          if (w.files.length) {
            var dir = a.filesDir || a.out.replace(/\.xlsx$/i, '') + '_files';
            fs.mkdirSync(dir, { recursive: true });
            w.files.forEach(function (f) { fs.writeFileSync(path.join(dir, f.name), f.bytes); });
            console.log('Copied ' + w.files.length + ' files to ' + dir + '. Use that folder as the attachments folder when you build.');
          }
          w.messages.concat(warnings.map(function (m) { return 'Note: ' + m; })).forEach(function (m) { console.log(m); });
        });
    }
  });
}

main().catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
