/*
 * core.js: course workbook (or JSON spec) -> Common Cartridge 1.2 for Schoology.
 *
 * No DOM and no file access in here, so the same code runs under Node
 * (cc_build.js) and inside the offline HTML builder. Callers pass in the
 * libraries: XLSX (SheetJS), JSZip, marked.
 *
 * The Schoology format rules this file encodes are documented in
 * references/build-format.md. Do not "tidy" them. The ones marked verified
 * there were confirmed by a live import; the rest follow the Common Cartridge
 * spec and still wait on a live import.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CCCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = ['Assignment', 'Page', 'Link', 'Discussion', 'File', 'Quiz'];
  var SEP = ' > '; // optional nesting inside Unit or Topic, used by exported workbooks
  var POINTS_INPUT_RE = /<input\b[^>]*sch-grade-item-max-points[^>]*>/gi;
  var HAS_DESCRIPTION = { Assignment: 1, Page: 1, Discussion: 1 };

  // ---------- small helpers ----------
  function s(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function esc(v) {
    return s(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pad(n) { return ('0000' + n).slice(-4); }
  function num(v) {
    var t = s(v).replace(/,/g, '');
    if (t === '') return null;
    var n = Number(t);
    return isFinite(n) ? n : NaN;
  }
  function fmtNum(n) { return String(Math.round(n * 100) / 100); }
  function key(h) { return s(h).toLowerCase().replace(/\s+/g, ' '); }
  function lowerKeys(row) {
    var o = {};
    Object.keys(row || {}).forEach(function (k) { o[key(k)] = row[k]; });
    return o;
  }
  function isBlankRow(r) {
    return Object.keys(r).every(function (k) { return k === '__row' || s(r[k]) === ''; });
  }
  // Spaces become underscores so the manifest href never needs URL-encoding.
  function safeFileName(name) {
    var base = s(name).split(/[\\/]/).pop();
    return base.replace(/[^A-Za-z0-9._()-]/g, '_');
  }
  // "Row 7" for a sheet row, "Item 3" for a JSON spec entry.
  function where(rowNo, title, sheet) {
    var w = typeof rowNo === 'number' ? (sheet ? sheet + ' row ' : 'Row ') + rowNo : String(rowNo).charAt(0).toUpperCase() + String(rowNo).slice(1);
    return w + (title ? ' (' + title + ')' : '');
  }
  function folderPath(it) {
    var path = [];
    [it.unit, it.topic].forEach(function (p) { if (p) p.split(SEP).map(s).filter(Boolean).forEach(function (x) { path.push(x); }); });
    return path;
  }
  function textOf(html) {
    return s(String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' '));
  }
  function looksLikeUrl(u) {
    if (/\s/.test(u)) return false;
    if (/^(mailto|tel):/i.test(u)) return true;
    var m = /^[a-z][a-z0-9+.-]*:\/\/([^\/?#]+)/i.exec(u);
    return !!m && /[a-z0-9]\.[a-z]{2,}|^localhost(:\d+)?$/i.test(m[1]);
  }

  // ---------- parsing: Course sheet ----------
  function parseCourseRows(rows) {
    var items = [], errors = [], warnings = [];
    (rows || []).forEach(function (raw, i) {
      var r = lowerKeys(raw), rowNo = raw.__row || i + 2;
      if (isBlankRow(r)) return;
      var typeIn = s(r.type);
      var type = TYPES.filter(function (t) { return t.toLowerCase() === typeIn.toLowerCase(); })[0];
      var it = {
        row: rowNo,
        unit: s(r.unit), topic: s(r.topic), type: type, title: s(r.title),
        url: s(r.url),
        description: s(r.description !== undefined && s(r.description) !== '' ? r.description : r.instructions),
        points: num(r.points), due: s(r.due), category: s(r.category),
        rubric: s(r.rubric), file: s(r.file)
      };
      var w = where(rowNo, it.title);
      if (!type) { errors.push(w + ': Type "' + typeIn + '" is not one of ' + TYPES.join(', ') + '.'); return; }
      if (!it.title) { errors.push(where(rowNo) + ': Title is empty.'); return; }
      if (it.topic && !it.unit) warnings.push(w + ': has a Topic but no Unit. The topic folder will sit at the top level.');
      if (type === 'Link') {
        if (!it.url) { errors.push(w + ': a Link needs a URL.'); return; }
        // Add https:// only when there is no scheme. "example.com:8080/x" has no scheme.
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(it.url) && !/^(mailto|tel):/i.test(it.url)) it.url = 'https://' + it.url;
        if (!looksLikeUrl(it.url)) warnings.push(w + ': the URL "' + it.url + '" does not look like a web address. Check it.');
      }
      if (type === 'Assignment') {
        if (isNaN(it.points)) { errors.push(w + ': Points "' + s(r.points) + '" is not a number.'); return; }
        if (it.points !== null && it.points < 0) { errors.push(w + ': Points cannot be negative.'); return; }
        if (it.points === null) warnings.push(w + ': no Points. Schoology will default the assignment to 100.');
      } else if (it.points !== null && !isNaN(it.points)) {
        warnings.push(w + ': Points only apply to Assignment rows and will be ignored.');
      }
      if (type === 'File' && !it.file) { errors.push(w + ': a File row needs a file name in the File column.'); return; }
      if (it.rubric && type !== 'Assignment' && type !== 'Discussion') {
        warnings.push(w + ': Rubric only applies to Assignment and Discussion rows and will be ignored.');
        it.rubric = '';
      }
      if (it.description && !HAS_DESCRIPTION[type]) {
        warnings.push(w + ': Description only applies to Assignment, Page, and Discussion rows and will be ignored.');
      }
      items.push(it);
    });
    return { items: items, errors: errors, warnings: warnings };
  }

  // ---------- parsing: Rubrics sheet ----------
  // One row per criterion. Level columns come in pairs: "L1 Points", "L1 Description", ...
  function parseRubricRows(rows) {
    var rubrics = {}, order = [], errors = [];
    (rows || []).forEach(function (raw, i) {
      var r = lowerKeys(raw), rowNo = raw.__row || i + 2;
      if (isBlankRow(r)) return;
      var name = s(r.rubric), crit = s(r.criterion);
      var w = where(rowNo, crit, 'Rubrics');
      if (!name || !crit) { errors.push(w + ': Rubric and Criterion are both required.'); return; }
      var levels = {};
      Object.keys(r).forEach(function (k) {
        var m = /^l(?:evel)?\s*(\d+)\s*(points|pts|description|desc)$/.exec(k);
        if (!m) return;
        var n = Number(m[1]);
        levels[n] = levels[n] || {};
        if (m[2].charAt(0) === 'p') levels[n].points = num(r[k]); else levels[n].description = s(r[k]);
      });
      var list = Object.keys(levels).map(Number).sort(function (a, b) { return a - b; })
        .map(function (n) { return levels[n]; })
        .filter(function (l) { return l.points !== null && l.points !== undefined; });
      if (list.some(function (l) { return isNaN(l.points); })) { errors.push(w + ': a level has points that are not a number.'); return; }
      if (!list.length) { errors.push(w + ': no level has points.'); return; }
      list.forEach(function (l) { l.description = l.description || ''; });
      if (!rubrics[name]) { rubrics[name] = { name: name, criteria: [] }; order.push(name); }
      rubrics[name].criteria.push({
        title: crit,
        description: s(r.description !== undefined ? r.description : r['criterion description']),
        levels: list
      });
    });
    return { rubrics: rubrics, order: order, errors: errors };
  }
  function rubricTotal(rb) {
    return rb.criteria.reduce(function (t, c) {
      return t + Math.max.apply(null, c.levels.map(function (l) { return l.points; }));
    }, 0);
  }

  // ---------- questions: one validator for the sheet and the JSON spec ----------
  var QTYPE = {
    'multiple choice': 'mc', 'mc': 'mc',
    'select all': 'mr', 'multiple answer': 'mr', 'multiple response': 'mr', 'mr': 'mr',
    'true/false': 'tf', 'true false': 'tf', 'tf': 'tf',
    'short answer': 'fib', 'fill in the blank': 'fib', 'fib': 'fib',
    'essay': 'essay',
    'matching': 'matching', 'ordering': 'ordering'
  };
  var LETTERS = 'ABCDEFGH';
  // q: { type (raw), prompt, choices: [text], correct: [index], answers: [text] }
  // Returns { q } with a normalized question, or { error }.
  function checkQuestion(raw, w) {
    var type = QTYPE[key(raw.type)];
    var q = { row: raw.row, type: type, prompt: s(raw.prompt), choices: (raw.choices || []).map(s), correct: [], answers: [] };
    if (!type) return { error: w + ': question type "' + s(raw.type) + '" is not recognized.' };
    if (!q.prompt) return { error: w + ': the question text is empty.' };
    if (type === 'mc' || type === 'mr') {
      if (q.choices.length < 2) return { error: w + ': needs at least two choices.' };
      if (q.choices.some(function (c) { return !c; })) return { error: w + ': a choice is empty.' };
      var bad = false;
      q.correct = (raw.correct || []).map(function (c) {
        if (typeof c === 'number' && c % 1 === 0 && c >= 0 && c < q.choices.length) return c;
        var L = s(c).toUpperCase();
        var j = L.length === 1 ? LETTERS.indexOf(L) : -1;
        if (j < 0 || j >= q.choices.length) { bad = true; return -1; }
        return j;
      });
      if (!q.correct.length || bad) return { error: w + ': the answer "' + (raw.answerText !== undefined ? raw.answerText : (raw.correct || []).join(', ')) + '" does not match the choices.' };
      if (q.correct.some(function (c, i) { return q.correct.indexOf(c) !== i; })) return { error: w + ': the same answer is listed twice.' };
      if (type === 'mc' && q.correct.length !== 1) return { error: w + ': Multiple choice takes one answer. Use "Select all" for several.' };
    } else if (type === 'tf') {
      var a = s((raw.answers || [])[0]).toLowerCase();
      if (a !== 'true' && a !== 'false' && a !== 't' && a !== 'f') return { error: w + ': True/False answer must be True or False.' };
      q.answers = [a.charAt(0) === 't' ? 'true' : 'false'];
    } else if (type === 'fib') {
      q.answers = (raw.answers || []).map(s).filter(Boolean);
      if (!q.answers.length) return { error: w + ': Short answer needs at least one accepted answer.' };
    }
    return { q: q };
  }

  // ---------- parsing: Questions sheet ----------
  function parseQuestionRows(rows) {
    var quizzes = {}, order = [], errors = [], warnings = [];
    (rows || []).forEach(function (raw, i) {
      var r = lowerKeys(raw), rowNo = raw.__row || i + 2;
      if (isBlankRow(r)) return;
      var quiz = s(r.quiz), ans = s(r.answer), w = where(rowNo, null, 'Questions');
      if (!quiz) { errors.push(w + ': Quiz is empty.'); return; }
      var choices = [], letterIndex = {};
      LETTERS.split('').forEach(function (L) {
        var v = s(r['choice ' + L.toLowerCase()]);
        if (v) { letterIndex[L] = choices.length; choices.push(v); }
      });
      // Letters refer to the column, so a blank Choice B does not shift C to B.
      var correct = ans.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(function (L) {
        return letterIndex[L] !== undefined ? letterIndex[L] : 'not a choice';
      });
      var res = checkQuestion({
        row: rowNo, type: r.type, prompt: r.question, choices: choices,
        correct: correct, answerText: ans,
        answers: QTYPE[key(r.type)] === 'fib' ? ans.split('|') : [ans]
      }, w);
      if (res.error) { errors.push(res.error); return; }
      if (!quizzes[quiz]) { quizzes[quiz] = []; order.push(quiz); }
      quizzes[quiz].push(res.q);
    });
    return { quizzes: quizzes, order: order, errors: errors, warnings: warnings };
  }

  // ---------- workbook -> rows ----------
  function sheetRows(XLSX, ws) {
    if (!ws || !ws['!ref']) return [];
    var first = XLSX.utils.decode_range(ws['!ref']).s.r; // 0-based row of the header
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true });
    if (!aoa.length) return [];
    var head = aoa[0].map(s), out = [];
    for (var i = 1; i < aoa.length; i++) {
      var o = { __row: first + i + 1 }, any = false;
      head.forEach(function (h, c) { if (h) { o[h] = aoa[i][c]; if (s(aoa[i][c]) !== '') any = true; } });
      if (any) out.push(o);
    }
    return out;
  }
  function readWorkbook(XLSX, data) {
    var wb = XLSX.read(data, { type: 'array' });
    var byName = {};
    wb.SheetNames.forEach(function (n) { byName[n.toLowerCase().trim()] = wb.Sheets[n]; });
    var course = byName.course;
    if (!course) {
      // fall back to the first sheet that has Type and Title columns
      for (var i = 0; i < wb.SheetNames.length && !course; i++) {
        var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, defval: '' });
        var head = (aoa[0] || []).map(key);
        if (head.indexOf('type') >= 0 && head.indexOf('title') >= 0) course = wb.Sheets[wb.SheetNames[i]];
      }
    }
    if (!course) throw new Error('No sheet named "Course" and no sheet with Type and Title columns.');
    return {
      courseRows: sheetRows(XLSX, course),
      rubricRows: byName.rubrics ? sheetRows(XLSX, byName.rubrics) : [],
      questionRows: byName.questions ? sheetRows(XLSX, byName.questions) : []
    };
  }

  // ---------- JSON spec -> same shape as parsed sheets ----------
  // Runs the same checks as the sheet parsers: course rows go through
  // parseCourseRows, questions through checkQuestion, rubric levels are checked here.
  function fromSpec(spec) {
    spec = spec || {};
    var rows = (spec.items || []).map(function (it, i) { var o = { __row: 'item ' + (i + 1) }; Object.keys(it || {}).forEach(function (k) { o[k] = it[k]; }); return o; });
    var course = parseCourseRows(rows);
    var rubrics = {}, order = [], rerrors = [];
    (spec.rubrics || []).forEach(function (rb, ri) {
      var name = s(rb && rb.name), w = 'Rubric ' + (ri + 1) + (name ? ' (' + name + ')' : '');
      if (!name || !(rb.criteria || []).length) { rerrors.push(w + ': a rubric needs a name and at least one criterion.'); return; }
      if (rubrics[name]) { rerrors.push(w + ': two rubrics have this name.'); return; }
      var ok = true;
      var criteria = rb.criteria.map(function (c, ci) {
        var cw = w + ', criterion ' + (ci + 1);
        if (!s(c && c.title)) { rerrors.push(cw + ': the criterion has no title.'); ok = false; return null; }
        var levels = (c.levels || []).filter(function (l) { return l && s(l.points) !== ''; })
          .map(function (l) { return { points: num(l.points), description: s(l.description) }; });
        if (levels.some(function (l) { return isNaN(l.points); })) { rerrors.push(cw + ': a level has points that are not a number.'); ok = false; return null; }
        if (!levels.length) { rerrors.push(cw + ': no level has points.'); ok = false; return null; }
        return { title: s(c.title), description: s(c.description), levels: levels };
      });
      if (!ok) return;
      rubrics[name] = { name: name, criteria: criteria };
      order.push(name);
    });
    var quizzes = {}, qorder = [], qerrors = [];
    (spec.quizzes || []).forEach(function (qz, zi) {
      var title = s(qz && qz.title);
      if (!title) { qerrors.push('Quiz ' + (zi + 1) + ': the quiz has no title.'); return; }
      if (quizzes[title]) { qerrors.push('Quiz ' + (zi + 1) + ' (' + title + '): two quizzes have this title.'); return; }
      var list = [];
      (qz.questions || []).forEach(function (q, i) {
        var w = 'Quiz "' + title + '", question ' + (i + 1);
        var res = checkQuestion({ row: 'question ' + (i + 1), type: q.type, prompt: q.prompt, choices: q.choices, correct: q.correct, answers: q.answers }, w);
        if (res.error) qerrors.push(res.error); else list.push(res.q);
      });
      quizzes[title] = list;
      qorder.push(title);
    });
    return { course: course, rub: { rubrics: rubrics, order: order, errors: rerrors }, qs: { quizzes: quizzes, order: qorder, errors: qerrors, warnings: [] } };
  }

  // ---------- HTML pieces ----------
  // Markdown is converted with line breaks kept (breaks: true), because a teacher
  // who presses Alt+Enter in a cell expects a new line, not a joined paragraph.
  function toHtml(marked, text) {
    var t = s(text);
    if (!t) return '';
    if (t.charAt(0) === '<') return t; // already HTML: pass through untouched
    var o = { gfm: true, breaks: true, async: false };
    var html = marked && marked.parse ? marked.parse(t, o) : (typeof marked === 'function' ? marked(t, o) : '<p>' + esc(t) + '</p>');
    return s(html);
  }
  function sameLevels(rb) {
    var first = rb.criteria[0].levels.map(function (l) { return l.points; }).join(',');
    return rb.criteria.every(function (c) { return c.levels.map(function (l) { return l.points; }).join(',') === first; });
  }
  // Plain table that survives Schoology's rich-text editor: attributes, not CSS classes.
  // Whether it renders after import is not yet confirmed (live test A).
  function rubricTableHtml(rb) {
    var h = '<h3>Rubric: ' + esc(rb.name) + ' (' + fmtNum(rubricTotal(rb)) + ' points)</h3>';
    h += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">';
    if (sameLevels(rb)) {
      h += '<tr><th align="left">Criteria</th>' + rb.criteria[0].levels.map(function (l) { return '<th>' + fmtNum(l.points) + '</th>'; }).join('') + '</tr>';
      rb.criteria.forEach(function (c) {
        h += '<tr><td><strong>' + esc(c.title) + '</strong>' + (c.description ? '<br>' + esc(c.description) : '') + '</td>' +
          c.levels.map(function (l) { return '<td valign="top">' + esc(l.description) + '</td>'; }).join('') + '</tr>';
      });
    } else {
      h += '<tr><th align="left">Criteria</th><th align="left">Levels</th></tr>';
      rb.criteria.forEach(function (c) {
        h += '<tr><td valign="top"><strong>' + esc(c.title) + '</strong>' + (c.description ? '<br>' + esc(c.description) : '') + '</td><td>' +
          c.levels.map(function (l) { return '<strong>' + fmtNum(l.points) + '</strong>: ' + esc(l.description); }).join('<br>') + '</td></tr>';
      });
    }
    return h + '</table>';
  }

  // ---------- QTI 1.2 (Common Cartridge profile) ----------
  // mc, mr, tf: verified by live imports. fib, essay: built to the CC profile, untested.
  function mat(text) { return '<material><mattext texttype="text/html">' + esc('<p>' + esc(text) + '</p>') + '</mattext></material>'; }
  function qtiItem(q, n) {
    var profile = { mc: 'cc.multiple_choice.v0p1', mr: 'cc.multiple_response.v0p1', tf: 'cc.true_false.v0p1', fib: 'cc.fib.v0p1', essay: 'cc.essay.v0p1' }[q.type];
    var id = 'q' + pad(n), x = '';
    x += '<item ident="' + id + '" title="Question ' + n + '"><itemmetadata><qtimetadata>';
    x += '<qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>' + profile + '</fieldentry></qtimetadatafield>';
    if (q.type === 'essay') x += '<qtimetadatafield><fieldlabel>qmd_computerscored</fieldlabel><fieldentry>No</fieldentry></qtimetadatafield>';
    x += '</qtimetadata></itemmetadata><presentation>' + mat(q.prompt);
    var outcomes = '<outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>';
    var win = '<setvar action="Set" varname="SCORE">100</setvar>';
    if (q.type === 'mc' || q.type === 'mr' || q.type === 'tf') {
      var labels = q.type === 'tf'
        ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }]
        : q.choices.map(function (c, i) { return { id: id + '_c' + (i + 1), text: c }; });
      var right = q.type === 'tf' ? [q.answers[0]] : q.correct.map(function (i) { return labels[i].id; });
      x += '<response_lid ident="response1" rcardinality="' + (q.type === 'mr' ? 'Multiple' : 'Single') + '"><render_choice>';
      labels.forEach(function (l) { x += '<response_label ident="' + l.id + '">' + mat(l.text) + '</response_label>'; });
      x += '</render_choice></response_lid></presentation><resprocessing>' + outcomes + '<respcondition continue="No"><conditionvar>';
      if (q.type === 'mr') {
        // all-or-nothing: every right choice selected and no wrong one
        x += '<and>';
        labels.forEach(function (l) {
          var v = '<varequal respident="response1">' + l.id + '</varequal>';
          x += right.indexOf(l.id) >= 0 ? v : '<not>' + v + '</not>';
        });
        x += '</and>';
      } else {
        x += '<varequal respident="response1">' + right[0] + '</varequal>';
      }
      x += '</conditionvar>' + win + '</respcondition></resprocessing>';
    } else if (q.type === 'fib') {
      // One respcondition per accepted answer, so no reader has to guess whether
      // sibling conditions mean "and" or "or".
      x += '<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>';
      x += '<resprocessing>' + outcomes;
      x += q.answers.map(function (a) {
        return '<respcondition continue="No"><conditionvar><varequal respident="response1" case="No">' + esc(a) + '</varequal></conditionvar>' + win + '</respcondition>';
      }).join('');
      x += '</resprocessing>';
    } else {
      x += '<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>';
      x += '<resprocessing>' + outcomes + '</resprocessing>';
    }
    return x + '</item>';
  }
  function qtiAssessment(title, questions, ident) {
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n';
    x += '<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p2/ccv1p2_qtiasiv1p2p1_v1p0.xsd">';
    x += '<assessment ident="' + ident + '" title="' + esc(title) + '"><qtimetadata>';
    x += '<qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.exam.v0p1</fieldentry></qtimetadatafield>';
    x += '<qtimetadatafield><fieldlabel>qmd_assessmenttype</fieldlabel><fieldentry>Examination</fieldentry></qtimetadatafield>';
    x += '</qtimetadata><section ident="root_section">';
    questions.forEach(function (q, i) { x += qtiItem(q, i + 1); });
    return x + '</section></assessment></questestinterop>\n';
  }

  // ---------- model: folders and items in row order ----------
  function buildTree(items) {
    var rootNode = { title: null, children: [], index: {} };
    function folder(parent, name) {
      if (!parent.index[name]) {
        var f = { title: name, children: [], index: {} };
        parent.index[name] = f;
        parent.children.push({ folder: f });
      }
      return parent.index[name];
    }
    items.forEach(function (it) {
      var node = rootNode;
      folderPath(it).forEach(function (p) { node = folder(node, p); });
      node.children.push({ item: it });
    });
    return rootNode;
  }
  // Plain outline for display: [{depth, folder: title} | {depth, type, title, points}]
  function treeLines(node, depth, out) {
    out = out || [];
    depth = depth || 0;
    node.children.forEach(function (ch) {
      if (ch.folder) { out.push({ depth: depth, folder: ch.folder.title }); treeLines(ch.folder, depth + 1, out); }
      else out.push({ depth: depth, type: ch.item.type, title: ch.item.title, points: ch.item.type === 'Assignment' ? ch.item.points : null, row: ch.item.row });
    });
    return out;
  }

  // ---------- the build ----------
  // input: { course, rub, qs } as returned by the parsers.
  // opts: { title, marked, files: {name: bytes}, rubricTable: true, manifestId }
  function build(input, opts) {
    opts = opts || {};
    var title = s(opts.title) || 'Imported course';
    var files = opts.files || {};
    var filesLower = {};
    Object.keys(files).forEach(function (k) { filesLower[k.toLowerCase()] = k; });
    var errors = [].concat(input.course.errors, input.rub.errors, input.qs.errors);
    var warnings = [].concat(input.course.warnings, input.qs.warnings || []);
    var rubrics = input.rub.rubrics, quizzes = input.qs.quizzes;
    var out = {}, resources = [], counts = {}, omitted = [], used = { rubrics: {}, quizzes: {} };
    var nRes = 0, nItem = 0, nFolder = 0;
    var useTable = opts.rubricTable !== false;

    function descWarnings(it, html) {
      var w = where(it.row, it.title);
      if (/<img\b/i.test(html)) warnings.push(w + ': the description has an image. Schoology moves embedded images to Unused Resources on import, so re-embed it after import or attach it as a File row.');
      var m = /^\s*<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
      if (m && textOf(m[1]).toLowerCase() === it.title.toLowerCase()) warnings.push(w + ': the description starts with the title. Schoology already shows the title, so remove it from the description.');
      if (!textOf(html) && it.type !== 'Discussion') warnings.push(w + ': the description is empty.');
    }

    function addResource(it) {
      var rid = 'R_' + pad(++nRes), xml = '';
      if (it.type === 'Assignment' || it.type === 'Page') {
        // Points come only from the Points column, so drop any copy pasted into the description.
        var html = toHtml(opts.marked, it.description).replace(POINTS_INPUT_RE, '');
        descWarnings(it, html);
        if (it.type === 'Assignment') {
          if (it.rubric && rubrics[it.rubric] && useTable) html += rubricTableHtml(rubrics[it.rubric]);
          // Bare fragment, no title, points in this exact hidden input, appended last. See build-format.md.
          if (it.points !== null) html += '<input name="sch-grade-item-max-points" type="hidden" value="' + fmtNum(it.points) + '">';
        }
        var href = rid + '/index.html';
        out[href] = html;
        xml = '<resource identifier="' + rid + '" type="webcontent" href="' + href + '"' + (it.type === 'Assignment' ? ' intendeduse="assignment"' : '') + '>\n      <metadata/>\n      <file href="' + href + '"/>\n    </resource>';
      } else if (it.type === 'Link') {
        var lh = rid + '/weblink.xml';
        out[lh] = '<?xml version="1.0" encoding="UTF-8"?>\n<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imswl_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p2/imswl_v1p2 http://www.imsglobal.org/profile/cc/ccv1p2/ccv1p2_imswl_v1p2.xsd">\n  <title>' + esc(it.title) + '</title>\n  <url href="' + esc(it.url) + '" target="_blank"/>\n</webLink>\n';
        xml = '<resource identifier="' + rid + '" type="imswl_xmlv1p2">\n      <file href="' + lh + '"/>\n    </resource>';
      } else if (it.type === 'Discussion') {
        var dh = rid + '/discussion.xml';
        var body = toHtml(opts.marked, it.description);
        descWarnings(it, body);
        if (it.rubric && rubrics[it.rubric] && useTable) body += rubricTableHtml(rubrics[it.rubric]);
        out[dh] = '<?xml version="1.0" encoding="UTF-8"?>\n<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imsdt_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p2/imsdt_v1p2 http://www.imsglobal.org/profile/cc/ccv1p2/ccv1p2_imsdt_v1p2.xsd">\n  <title>' + esc(it.title) + '</title>\n  <text texttype="text/html">' + esc(body) + '</text>\n</topic>\n';
        xml = '<resource identifier="' + rid + '" type="imsdt_xmlv1p2">\n      <file href="' + dh + '"/>\n    </resource>';
      } else if (it.type === 'File') {
        var want = it.file.split(/[\\/]/).pop();
        var have = files[want] !== undefined ? want : filesLower[want.toLowerCase()];
        if (have === undefined) { errors.push(where(it.row, it.title) + ': the file "' + want + '" was not provided.'); nRes--; return null; }
        var fh = rid + '/' + safeFileName(want);
        out[fh] = files[have];
        xml = '<resource identifier="' + rid + '" type="webcontent" href="' + esc(fh) + '">\n      <file href="' + esc(fh) + '"/>\n    </resource>';
      } else if (it.type === 'Quiz') {
        var qs = quizzes[it.title];
        if (!qs || !qs.length) { errors.push(where(it.row, it.title) + ': no questions found for a quiz with this exact title.'); nRes--; return null; }
        var keep = qs.filter(function (q) { return q.type !== 'matching' && q.type !== 'ordering'; });
        qs.forEach(function (q) {
          if (q.type === 'matching' || q.type === 'ordering') omitted.push({ quiz: it.title, type: q.type === 'matching' ? 'Matching' : 'Ordering', prompt: q.prompt });
        });
        if (!keep.length) { errors.push(where(it.row, it.title) + ': every question is a type Common Cartridge cannot carry (matching or ordering).'); nRes--; return null; }
        var qh = rid + '/assessment_qti.xml';
        out[qh] = qtiAssessment(it.title, keep, rid + '_a');
        used.quizzes[it.title] = keep.length;
        xml = '<resource identifier="' + rid + '" type="imsqti_xmlv1p2/imscc_xmlv1p2/assessment">\n      <metadata/>\n      <file href="' + qh + '"/>\n    </resource>';
      }
      resources.push(xml);
      counts[it.type] = (counts[it.type] || 0) + 1;
      return rid;
    }

    // cross-checks before emitting
    var quizRows = {}, seen = {};
    input.course.items.forEach(function (it) {
      var w = where(it.row, it.title);
      var fkey = folderPath(it).join('\u0000') + '\u0001' + it.title.toLowerCase();
      if (seen[fkey]) warnings.push(w + ': another item in the same folder has this title (' + where(seen[fkey]) + ').');
      else seen[fkey] = it.row;
      if (it.type === 'Quiz') {
        if (quizRows[it.title]) errors.push(w + ': two Quiz rows have this title, so their questions cannot be told apart.');
        quizRows[it.title] = true;
      }
      if (!it.rubric) return;
      var rb = rubrics[it.rubric];
      if (!rb) { errors.push(w + ': Rubric "' + it.rubric + '" is not on the Rubrics tab.'); return; }
      used.rubrics[it.rubric] = true;
      if (it.type === 'Assignment' && it.points !== null && Math.abs(rubricTotal(rb) - it.points) > 1e-9) {
        warnings.push(w + ': Points is ' + fmtNum(it.points) + ' but rubric "' + it.rubric + '" totals ' + fmtNum(rubricTotal(rb)) + '.');
      }
    });
    (input.qs.order || Object.keys(quizzes)).forEach(function (name) {
      if (quizRows[name]) return;
      var first = (quizzes[name] || [])[0];
      errors.push((first && typeof first.row === 'number' ? 'Questions row ' + first.row : 'Quiz "' + name + '"') +
        ': Quiz "' + name + '" does not match the Title of any Quiz row on the Course tab, so its questions would be lost.');
    });

    function emit(node, depth) {
      var ind = new Array(depth + 4).join('  '), x = '';
      node.children.forEach(function (ch) {
        if (ch.folder) {
          var inner = emit(ch.folder, depth + 1);
          if (!inner) return; // every child failed
          x += ind + '<item identifier="F_' + pad(++nFolder) + '">\n' + ind + '  <title>' + esc(ch.folder.title) + '</title>\n' + inner + ind + '</item>\n';
        } else {
          var rid = addResource(ch.item);
          if (!rid) return;
          x += ind + '<item identifier="I_' + pad(++nItem) + '" identifierref="' + rid + '">\n' + ind + '  <title>' + esc(ch.item.title) + '</title>\n' + ind + '</item>\n';
        }
      });
      return x;
    }
    var treeRoot = buildTree(input.course.items);
    var tree = emit(treeRoot, 0);
    if (!input.course.items.length) errors.push('The Course tab has no items.');

    var manifest =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<manifest identifier="' + esc(opts.manifestId || 'M_' + Date.now().toString(36)) + '" xmlns="http://www.imsglobal.org/xsd/imsccv1p2/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p2/LOM/manifest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p2/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p2/ccv1p2_imscp_v1p2_v1p0.xsd http://ltsc.ieee.org/xsd/imsccv1p2/LOM/manifest http://www.imsglobal.org/profile/cc/ccv1p2/LOM/ccv1p2_lommanifest_v1p0.xsd">\n' +
      '  <metadata>\n    <schema>IMS Common Cartridge</schema>\n    <schemaversion>1.2.0</schemaversion>\n' +
      '    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>' + esc(title) + '</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>\n  </metadata>\n' +
      '  <organizations>\n    <organization identifier="org_1" structure="rooted-hierarchy">\n      <item identifier="root">\n' + tree + '      </item>\n    </organization>\n  </organizations>\n' +
      '  <resources>\n    ' + resources.join('\n    ') + '\n  </resources>\n</manifest>\n';
    // Manifest first in the archive, then resources in build order.
    var ordered = { 'imsmanifest.xml': manifest };
    Object.keys(out).forEach(function (k) { ordered[k] = out[k]; });

    var report = { title: title, counts: counts, folders: nFolder, items: nItem, errors: errors, warnings: warnings, omitted: omitted };
    return {
      files: ordered,
      report: report,
      tree: treeLines(treeRoot),
      checklistHtml: checklist(title, input.course.items, rubrics, input.rub.order, used, report, useTable)
    };
  }

  // ---------- after-import checklist: everything a cartridge cannot carry ----------
  function checklist(title, items, rubrics, order, used, report, tableEmbedded) {
    var css = 'body{font:15px/1.5 Arial,Helvetica,sans-serif;color:#1c2430;background:#fff;max-width:960px;margin:32px auto;padding:0 20px}' +
      'h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;border-bottom:2px solid #1c2430;padding-bottom:4px}h3{font-size:16px;margin:24px 0 6px}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border:1px solid #9aa3ad;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef1f4}' +
      '.box{display:inline-block;width:14px;height:14px;border:1.5px solid #1c2430;vertical-align:-2px}.pts{font-weight:bold;white-space:nowrap}.note{color:#4a5563}' +
      'ol{padding-left:22px}@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}';
    var h = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>After import: ' + esc(title) + '</title><style>' + css + '</style></head><body>';
    h += '<h1>After import: ' + esc(title) + '</h1>';
    h += '<p class="note">The cartridge carries folders, titles, descriptions, and assignment points. Everything on this page has to be set in Schoology by hand.</p>';
    h += '<h2>Import the cartridge</h2><ol><li>In Schoology, open Resources.</li><li>Choose Import, then Common Cartridge, and pick the .imscc file.</li><li>When it finishes, open the imported folder and use Add to Course.</li></ol>';

    var hasQuiz = items.some(function (it) { return it.type === 'Quiz'; });
    var hand = items.filter(function (it) {
      if (it.type === 'Quiz') return true; // question points always need a look
      if (it.type === 'Assignment') return it.due || it.category || it.rubric || it.points === null;
      if (it.type === 'Discussion') return it.due || it.category || it.rubric;
      return false;
    });
    h += '<h2>Set on each item</h2>';
    if (!hand.length) h += '<p>Nothing to set. No row has a Due, Category, or Rubric value.</p>';
    else {
      h += '<table><tr><th></th><th>Item</th><th>Folder</th><th>Points</th><th>Due</th><th>Category</th><th>Rubric to attach</th></tr>';
      hand.forEach(function (it) {
        h += '<tr><td><span class="box"></span></td><td>' + esc(it.title) + '<br><span class="note">' + it.type + '</span></td><td>' + esc(folderPath(it).join(' / ')) + '</td><td>' +
          (it.type === 'Assignment' ? (it.points === null ? '100 (Schoology default, change it)' : fmtNum(it.points)) : (it.type === 'Quiz' ? 'set per question' : '')) + '</td><td>' + esc(it.due) + '</td><td>' + esc(it.category) + '</td><td>' + esc(it.rubric) + '</td></tr>';
      });
      h += '</table>';
      if (hasQuiz) h += '<p class="note">Schoology sets every imported quiz question to 1 point. Open each quiz and set question points if you weight them.</p>';
    }

    var names = order.filter(function (n) { return used.rubrics[n]; });
    h += '<h2>Rubrics to enter</h2>';
    if (!names.length) h += '<p>No rubrics are used in this build.</p>';
    else {
      h += '<p>No file can import a gradable rubric, so type each one in once. In Schoology, open Resources, choose Add Resources, then Add Rubric. A rubric saved in Resources can be added to any course and reused every year. Enter the criteria in the order shown, with the level points left to right.' +
        (tableEmbedded ? ' The cartridge also adds each rubric as a table at the end of the assignment description, so students can read it. That table is only text: it does not grade anything.' : '') + '</p>';
      names.forEach(function (n) {
        var rb = rubrics[n];
        h += '<h3><span class="box"></span> ' + esc(rb.name) + ' <span class="note">(' + rb.criteria.length + ' criteria, ' + fmtNum(rubricTotal(rb)) + ' points)</span></h3><table>';
        rb.criteria.forEach(function (c, i) {
          h += '<tr><th style="width:26%">' + (i + 1) + '. ' + esc(c.title) + (c.description ? '<br><span class="note" style="font-weight:normal">' + esc(c.description) + '</span>' : '') + '</th>' +
            c.levels.map(function (l) { return '<td><span class="pts">' + fmtNum(l.points) + (l.points === 1 ? ' pt' : ' pts') + '</span><br>' + esc(l.description) + '</td>'; }).join('') + '</tr>';
        });
        h += '</table>';
      });
    }

    if (report.omitted.length) {
      h += '<h2>Questions left out</h2><p>Common Cartridge has no matching or ordering question type. Add these in Schoology after import.</p><table><tr><th></th><th>Quiz</th><th>Type</th><th>Question</th></tr>';
      report.omitted.forEach(function (o) { h += '<tr><td><span class="box"></span></td><td>' + esc(o.quiz) + '</td><td>' + o.type + '</td><td>' + esc(o.prompt) + '</td></tr>'; });
      h += '</table>';
    }
    if (report.warnings.length) {
      h += '<h2>Warnings from the build</h2><ul>' + report.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
    }
    return h + '</body></html>';
  }

  // ---------- zip ----------
  function zip(JSZip, files, type) {
    var z = new JSZip();
    Object.keys(files).forEach(function (p) { z.file(p, files[p]); });
    return z.generateAsync({ type: type || 'uint8array', compression: 'DEFLATE' });
  }

  function parseAll(sheets) {
    return { course: parseCourseRows(sheets.courseRows), rub: parseRubricRows(sheets.rubricRows), qs: parseQuestionRows(sheets.questionRows) };
  }

  return {
    TYPES: TYPES, SEP: SEP,
    readWorkbook: readWorkbook, parseAll: parseAll, fromSpec: fromSpec,
    parseCourseRows: parseCourseRows, parseRubricRows: parseRubricRows, parseQuestionRows: parseQuestionRows,
    checkQuestion: checkQuestion, buildTree: buildTree, treeLines: treeLines, build: build, zip: zip,
    rubricTableHtml: rubricTableHtml, rubricTotal: rubricTotal, toHtml: toHtml, safeFileName: safeFileName
  };
});
