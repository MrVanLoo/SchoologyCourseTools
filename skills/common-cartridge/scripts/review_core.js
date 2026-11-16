/*
 * review_core.js: read a Common Cartridge export and turn it into things a
 * teacher can review: inventory, outline, audit, syllabus skeleton, diff, answer
 * keys, and an editable course workbook.
 *
 * No DOM and no file access, so the same code runs under Node (cc_review.js) and
 * inside the offline Course_Reviewer.html page. Callers pass in JSZip. XML is read
 * with the small parser below so Node and the browser behave identically.
 *
 * inventory() reproduces cc_inventory.py's --json output (the tests compare the
 * two on several cartridges), so the page needs no Python. Nothing here fetches
 * anything from the web.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CCReview = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEP = ' > ';
  var LETTERS = 'ABCDEFGH';
  var CELL_LIMIT = 32767;
  var TAG = { assignment: 'Assignment', page: 'Page', link: 'Link', video: 'Video', discussion: 'Discussion', file: 'File',
    quiz: 'Quiz', missing_video: 'Video', missing: 'Item', other: 'Item' };

  // ================================================================ text helpers

  var HTML_ENT = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', bull: '•',
    middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', times: '×',
    divide: '÷', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', micro: 'µ',
    para: '¶', sect: '§', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', cent: '¢',
    pound: '£', euro: '€', yen: '¥', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
    harr: '↔', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', minus: '−',
    radic: '√', sum: '∑', pi: 'π', Pi: 'Π', theta: 'θ', Theta: 'Θ', alpha: 'α',
    beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', lambda: 'λ', mu: 'μ',
    sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', omega: 'ω', Omega: 'Ω', rho: 'ρ',
    eta: 'η', zeta: 'ζ', ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌', zwj: '‍',
    shy: '­', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', ntilde: 'ñ',
    Ntilde: 'Ñ', agrave: 'à', egrave: 'è', ugrave: 'ù', auml: 'ä', ouml: 'ö', uuml: 'ü',
    Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ccedil: 'ç', Ccedil: 'Ç', acirc: 'â',
    ecirc: 'ê', ocirc: 'ô', icirc: 'î', ucirc: 'û'
  };
  function fromCode(n, m) {
    if (!isFinite(n) || n < 0 || n > 0x10ffff) return m;
    if (n === 0) return '�';
    return String.fromCodePoint(n);
  }
  // HTML entity decoding: numeric entities, and the named entities a course page
  // realistically contains. (Python's html.unescape knows all 2,231; an unknown
  // name is left as written.)
  function htmlUnescape(s) {
    return String(s || '').replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, function (m, e) {
      if (e.charAt(0) === '#') return fromCode(e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10), m);
      return Object.prototype.hasOwnProperty.call(HTML_ENT, e) ? HTML_ENT[e] : m;
    });
  }
  function collapse(s) { return s.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
  function cut(s, n) {
    var cp = Array.from(s);
    return cp.length > n ? cp.slice(0, n).join('').replace(/\s+$/, '') + '…' : s;
  }
  // cc_inventory.py's strip_html and oneline (used by inventory()).
  function stripHtmlInv(s) {
    s = htmlUnescape(s || '');
    s = s.replace(/<input[^>]*>/g, '');
    s = s.replace(/<[^>]+>/g, ' ');
    return collapse(s);
  }
  function onelineInv(s) { return cut(stripHtmlInv(s), 160); }
  // Review text: inline tags vanish so "<strong>Tension</strong>:" reads "Tension:".
  var INLINE_TAGS = /<\/?(?:strong|b|em|i|u|span|a|code|sub|sup|font|mark|small|abbr)\b[^>]*>/gi;
  function plain(s) {
    s = htmlUnescape(s || '');
    s = s.replace(/<input[^>]*>/g, '');
    s = s.replace(INLINE_TAGS, '');
    s = s.replace(/<[^>]+>/g, ' ');
    return collapse(s);
  }
  function oneline(s) { return cut(plain(s), 160); }
  function ytOrLinkIn(txt) {
    var m = /https?:\/\/(?:www\.)?(?:youtu\.be|youtube\.com)\/[^\s"'<>]+/.exec(txt || '');
    return m ? m[0] : null;
  }
  function num(v) {
    if (v === null || v === undefined) return null;
    var t = String(v).replace(/,/g, '').trim();
    if (t === '') return null;
    var n = Number(t);
    return isFinite(n) ? n : null;
  }
  function fmt(n) {
    if (n === null || n === undefined) return '?';
    if (Number.isInteger(n)) return String(n);
    return String(parseFloat(Number(n).toPrecision(6)));
  }
  function where(path) { return path && path.length ? path.join(' / ') : '(top level)'; }

  // ================================================================ XML
  // A small non-validating parser: elements, attributes, text, CDATA, comments,
  // processing instructions, a skipped DOCTYPE, and the XML entities. Namespaces
  // are not resolved: match on local names (lname), as cc_inventory.py does.

  function xmlDecode(s) {
    return s.indexOf('&') < 0 ? s : s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (m, e) {
      if (e.charAt(0) === '#') return fromCode(e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10), m);
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
    });
  }
  function parseXml(text) {
    text = String(text);
    var doc = { name: '#document', local: '#document', attrs: {}, children: [] };
    var stack = [doc], i = text.charCodeAt(0) === 0xfeff ? 1 : 0, n = text.length;
    var nameRe = /[^\s\/>]+/y, attrRe = /\s*([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
    function top() { return stack[stack.length - 1]; }
    function addText(t) { if (t) top().children.push(t); }
    function fail(msg) { throw new Error('XML error at character ' + i + ': ' + msg); }
    while (i < n) {
      var lt = text.indexOf('<', i);
      if (lt < 0) { if (stack.length > 1 && text.slice(i).trim()) addText(xmlDecode(text.slice(i))); break; }
      if (lt > i && stack.length > 1) addText(xmlDecode(text.slice(i, lt)));
      i = lt;
      var e;
      if (text.startsWith('<!--', i)) { e = text.indexOf('-->', i + 4); if (e < 0) fail('unclosed comment'); i = e + 3; continue; }
      if (text.startsWith('<![CDATA[', i)) { e = text.indexOf(']]>', i + 9); if (e < 0) fail('unclosed CDATA'); addText(text.slice(i + 9, e)); i = e + 3; continue; }
      if (text.startsWith('<?', i)) { e = text.indexOf('?>', i + 2); if (e < 0) fail('unclosed processing instruction'); i = e + 2; continue; }
      if (text.startsWith('<!', i)) {
        var depth = 0, j = i + 2;
        for (; j < n; j++) {
          var ch = text.charAt(j);
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '>' && depth <= 0) break;
        }
        if (j >= n) fail('unclosed declaration');
        i = j + 1;
        continue;
      }
      if (text.charAt(i + 1) === '/') {
        e = text.indexOf('>', i);
        if (e < 0) fail('unclosed end tag');
        var endName = text.slice(i + 2, e).trim();
        var open = stack.pop();
        if (!open || open === doc || open.name !== endName) fail('</' + endName + '> does not match <' + (open && open.name) + '>');
        i = e + 1;
        continue;
      }
      nameRe.lastIndex = i + 1;
      var nm = nameRe.exec(text);
      if (!nm) fail('bad start tag');
      var el = { name: nm[0], local: nm[0].split(':').pop(), attrs: {}, children: [] };
      var p = nameRe.lastIndex;
      for (;;) {
        attrRe.lastIndex = p;
        var am = attrRe.exec(text);
        if (!am) break;
        el.attrs[am[1]] = xmlDecode(am[2] !== undefined ? am[2] : am[3]);
        p = attrRe.lastIndex;
      }
      while (p < n && /\s/.test(text.charAt(p))) p++;
      if (stack.length === 1 && doc.children.some(function (c) { return typeof c !== 'string'; })) fail('more than one root element');
      top().children.push(el);
      if (text.startsWith('/>', p)) { i = p + 2; continue; }
      if (text.charAt(p) !== '>') fail('bad attribute in <' + el.name + '>');
      stack.push(el);
      i = p + 1;
    }
    if (stack.length > 1) fail('<' + top().name + '> is never closed');
    var rootEl = doc.children.filter(function (c) { return typeof c !== 'string'; })[0];
    if (!rootEl) fail('no root element');
    return rootEl;
  }
  function kids(el, local) {
    return el.children.filter(function (c) { return typeof c !== 'string' && (!local || c.local === local); });
  }
  function iter(el, local, out) {
    out = out || [];
    if (!local || el.local === local) out.push(el);
    el.children.forEach(function (c) { if (typeof c !== 'string') iter(c, local, out); });
    return out;
  }
  // ElementTree's .text: the text before the first child element (null if none).
  function etText(el) {
    var t = null;
    for (var k = 0; k < el.children.length; k++) {
      var c = el.children[k];
      if (typeof c !== 'string') break;
      t = (t || '') + c;
    }
    return t;
  }
  function allText(el) {
    return el.children.map(function (c) { return typeof c === 'string' ? c : allText(c); }).join('');
  }
  function tryXml(text) { try { return parseXml(text); } catch (e) { return null; } }

  // ================================================================ package access

  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }

  // Read the whole ZIP once into memory: { path: Uint8Array }.
  function openPackage(JSZip, data) {
    return JSZip.loadAsync(data).then(function (z) {
      var names = Object.keys(z.files), files = {}, dirs = {};
      var jobs = names.map(function (nm) {
        if (z.files[nm].dir) { dirs[nm.replace(/\/+$/, '')] = true; return null; }
        return z.files[nm].async('uint8array').then(function (b) { files[nm] = b; });
      });
      return Promise.all(jobs).then(function () {
        Object.keys(files).forEach(function (f) {
          var parts = f.split('/');
          for (var k = 1; k < parts.length; k++) dirs[parts.slice(0, k).join('/')] = true;
        });
        return { files: files, dirs: dirs };
      });
    });
  }
  function pkgText(pkg, path) { return pkg.files[path] ? utf8(pkg.files[path]) : null; }
  function isFile(pkg, path) { return Object.prototype.hasOwnProperty.call(pkg.files, path); }
  function isDir(pkg, path) { return !!pkg.dirs[path.replace(/\/+$/, '')]; }
  function listDir(pkg, dir) {
    var pre = dir.replace(/\/+$/, '') + '/', seen = {};
    Object.keys(pkg.files).concat(Object.keys(pkg.dirs)).forEach(function (p) {
      if (p.indexOf(pre) === 0 && p.length > pre.length) seen[p.slice(pre.length).split('/')[0]] = true;
    });
    return Object.keys(seen).sort();
  }
  function join(base, rel) { return base ? base + '/' + rel : rel; }
  // os.path.normpath-lite for hrefs like "R_0001/./x.html"; absolute paths stay absolute.
  function norm(p) {
    var out = [];
    String(p).split('/').forEach(function (seg) {
      if (seg === '' || seg === '.') return;
      if (seg === '..') out.pop(); else out.push(seg);
    });
    return out.join('/');
  }

  // ================================================================ inventory (port of cc_inventory.py)

  function resourceFiles(c, rid) {
    var d = join(c.base, rid);
    return isDir(c.pkg, d) ? listDir(c.pkg, d) : [];
  }
  function readFirst(c, rid, ext) {
    var files = resourceFiles(c, rid);
    for (var k = 0; k < files.length; k++) {
      var p = join(c.base, rid + '/' + files[k]);
      if (files[k].slice(-ext.length) === ext && isFile(c.pkg, p)) return pkgText(c.pkg, p);
    }
    return null;
  }
  function classify(c, rid, rtype, href, title) {
    var low = (title || '').toLowerCase();
    var files = resourceFiles(c, rid);
    var info = { title: title, ref: rid, raw_type: rtype, href: href };
    var xml, m;
    if (rtype.indexOf('imswl') === 0) {
      xml = readFirst(c, rid, '.xml') || '';
      m = /url href="([^"]+)"/.exec(xml);
      var url = m ? m[1] : '';
      if (url && !/^https?:\/\/|^mailto:/.test(url)) url = 'https://' + url;
      info.kind = low.indexOf('video') >= 0 ? 'video' : 'link';
      info.url = url;
      return info;
    }
    if (rtype.indexOf('imsdt') === 0) {
      xml = readFirst(c, rid, '.xml') || '';
      m = /<text[^>]*>([\s\S]*?)<\/text>/.exec(xml);
      info.kind = 'discussion';
      info.description = m ? onelineInv(m[1]) : '';
      return info;
    }
    if (rtype.indexOf('imsqti') === 0 || rtype.indexOf('/assessment') >= 0) {
      xml = readFirst(c, rid, '.xml') || '';
      info.kind = 'quiz';
      info.questions = (xml.match(/<item ident=/g) || []).length;
      return info;
    }
    var hl = (href || '').toLowerCase();
    var otherAttachment = rtype === 'webcontent' && href && !/(\.html|\.htm|\.xml|\/)$/.test(hl) &&
      href.charAt(0) !== '/' && isFile(c.pkg, join(c.base, norm(href)));
    if (otherAttachment || (rtype === 'webcontent' && /\.(pdf|docx|doc|pptx|xlsx|png|jpg|jpeg|gif)$/.test(hl))) {
      info.kind = 'file';
      info.filename = href.split('/').pop();
      return info;
    }
    if (isDir(c.pkg, join(c.base, rid)) && !files.length) {
      info.kind = low.indexOf('video') >= 0 ? 'missing_video' : 'missing';
      return info;
    }
    var html = readFirst(c, rid, '.html');
    if (html !== null) {
      var pts = /max-points"[^>]*value="([^"]+)"/.exec(html);
      info.description = onelineInv(html);
      var emb = ytOrLinkIn(html);
      if (emb) info.embedded_link = emb;
      if (pts) { info.kind = 'assignment'; info.points = pts[1]; } else info.kind = 'page';
      return info;
    }
    info.kind = 'other';
    return info;
  }

  // ================================================================ QTI

  function mattext(el) {
    var mt = iter(el, 'mattext')[0];
    if (!mt) return '';
    var t = etText(mt) || '';
    return (mt.attrs.texttype || '') === 'text/html' || t.indexOf('<') >= 0 ? plain(t) : collapse(t);
  }
  function positiveConditions(item) {
    var out = [];
    iter(item, 'respcondition').forEach(function (rc) {
      var score = 0;
      iter(rc, 'setvar').forEach(function (sv) {
        var v = parseFloat(String(etText(sv) || '0').trim());
        if (!isFinite(v)) v = 0;
        if ((sv.attrs.action || 'Set') === 'Set' || sv.attrs.action === 'Add') { if (v > 0) score = v; }
      });
      if (score > 0) kids(rc, 'conditionvar').forEach(function (cv) { out.push(cv); });
    });
    return out;
  }
  function varequalsNotNegated(el, out) {
    out = out || [];
    kids(el).forEach(function (ch) {
      if (ch.local === 'not') return;
      if (ch.local === 'varequal') out.push(String(etText(ch) || '').trim());
      else varequalsNotNegated(ch, out);
    });
    return out;
  }
  var PROFILE = { 'cc.multiple_choice.v0p1': 'mc', 'cc.multiple_response.v0p1': 'mr', 'cc.true_false.v0p1': 'tf', 'cc.fib.v0p1': 'fib', 'cc.essay.v0p1': 'essay' };
  // QTI 1.2 text -> [{type: mc|mr|tf|fib|essay|unknown, prompt, choices, correct (indexes), answers, profile}]
  function parseQti(text) {
    var root = tryXml(text);
    if (!root) return [];
    return iter(root, 'item').map(function (item) {
      var profile = '';
      iter(item, 'qtimetadatafield').forEach(function (f) {
        var lab = kids(f, 'fieldlabel'), ent = kids(f, 'fieldentry');
        if (lab.length && ent.length && String(etText(lab[0]) || '').trim() === 'cc_profile') profile = String(etText(ent[0]) || '').trim();
      });
      var pres = kids(item, 'presentation')[0] || item;
      var prompt = '';
      var firstMat = kids(pres, 'material')[0];
      if (firstMat) prompt = mattext(firstMat);
      var labels = iter(pres, 'response_label'), lid = iter(pres, 'response_lid'), rstr = iter(pres, 'response_str');
      var kind = PROFILE[profile];
      var right = [];
      positiveConditions(item).forEach(function (cv) { right = right.concat(varequalsNotNegated(cv)); });
      var ids = labels.map(function (l) { return l.attrs.ident; });
      if (!kind) {
        if (lid.length) {
          kind = lid[0].attrs.rcardinality === 'Multiple' ? 'mr' : 'mc';
          var lowIds = ids.map(function (x) { return String(x || '').toLowerCase(); }).sort().join(',');
          var lowTexts = labels.map(function (l) { return mattext(l).toLowerCase(); }).sort().join(',');
          if (kind === 'mc' && labels.length === 2 && (lowTexts === 'false,true' || lowIds === 'false,true')) kind = 'tf';
        } else if (rstr.length) kind = right.length ? 'fib' : 'essay';
        else kind = 'unknown';
      }
      var q = { type: kind, prompt: prompt, choices: [], correct: [], answers: [], profile: profile };
      if (kind === 'mc' || kind === 'mr') {
        q.choices = labels.map(mattext);
        right.forEach(function (r) { var k = ids.indexOf(r); if (k >= 0) q.correct.push(k); });
      } else if (kind === 'tf') {
        for (var k = 0; k < right.length; k++) {
          var at = ids.indexOf(right[k]);
          if (at >= 0) {
            var t = mattext(labels[at]).toLowerCase() || right[k].toLowerCase();
            q.answers = [t.charAt(0) === 't' ? 'true' : 'false'];
            break;
          }
        }
      } else if (kind === 'fib') {
        q.answers = right.filter(Boolean).map(htmlUnescape);
      }
      return q;
    });
  }

  // ================================================================ load

  // Returns a Promise of the course model used by every report below.
  function load(JSZip, data) {
    return openPackage(JSZip, data).then(function (pkg) {
      var c = { pkg: pkg, base: '' };
      var mpath = 'imsmanifest.xml';
      if (!isFile(pkg, mpath)) {
        var hits = Object.keys(pkg.files).filter(function (f) { return /(^|\/)imsmanifest\.xml$/.test(f); })
          .sort(function (a, b) { return a.split('/').length - b.split('/').length || (a < b ? -1 : 1); });
        if (!hits.length) throw new Error('no imsmanifest.xml found: this is not a Common Cartridge.');
        mpath = hits[0];
        c.base = mpath.replace(/\/?imsmanifest\.xml$/, '');
      }
      var root;
      try { root = parseXml(pkgText(pkg, mpath)); } catch (e) { throw new Error('imsmanifest.xml could not be read: ' + e.message); }
      // title and version (cc_inventory.build)
      c.title = null;
      iter(root, 'title').some(function (g) {
        var strs = iter(g, 'string');
        if (strs.length && etText(strs[0])) { c.title = etText(strs[0]); return true; }
        return false;
      });
      c.title = c.title || '(untitled)';
      var sv = iter(root, 'schemaversion')[0];
      c.version = (sv && etText(sv)) || '(unknown)';
      // resources: first occurrence wins; duplicates recorded (cc_inventory.resource_map)
      c.res = {};
      c.dupIds = [];
      c.allHrefs = [];
      var scope = iter(root, 'resources')[0] || root;
      iter(scope, 'resource').forEach(function (r) {
        var rid = r.attrs.identifier;
        var files = kids(r, 'file').map(function (f) { return f.attrs.href || ''; });
        c.allHrefs.push([rid, r.attrs.href || '']);
        files.forEach(function (f) { c.allHrefs.push([rid, f]); });
        if (Object.prototype.hasOwnProperty.call(c.res, rid)) { c.dupIds.push(rid); return; }
        c.res[rid] = { type: r.attrs.type || '', href: r.attrs.href || '', intendeduse: r.attrs.intendeduse || '', files: files };
      });
      c.org = iter(root, 'organization')[0] || null;
      // inventory nodes (cc_inventory.walk_tree)
      c.invNodes = [];
      if (c.org) {
        var top = kids(c.org, 'item');
        walkInv(c, top.length ? top[0] : c.org, 0);
      }
      // review tree: titles trimmed, full content kept
      c.top = { title: null, path: [], children: [], folder: true };
      c.items = [];
      c.folders = [];
      c.maxDepth = 0;
      if (c.org) {
        var tops = kids(c.org, 'item');
        var start = tops.length === 1 && !tops[0].attrs.identifierref ? tops[0] : c.org;
        walkReview(c, start, c.top);
      }
      return c;
    });
  }
  function itemTitle(node, trim) {
    var t = kids(node, 'title')[0];
    var x = t ? etText(t) : null;
    if (!x) return '(untitled)';
    return trim ? x.trim() : x;
  }
  function walkInv(c, el, depth) {
    kids(el, 'item').forEach(function (node) {
      var title = itemTitle(node, false);
      var ref = node.attrs.identifierref;
      if (ref) {
        var r = c.res[ref] || { type: 'MISSING', href: '' };
        var leaf = classify(c, ref, r.type, r.href, title);
        leaf.depth = depth;
        c.invNodes.push(['item', leaf]);
      } else {
        c.invNodes.push(['group', { title: title, depth: depth }]);
        walkInv(c, node, depth + 1);
      }
    });
  }
  function walkReview(c, el, folder) {
    kids(el, 'item').forEach(function (node) {
      var title = itemTitle(node, true);
      var ref = node.attrs.identifierref;
      if (ref) {
        var it = reviewItem(c, ref, title, folder.path);
        folder.children.push(it);
        c.items.push(it);
        c.maxDepth = Math.max(c.maxDepth, folder.path.length);
      } else {
        var f = { title: title, path: folder.path.concat([title]), children: [], folder: true };
        folder.children.push(f);
        c.folders.push(f);
        c.maxDepth = Math.max(c.maxDepth, f.path.length);
        walkReview(c, node, f);
      }
    });
  }
  function firstFile(c, ref, det, ext) {
    var cands = [det.href].concat(det.files || []);
    for (var k = 0; k < cands.length; k++) {
      var f = cands[k];
      if (f && f.toLowerCase().slice(-ext.length) === ext && f.charAt(0) !== '/') {
        var p = join(c.base, norm(f));
        if (isFile(c.pkg, p)) return p;
      }
    }
    var d = join(c.base, ref);
    if (isDir(c.pkg, d)) {
      var ls = listDir(c.pkg, d);
      for (k = 0; k < ls.length; k++) if (ls[k].toLowerCase().slice(-ext.length) === ext && isFile(c.pkg, d + '/' + ls[k])) return d + '/' + ls[k];
    }
    return null;
  }
  var POINTS_INPUT_RE = /<input\b[^>]*sch-grade-item-max-points[^>]*>/gi;
  function reviewItem(c, ref, title, path) {
    var det = c.res[ref] || { type: 'MISSING', href: '', intendeduse: '', files: [] };
    var info = classify(c, ref, det.type, det.href, title);
    var it = { title: title, ref: ref, path: path.slice(), kind: info.kind, raw_type: det.type, href: det.href,
      intendeduse: det.intendeduse, html: '', url: '', points: null, filename: '', file_path: '', questions: [],
      missing_resource: !c.res[ref] };
    var x, root;
    if (det.type.indexOf('imswl') === 0) {
      x = firstFile(c, ref, det, '.xml');
      root = x ? tryXml(pkgText(c.pkg, x)) : null;
      var u = root ? iter(root, 'url')[0] : null;
      it.url = u ? String(u.attrs.href || '').trim() : '';
    } else if (det.type.indexOf('imsdt') === 0) {
      x = firstFile(c, ref, det, '.xml');
      root = x ? tryXml(pkgText(c.pkg, x)) : null;
      var t = root ? iter(root, 'text')[0] : null;
      if (t) it.html = String(etText(t) || '').trim();
    } else if (info.kind === 'quiz') {
      x = firstFile(c, ref, det, '.xml');
      it.questions = x ? parseQti(pkgText(c.pkg, x)) : [];
    } else if (info.kind === 'file') {
      var p = det.href && det.href.charAt(0) !== '/' ? join(c.base, norm(det.href)) : '';
      if (!(p && isFile(c.pkg, p))) {
        p = '';
        for (var k = 0; k < det.files.length; k++) {
          var q = join(c.base, norm(det.files[k]));
          if (det.files[k] && det.files[k].charAt(0) !== '/' && isFile(c.pkg, q)) { p = q; break; }
        }
      }
      it.file_path = p;
      it.filename = (det.href || det.files[0] || '').split('/').pop();
    } else if (info.kind === 'assignment' || info.kind === 'page') {
      x = firstFile(c, ref, det, '.html');
      var raw = x ? pkgText(c.pkg, x) : '';
      var m = /max-points"[^>]*value="([^"]+)"/.exec(raw);
      it.points = m ? m[1] : null;
      it.html = raw.replace(POINTS_INPUT_RE, '').trim();
    }
    if (it.kind === 'page' && it.intendeduse === 'assignment') it.kind = 'assignment';
    return it;
  }
  function fileBytes(c, it) { return it.file_path ? c.pkg.files[it.file_path] : null; }

  // ================================================================ inventory output

  function inventory(c) {
    var counts = {}, missing = [], embedded = [];
    c.invNodes.forEach(function (tn) {
      if (tn[0] !== 'item') return;
      var nd = tn[1];
      counts[nd.kind] = (counts[nd.kind] || 0) + 1;
      if (nd.kind === 'missing_video' || nd.kind === 'missing') missing.push(nd.title);
      if (nd.embedded_link) embedded.push([nd.title, nd.embedded_link]);
    });
    var dups = c.dupIds.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort();
    var broken = Object.keys(c.res).filter(function (rid) { return c.res[rid].href.charAt(0) === '/'; });
    return {
      title: c.title, cc_version: c.version, counts: counts,
      flags: { dropped_embeds: missing, embedded_links: embedded, duplicate_resources: dups, broken_absolute_hrefs: broken },
      tree: c.invNodes.map(function (tn) { var o = { type: tn[0] }; Object.keys(tn[1]).forEach(function (k) { o[k] = tn[1][k]; }); return o; })
    };
  }
  function invLine(nd) {
    var k = nd.kind, tag = TAG[k] || 'Item', title = nd.title, line;
    if ((k === 'link' || k === 'video') && nd.url) return '- *' + tag + '* — [' + title + '](' + nd.url + ')';
    if (k === 'missing_video' || k === 'missing') return '- *' + tag + '* — ' + title + ' — [!] link/content not in export';
    if (k === 'quiz') return '- *Quiz* — ' + title + ' (' + nd.questions + ' questions)';
    if (k === 'file') return '- *File* — ' + (nd.filename || title);
    if (k === 'assignment') {
      line = '- *Assignment* (' + nd.points + ' pts) — ' + title + (nd.description ? ': ' + nd.description : ' (no instructions in export)');
      if (nd.embedded_link) line += '\n    embedded link: ' + nd.embedded_link;
      return line;
    }
    if (k === 'page' || k === 'discussion') {
      line = '- *' + tag + '* — ' + title + (nd.description ? ': ' + nd.description : '');
      if (nd.embedded_link) line += '\n    embedded link: ' + nd.embedded_link;
      return line;
    }
    return '- *Item* — ' + title;
  }
  // Same layout as `cc_inventory.py` text output, without the extract path.
  function inventoryText(c) {
    var inv = inventory(c), L = [];
    L.push('COURSE: ' + inv.title, 'CC VERSION: ' + inv.cc_version, '', '=== CONTENT INVENTORY ===');
    var keys = Object.keys(inv.counts);
    keys.slice().sort(function (a, b) { return inv.counts[b] - inv.counts[a] || keys.indexOf(a) - keys.indexOf(b); }).forEach(function (k) {
      L.push('  ' + ('   ' + inv.counts[k]).slice(-3) + '  ' + (TAG[k] || k) + (k.indexOf('missing') >= 0 ? ' (dropped/empty)' : ''));
    });
    L.push('  ---  ' + keys.reduce(function (t, k) { return t + inv.counts[k]; }, 0) + ' items total', '', '=== FLAGS ===');
    var f = inv.flags;
    L.push('  Dropped embeds (no URL/content in export): ' + f.dropped_embeds.length);
    f.dropped_embeds.forEach(function (m) { L.push('      - ' + m); });
    if (f.embedded_links.length) {
      L.push('  Links embedded inside content (easy to miss): ' + f.embedded_links.length);
      f.embedded_links.forEach(function (e) { L.push('      - ' + e[0] + ': ' + e[1]); });
    }
    if (f.duplicate_resources.length) L.push('  Duplicate resource identifiers: ' + f.duplicate_resources.join(', '));
    if (f.broken_absolute_hrefs.length) L.push('  Broken absolute hrefs (export artifacts): ' + f.broken_absolute_hrefs.length);
    if (!(f.dropped_embeds.length || f.embedded_links.length || f.duplicate_resources.length || f.broken_absolute_hrefs.length)) L.push('  none detected');
    L.push('', '=== COURSE TREE ===');
    inv.tree.forEach(function (nd) {
      if (nd.type === 'group') { L.push(''); L.push(new Array(Math.min(nd.depth + 1, 6) + 1).join('#') + ' ' + nd.title); }
      else L.push('  ' + invLine(nd).replace(/\n/g, '\n  '));
    });
    return L.join('\n') + '\n';
  }

  // ================================================================ outline
  // Format approved by Bill: Unit = H1, Part = H2, Topic/Project = H3, deeper = H4,
  // items as `- *Assignment* (10 pts) — **Title**: one-line description`.
  // Headings follow the real tree depth, capped at H4.

  function outlineLine(it) {
    var k = it.kind, tag = TAG[k] || 'Item', t = '**' + it.title + '**', line, d;
    if (k === 'assignment') {
      d = oneline(it.html);
      line = '- *Assignment* (' + (it.points !== null ? it.points : '?') + ' pts) — ' + t + (d ? ': ' + d : '');
    } else if (k === 'link' || k === 'video') line = '- *' + tag + '* — ' + t + (it.url ? ': ' + it.url : '');
    else if (k === 'quiz') line = '- *Quiz* (' + it.questions.length + ' questions) — ' + t;
    else if (k === 'file') line = '- *File* — ' + t + (it.filename ? ': ' + it.filename : '');
    else if (k === 'page' || k === 'discussion') { d = oneline(it.html); line = '- *' + tag + '* — ' + t + (d ? ': ' + d : ''); }
    else if (k === 'missing_video' || k === 'missing') line = '- *' + tag + '* — ' + t + ': [!] not in the export, relink from the original';
    else line = '- *Item* — ' + t;
    if (k === 'assignment' || k === 'page' || k === 'discussion') {
      var emb = ytOrLinkIn(it.html);
      if (emb) line += '\n  - embedded link: ' + emb;
    }
    return line;
  }
  function outline(c) {
    var L = ['Course outline: ' + c.title, ''];
    (function rec(folder) {
      var pending = false;
      folder.children.forEach(function (ch) {
        if (ch.folder) {
          if (pending) { L.push(''); pending = false; }
          L.push(new Array(Math.min(ch.path.length, 4) + 1).join('#') + ' ' + ch.title, '');
          if (!ch.children.length) L.push('*(empty folder)*', '');
          rec(ch);
        } else { L.push(outlineLine(ch)); pending = true; }
      });
      if (pending) L.push('');
    })(c.top);
    while (L.length && L[L.length - 1] === '') L.pop();
    return L.join('\n') + '\n';
  }

  // ================================================================ audit

  var URL_OK = /^(https?:\/\/[^\s\/?#]+\.[^\s\/?#]{2,}(:\d+)?([\/?#]\S*)?|mailto:\S+@\S+|https?:\/\/localhost(:\d+)?(\/\S*)?)$/i;
  var AUDIT_ORDER = [
    'Assignments with no points', "Assignments at 100 points (Schoology's default)", 'Items with an empty description',
    'Dropped video and embed content', 'Duplicate titles in one folder', 'Empty folders',
    'Duplicate resource identifiers', 'Absolute href paths', 'Links with a malformed URL',
    'Descriptions containing an image', 'Items that point at a missing resource'
  ];
  function auditFindings(c) {
    var F = [];
    function add(cat, path, detail) { F.push({ category: cat, path: path.slice(), where: where(path), detail: detail }); }
    c.items.forEach(function (it) {
      var p = it.path, t = it.title, k = it.kind;
      if (it.missing_resource) add('Items that point at a missing resource', p, '**' + t + '** (refers to ' + it.ref + ')');
      if (k === 'assignment') {
        if (it.points === null) add('Assignments with no points', p, '**' + t + '**: Schoology will treat it as 100 points');
        else if (num(it.points) === 100) add("Assignments at 100 points (Schoology's default)", p, '**' + t + '**: check that 100 was meant');
      }
      if ((k === 'assignment' || k === 'page' || k === 'discussion') && !plain(it.html)) add('Items with an empty description', p, '**' + t + '** (' + TAG[k] + ')');
      if (k === 'missing_video' || k === 'missing') add('Dropped video and embed content', p, '**' + t + '**: the export kept only the title');
      if ((k === 'link' || k === 'video') && !URL_OK.test(it.url || '')) add('Links with a malformed URL', p, '**' + t + '**: `' + (it.url || '(blank)') + '`');
      if (/<img\b/i.test(it.html || '')) add('Descriptions containing an image', p, '**' + t + '**: Schoology moves embedded images to Unused Resources on import');
    });
    (function dupWalk(folder) {
      var seen = {}, order = [];
      folder.children.forEach(function (ch) {
        if (ch.folder) dupWalk(ch);
        else {
          var key = ch.title.trim().toLowerCase();
          if (!seen[key]) { seen[key] = []; order.push(key); }
          seen[key].push(ch);
        }
      });
      order.forEach(function (key) {
        if (seen[key].length > 1) add('Duplicate titles in one folder', folder.path, '**' + seen[key][0].title + '** appears ' + seen[key].length + ' times');
      });
    })(c.top);
    c.folders.forEach(function (f) { if (!f.children.length) add('Empty folders', f.path.slice(0, -1), '**' + f.title + '**'); });
    var byRef = {};
    c.items.forEach(function (it) { if (!byRef[it.ref]) byRef[it.ref] = it; });
    c.dupIds.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort().forEach(function (rid) {
      var it = byRef[rid];
      add('Duplicate resource identifiers', it ? it.path : [], '`' + rid + '`' + (it ? ' (used by **' + it.title + '**)' : ''));
    });
    var seenAbs = {};
    c.allHrefs.forEach(function (pair) {
      var rid = pair[0], h = pair[1];
      if (h.charAt(0) === '/' || /^[A-Za-z]:[\\\/]/.test(h)) {
        if (seenAbs[rid + '\u0000' + h]) return;
        seenAbs[rid + '\u0000' + h] = true;
        var it = byRef[rid];
        add('Absolute href paths', it ? it.path : [], '`' + h + '` in resource `' + rid + '`' + (it ? ' (**' + it.title + '**)' : ''));
      }
    });
    return F;
  }
  function audit(c) {
    var F = auditFindings(c), groups = {};
    F.forEach(function (f) { (groups[f.category] = groups[f.category] || []).push(f); });
    var ng = Object.keys(groups).length;
    var L = ['# Audit: ' + c.title, '',
      F.length + ' finding' + (F.length === 1 ? '' : 's') + ' in ' + ng + ' categor' + (ng === 1 ? 'y' : 'ies') + '. Links were checked for shape only; nothing was fetched from the web.', '',
      '| Check | Count |', '| --- | --- |'];
    AUDIT_ORDER.forEach(function (cat) { L.push('| ' + cat + ' | ' + (groups[cat] || []).length + ' |'); });
    L.push('');
    AUDIT_ORDER.forEach(function (cat) {
      if (!groups[cat]) return;
      L.push('## ' + cat + ' (' + groups[cat].length + ')', '');
      groups[cat].forEach(function (f) { L.push('- ' + f.where + ': ' + f.detail); });
      L.push('');
    });
    if (!F.length) L.push('No problems found.', '');
    if (c.dupIds.length || c.allHrefs.some(function (p) { return p[1].charAt(0) === '/'; })) {
      L.push("Duplicate identifiers and absolute paths are artifacts of Schoology's export. They are reported here, not errors in the course.", '');
    }
    return { findings: F, markdown: L.join('\n') };
  }

  // ================================================================ syllabus

  var BLANK = function (s) { return '**[TO FILL IN: ' + s + ']**'; };
  // Python's statistics.quantiles(data, n=4, method='inclusive')[2]
  function q3inclusive(data) {
    var n = data.length, m = n - 1, nq = 4, i = 3;
    var j = Math.floor((i * m) / nq), delta = (i * m) % nq;
    return (data[j] * (nq - delta) + data[j + 1] * delta) / nq;
  }
  function itemsUnder(f) {
    var out = [];
    f.children.forEach(function (ch) { if (ch.folder) out = out.concat(itemsUnder(ch)); else out.push(ch); });
    return out;
  }
  function hasPoints(it) { return it.kind === 'assignment' && num(it.points) !== null; }
  function syllabus(c, opts) {
    opts = opts || {};
    var assignments = c.items.filter(hasPoints);
    var pts = assignments.map(function (it) { return num(it.points); }).sort(function (a, b) { return a - b; });
    var major = null, how = '';
    if (opts.majorMin !== undefined && opts.majorMin !== null) { major = opts.majorMin; how = 'at or above ' + fmt(major) + ' points (set with --major-min)'; }
    else if (pts.length >= 2) { major = q3inclusive(pts); how = 'at or above ' + fmt(Math.round(major * 100) / 100) + ' points (the 75th percentile of assignment points in this course)'; }
    else if (pts.length) { major = pts[0]; how = 'at or above ' + fmt(major) + ' points'; }
    var units = c.top.children.filter(function (ch) { return ch.folder; });
    var loose = c.top.children.filter(function (ch) { return !ch.folder; });
    var L = ['# ' + c.title + ': syllabus draft', '',
      '> Built from a Schoology course export. The export holds the course structure, item titles, and points only.',
      '> Every **[TO FILL IN]** below is something the export does not contain. Fill it in or delete it.', '',
      '## Course description', '', BLANK('what the course covers, who it is for, prerequisites'), '',
      '## Contact', '', BLANK('teacher name, email, room, office hours'), '',
      '## Materials', '', BLANK('textbook, software, supplies'), '',
      '## Course sequence', ''];
    units.forEach(function (u, i) {
      L.push('### ' + (i + 1) + '. ' + u.title, '');
      if (u.children.some(function (ch) { return ch.folder; })) {
        L.push('Topics:', '');
        (function topics(f, depth) {
          f.children.forEach(function (ch) { if (ch.folder) { L.push(new Array(depth + 1).join('  ') + '- ' + ch.title); topics(ch, depth + 1); } });
        })(u, 0);
        L.push('');
      }
      if (major !== null) {
        var maj = itemsUnder(u).filter(function (it) { return hasPoints(it) && num(it.points) >= major; });
        if (maj.length) {
          L.push('Major assignments:', '');
          maj.forEach(function (it) { L.push('- ' + it.title + ' (' + fmt(num(it.points)) + ' points)'); });
          L.push('');
        }
      }
      L.push('Dates: ' + BLANK('weeks or dates for this unit'), '');
    });
    if (loose.length) L.push('Items outside any unit: ' + loose.map(function (it) { return it.title; }).join(', '), '');
    if (how) L.push('*Major assignments are those ' + how + '.*', '');
    L.push('## Points by unit', '', '| Unit | Assignments | Points |', '| --- | ---: | ---: |');
    var totalN = 0, totalP = 0;
    var buckets = units.map(function (u) { return [u.title, itemsUnder(u)]; });
    if (loose.length) buckets.push(['(outside any unit)', loose]);
    buckets.forEach(function (b) {
      var a = b[1].filter(hasPoints), p = a.reduce(function (t, it) { return t + num(it.points); }, 0);
      totalN += a.length;
      totalP += p;
      L.push('| ' + b[0].replace(/\|/g, '\\|') + ' | ' + a.length + ' | ' + fmt(p) + ' |');
    });
    L.push('| **Total** | **' + totalN + '** | **' + fmt(totalP) + '** |', '');
    var noPts = c.items.filter(function (it) { return it.kind === 'assignment' && num(it.points) === null; });
    if (noPts.length) L.push(noPts.length + ' assignment(s) have no points in the export and are not counted.', '');
    L.push('## Items by type', '', '| Type | Items | Points |', '| --- | ---: | ---: |');
    var counts = {};
    c.items.forEach(function (it) { var t = TAG[it.kind] || 'Item'; (counts[t] = counts[t] || []).push(it); });
    ['Assignment', 'Quiz', 'Discussion', 'Page', 'Link', 'Video', 'File', 'Item'].forEach(function (t) {
      if (!counts[t]) return;
      var p = t === 'Assignment' ? fmt(counts[t].filter(function (it) { return num(it.points) !== null; }).reduce(function (s, it) { return s + num(it.points); }, 0))
        : (t === 'Quiz' || t === 'Discussion' ? 'not in export' : '—');
      L.push('| ' + t + ' | ' + counts[t].length + ' | ' + p + ' |');
    });
    L.push('', 'Quiz and discussion points are not in the export. Schoology imports quiz questions at 1 point each.', '');
    L.push('## Grading policy', '', BLANK('how grades are calculated, late work, retakes'), '',
      '## Grading categories', '', BLANK('category names and weights. The export does not contain them'), '',
      '## Due dates', '', BLANK('the export does not contain due dates'), '');
    return L.join('\n');
  }

  // ================================================================ diff

  function keyed(c) {
    var out = [], counter = {};
    c.items.forEach(function (it) {
      var base = JSON.stringify([it.path, it.title]);
      var n = counter[base] || 0;
      counter[base] = n + 1;
      out.push({ path: it.path, title: it.title, n: n, key: base + '#' + n, it: it });
    });
    return out;
  }
  function ptsStr(it) { return it.points !== null ? fmt(num(it.points)) : 'none'; }
  function sig(it) {
    return JSON.stringify([it.kind, it.points !== null ? fmt(num(it.points)) : null, plain(it.html), it.url, it.questions.length, it.filename]);
  }
  function changes(a, b) {
    var ch = [];
    if (ptsStr(a) !== ptsStr(b)) ch.push('points ' + ptsStr(a) + ' → ' + ptsStr(b));
    if (a.kind !== b.kind) ch.push('type ' + TAG[a.kind] + ' → ' + TAG[b.kind]);
    if (plain(a.html) !== plain(b.html)) ch.push('description text changed');
    if (a.url !== b.url) ch.push('URL ' + (a.url || '(blank)') + ' → ' + (b.url || '(blank)'));
    if (a.questions.length !== b.questions.length) ch.push('questions ' + a.questions.length + ' → ' + b.questions.length);
    else {
      var qa = JSON.stringify(a.questions.map(function (q) { return [q.type, q.prompt, q.correct, q.answers]; }));
      var qb = JSON.stringify(b.questions.map(function (q) { return [q.type, q.prompt, q.correct, q.answers]; }));
      if (qa !== qb) ch.push('quiz questions or answers changed');
    }
    return ch;
  }
  function diffCourses(oldC, newC) {
    var A = keyed(oldC), B = keyed(newC);
    var bKeys = {}, aKeys = {};
    B.forEach(function (x) { bKeys[x.key] = x; });
    A.forEach(function (x) { aKeys[x.key] = x; });
    var removed = A.filter(function (x) { return !bKeys[x.key]; });
    var added = B.filter(function (x) { return !aKeys[x.key]; });
    var changed = [];
    A.forEach(function (x) {
      if (!bKeys[x.key]) return;
      var ch = changes(x.it, bKeys[x.key].it);
      if (ch.length) changed.push({ path: x.path, title: x.title, changes: ch });
    });
    var moved = [], renamed = [];
    removed.slice().forEach(function (x) {
      for (var k = 0; k < added.length; k++) {
        var y = added[k];
        if (x.title === y.title && JSON.stringify(x.path) !== JSON.stringify(y.path) && x.it.kind === y.it.kind) {
          moved.push({ title: x.title, from: x.path, to: y.path, changes: changes(x.it, y.it) });
          removed.splice(removed.indexOf(x), 1);
          added.splice(k, 1);
          return;
        }
      }
    });
    removed.slice().forEach(function (x) {
      for (var k = 0; k < added.length; k++) {
        var y = added[k];
        if (JSON.stringify(x.path) === JSON.stringify(y.path) && sig(x.it) === sig(y.it)) {
          renamed.push({ path: x.path, from: x.title, to: y.title });
          removed.splice(removed.indexOf(x), 1);
          added.splice(k, 1);
          return;
        }
      }
    });
    function brief(x) { return { path: x.path, title: x.title, type: TAG[x.it.kind] || 'Item' }; }
    return { added: added.map(brief), removed: removed.map(brief), moved: moved, renamed: renamed, changed: changed };
  }
  function diff(oldC, newC) {
    var d = diffCourses(oldC, newC);
    var n = d.added.length + d.removed.length + d.moved.length + d.renamed.length + d.changed.length;
    var L = ['# Changes: ' + oldC.title + ' → ' + newC.title, '',
      'Items are matched by folder path and title. ' + n + ' difference' + (n === 1 ? '' : 's') + '.', '',
      '| Change | Count |', '| --- | ---: |'];
    ['added', 'removed', 'moved', 'renamed', 'changed'].forEach(function (k) { L.push('| ' + k.charAt(0).toUpperCase() + k.slice(1) + ' | ' + d[k].length + ' |'); });
    L.push('');
    if (d.added.length) { L.push('## Added (' + d.added.length + ')', ''); d.added.forEach(function (x) { L.push('- ' + where(x.path) + ': **' + x.title + '** (' + x.type + ')'); }); L.push(''); }
    if (d.removed.length) { L.push('## Removed (' + d.removed.length + ')', ''); d.removed.forEach(function (x) { L.push('- ' + where(x.path) + ': **' + x.title + '** (' + x.type + ')'); }); L.push(''); }
    if (d.moved.length) { L.push('## Moved (' + d.moved.length + ')', ''); d.moved.forEach(function (x) { L.push('- **' + x.title + '**: ' + where(x.from) + ' → ' + where(x.to) + (x.changes.length ? '; ' + x.changes.join('; ') : '')); }); L.push(''); }
    if (d.renamed.length) { L.push('## Renamed (' + d.renamed.length + ')', ''); d.renamed.forEach(function (x) { L.push('- ' + where(x.path) + ': **' + x.from + '** → **' + x.to + '**'); }); L.push(''); }
    if (d.changed.length) { L.push('## Changed (' + d.changed.length + ')', ''); d.changed.forEach(function (x) { L.push('- ' + where(x.path) + ': **' + x.title + '**: ' + x.changes.join('; ')); }); L.push(''); }
    return { result: d, count: n, markdown: L.join('\n') };
  }

  // ================================================================ answer keys

  function answerKeys(c) {
    return c.items.filter(function (it) { return it.kind === 'quiz'; }).map(function (it) {
      return { quiz: it.title, folder: where(it.path), questions: it.questions.map(function (q) {
        var o = { type: q.type, prompt: q.prompt };
        if (q.type === 'mc' || q.type === 'mr') { o.choices = q.choices; o.correct = q.correct; o.correct_letters = q.correct.map(function (i) { return LETTERS.charAt(i); }).join(', '); }
        if (q.type === 'tf' || q.type === 'fib') o.answers = q.answers;
        return o;
      }) };
    });
  }

  // ================================================================ workbook export

  var QHUMAN = { mc: 'Multiple choice', mr: 'Select all', tf: 'True/False', fib: 'Short answer', essay: 'Essay' };
  // The rows for the course workbook, plus attachments and messages. No file I/O.
  function workbookRows(c) {
    var rows = [], qrows = [], notes = [], files = [], usedNames = {}, quizTitles = {};
    c.items.forEach(function (it) {
      var p = it.path;
      var row = { Unit: p.length ? p[0] : '', Topic: p.length > 1 ? p.slice(1).join(SEP) : '', Title: it.title };
      if (p.some(function (x) { return x.indexOf(SEP) >= 0; })) notes.push('Folder name contains " > ", which the builder reads as nesting: ' + where(p));
      var k = it.kind;
      if (k === 'assignment') {
        row.Type = 'Assignment';
        row.Description = it.html;
        row.Points = it.points === null ? null : (num(it.points) !== null ? num(it.points) : it.points);
      } else if (k === 'page') { row.Type = 'Page'; row.Description = it.html; }
      else if (k === 'discussion') { row.Type = 'Discussion'; row.Description = it.html; }
      else if ((k === 'link' || k === 'video') && it.url) { row.Type = 'Link'; row.URL = it.url; }
      else if (k === 'file' && it.file_path) {
        var name = it.filename || it.file_path.split('/').pop();
        var dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
        var n = usedNames[name.toLowerCase()] || 0;
        usedNames[name.toLowerCase()] = n + 1;
        if (n) {
          name = base + '_' + (n + 1) + ext;
          notes.push('Two files share a name, so one was saved as ' + name + ' (' + where(p) + ')');
        }
        files.push({ name: name, bytes: fileBytes(c, it) });
        row.Type = 'File';
        row.File = name;
      } else if (k === 'quiz') {
        var title = it.title, qn = quizTitles[title] || 0;
        quizTitles[title] = qn + 1;
        if (qn) {
          title = title + ' (' + (qn + 1) + ')';
          row.Title = title;
          notes.push('Two quizzes share a title, so one was renamed to "' + title + '" (' + where(p) + ')');
        }
        row.Type = 'Quiz';
        it.questions.forEach(function (q) {
          if (!QHUMAN[q.type]) { notes.push('Quiz "' + title + '": a question of unknown type (' + (q.profile || 'no profile') + ') was skipped'); return; }
          var qr = { Quiz: title, Type: QHUMAN[q.type], Question: q.prompt };
          if (q.type === 'mc' || q.type === 'mr') {
            qr.Answer = q.correct.filter(function (i) { return i < LETTERS.length; }).map(function (i) { return LETTERS.charAt(i); }).join(', ');
            q.choices.slice(0, LETTERS.length).forEach(function (ch, i) { qr['Choice ' + LETTERS.charAt(i)] = ch; });
          } else if (q.type === 'tf') qr.Answer = q.answers[0] === 'true' ? 'True' : (q.answers[0] === 'false' ? 'False' : '');
          else if (q.type === 'fib') qr.Answer = q.answers.join(' | ');
          qrows.push(qr);
        });
        if (!it.questions.length) notes.push('Quiz "' + title + '" has no questions in the export');
      } else {
        var why = { missing_video: 'This video was embedded in Schoology and the export kept only its title.',
          missing: 'This item was embedded in Schoology and the export kept only its title.',
          file: 'The export lists this file but the file itself is not in the package.' }[k] ||
          'The export has this item as a type the builder cannot make (' + it.raw_type + ').';
        row.Type = 'Link';
        row.URL = '';
        row.Description = 'NOT IN EXPORT: ' + why + ' Paste the original URL in the URL column, or delete this row.';
      }
      rows.push(row);
    });
    var deep = c.maxDepth > 2;
    var msgs = [];
    msgs.push('The course is ' + c.maxDepth + ' level' + (c.maxDepth === 1 ? '' : 's') + ' deep. ' +
      (deep ? 'Folders deeper than Unit and Topic are written with " > " inside the Topic column.' : '" > " nesting was not needed.'));
    msgs.push('The Rubrics tab is empty: a Schoology export never contains rubrics.');
    var empties = c.folders.filter(function (f) { return !f.children.length; });
    if (empties.length) {
      msgs.push(empties.length + ' empty folder(s) are not in the workbook (a workbook row is always an item):');
      empties.forEach(function (f) { msgs.push('  - ' + where(f.path)); });
    }
    var blanks = rows.filter(function (r) { return r.Type === 'Link' && !r.URL; });
    if (blanks.length) {
      msgs.push(blanks.length + ' row(s) need a URL before the workbook will build (dropped embeds or missing files):');
      blanks.forEach(function (r) { msgs.push('  - ' + where([r.Unit, r.Topic].filter(Boolean)) + ': ' + r.Title); });
    }
    notes.forEach(function (nn) { msgs.push('Note: ' + nn); });
    return { course: rows, rubrics: [], questions: qrows, files: files, messages: msgs, depth: c.maxDepth, nested: deep };
  }

  // ---- xlsx: fill rows into the formatted template, keeping its dropdowns,
  // header comments, frozen header row, and column widths.
  function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(n) { var s = ''; n += 1; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function cleanCell(v) { return String(v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); }
  function addBodyStyles(styles) {
    // a body font (Arial 10) and two cell formats: top-aligned, and top-aligned with wrap
    var fontIdx;
    var fm = /<fonts count="(\d+)"[^>]*>([\s\S]*?)<\/fonts>/.exec(styles);
    var fontList = fm[2].match(/<font\b[\s\S]*?<\/font>|<font\b[^>]*\/>/g) || [];
    for (var k = 0; k < fontList.length; k++) {
      if (/<name val="Arial"/.test(fontList[k]) && /<sz val="10"/.test(fontList[k]) && !/<b\b/.test(fontList[k])) { fontIdx = k; break; }
    }
    if (fontIdx === undefined) {
      fontIdx = fontList.length;
      styles = styles.replace(/<fonts count="\d+"([^>]*)>([\s\S]*?)<\/fonts>/, function (m, a, inner) {
        return '<fonts count="' + (fontIdx + 1) + '"' + a + '>' + inner + '<font><name val="Arial" /><sz val="10" /></font></fonts>';
      });
    }
    var xm = /<cellXfs count="(\d+)"/.exec(styles);
    var base = Number(xm[1]);
    styles = styles.replace(/<cellXfs count="\d+"([^>]*)>([\s\S]*?)<\/cellXfs>/, function (m, a, inner) {
      return '<cellXfs count="' + (base + 2) + '"' + a + '>' + inner +
        '<xf numFmtId="0" fontId="' + fontIdx + '" fillId="0" borderId="0" applyFont="1" applyAlignment="1" xfId="0"><alignment vertical="top" /></xf>' +
        '<xf numFmtId="0" fontId="' + fontIdx + '" fillId="0" borderId="0" applyFont="1" applyAlignment="1" xfId="0"><alignment vertical="top" wrapText="1" /></xf></cellXfs>';
    });
    return { styles: styles, plain: base, wrap: base + 1 };
  }
  function fillSheet(xml, rows, st, warn, sheetName) {
    var head = /<row r="1"[^>]*>([\s\S]*?)<\/row>/.exec(xml);
    var headers = [];
    if (head) {
      (head[1].match(/<c\b[\s\S]*?<\/c>/g) || []).forEach(function (cell) {
        var t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell);
        headers.push(t ? xmlDecode(t[1]) : '');
      });
    }
    var headerXml = head ? head[0] : '<row r="1"></row>';
    // columns the data needs that the template lacks (for example Choice G)
    var lower = headers.map(function (h) { return h.toLowerCase(); });
    rows.forEach(function (r) {
      Object.keys(r).forEach(function (k) {
        if (r[k] === null || r[k] === undefined || r[k] === '') return;
        if (lower.indexOf(k.toLowerCase()) < 0) {
          headers.push(k);
          lower.push(k.toLowerCase());
          headerXml = headerXml.replace(/<\/row>$/, '<c r="' + colName(headers.length - 1) + '1" s="1" t="inlineStr"><is><t>' + xmlEsc(k) + '</t></is></c></row>');
        }
      });
    });
    var wrapCols = {};
    headers.forEach(function (h) { if (h === 'Description' || h === 'Question' || h === 'Title' || / Description$/.test(h)) wrapCols[h] = true; });
    var body = rows.map(function (r, ri) {
      var rn = ri + 2, lk = {};
      Object.keys(r).forEach(function (k) { lk[k.toLowerCase()] = r[k]; });
      var cells = headers.map(function (h, ci) {
        var v = lk[h.toLowerCase()];
        if (v === null || v === undefined || v === '') return '';
        var ref = colName(ci) + rn, s = wrapCols[h] ? st.wrap : st.plain;
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '" s="' + s + '"><v>' + v + '</v></c>';
        v = cleanCell(v);
        if (v.length > CELL_LIMIT) {
          warn(sheetName + ' row ' + rn + ', ' + h + ': text is ' + v.length + " characters, over Excel's " + CELL_LIMIT + ' limit, so it was cut short. Check this item after building.');
          v = v.slice(0, CELL_LIMIT);
        }
        return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + rn + '">' + cells + '</row>';
    }).join('');
    var lastCol = colName(Math.max(headers.length, 1) - 1), lastRow = rows.length + 1;
    xml = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>|<sheetData\s*\/>/, '<sheetData>' + headerXml + body + '</sheetData>');
    xml = xml.replace(/<dimension ref="[^"]*"\s*\/>/, '<dimension ref="A1:' + lastCol + lastRow + '" />');
    return xml;
  }
  // tables: { Course: [rows], Rubrics: [rows], Questions: [rows] } -> Promise<Uint8Array>
  function writeWorkbook(JSZip, templateBytes, tables, warn) {
    warn = warn || function () {};
    return JSZip.loadAsync(templateBytes).then(function (z) {
      return Promise.all([z.file('xl/workbook.xml').async('string'), z.file('xl/_rels/workbook.xml.rels').async('string'), z.file('xl/styles.xml').async('string')])
        .then(function (r) {
          var wb = r[0], rels = r[1];
          var st = addBodyStyles(r[2]);
          z.file('xl/styles.xml', st.styles);
          var jobs = [];
          (wb.match(/<sheet\b[^>]*>/g) || []).forEach(function (tag) {
            var name = xmlDecode((/name="([^"]*)"/.exec(tag) || [])[1] || '');
            var rid = (/r:id="([^"]*)"/.exec(tag) || [])[1];
            var rows = tables[name];
            if (!rows || !rows.length) return;
            var rel = new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>').exec(rels);
            var target = rel && /Target="([^"]*)"/.exec(rel[0])[1];
            var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target;
            jobs.push(z.file(path).async('string').then(function (xml) { z.file(path, fillSheet(xml, rows, st, warn, name)); }));
          });
          return Promise.all(jobs);
        })
        .then(function () { return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }); });
    });
  }

  return {
    load: load, parseXml: parseXml, parseQti: parseQti, htmlUnescape: htmlUnescape, plain: plain,
    inventory: inventory, inventoryText: inventoryText, outline: outline,
    auditFindings: auditFindings, audit: audit, syllabus: syllabus,
    diffCourses: diffCourses, diff: diff, answerKeys: answerKeys,
    workbookRows: workbookRows, writeWorkbook: writeWorkbook, where: where, AUDIT_ORDER: AUDIT_ORDER
  };
});
