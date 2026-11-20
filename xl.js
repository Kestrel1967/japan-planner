/* Japan Planner - reading and writing the Excel file.
   An .xlsx is a zip of XML files. We unzip, change only the cells we need, and zip again.
   Everything else in the file (colours, dropdowns, formulas, tables) is copied through untouched. */
(function (root) {
  'use strict';
  var XL = root.XL = {};
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function fail(msg) { var e = new Error(msg); e.friendly = true; throw e; }
  function parseXml(u8, what) {
    var doc = new DOMParser().parseFromString(fflate.strFromU8(u8).replace(/^﻿/, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) fail('The Excel file has a part I cannot read (' + what + ').');
    return doc;
  }
  function ser(doc) { return fflate.strToU8(DECL + new XMLSerializer().serializeToString(doc.documentElement)); }
  function kids(el, name) { var o = []; for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || n.localName === name)) o.push(n); return o; }
  function first(el, name) { for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === name) return n; return null; }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function splitRef(ref) { var m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); return m ? { c: colNum(m[1]), r: +m[2] } : null; }
  function norm(p) { var out = []; p.split('/').forEach(function (s) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }); return out.join('/'); }
  function relsOf(files, path) {
    var i = path.lastIndexOf('/'), dir = path.slice(0, i + 1), rp = dir + '_rels/' + path.slice(i + 1) + '.rels', map = {};
    if (!files[rp]) return map;
    kids(parseXml(files[rp], rp).documentElement, 'Relationship').forEach(function (r) {
      var t = r.getAttribute('Target') || '';
      map[r.getAttribute('Id')] = { type: r.getAttribute('Type') || '', path: t.charAt(0) === '/' ? t.slice(1) : norm(dir + t) };
    });
    return map;
  }

  // ---- dates: Excel stores a date as a day count, a time as a fraction of a day
  function isoToSerial(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) + 25569 : null; }
  function serialToIso(n) { var d = new Date(Math.round((Math.floor(n) - 25569) * 86400000)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  function hmToFrac(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s); return m ? (+m[1] * 60 + +m[2]) / 1440 : null; }
  function fracToHm(n) { var t = Math.round((n - Math.floor(n)) * 1440); if (t >= 1440) t = 0; var h = Math.floor(t / 60), m = t % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function isNum(s) { return s !== '' && s != null && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(String(s).trim()); }
  function tidy(s) { var n = parseFloat(s); return isNaN(n) ? String(s) : String(Math.round(n * 1e6) / 1e6); }
  XL.isoToSerial = isoToSerial;

  // ---------------------------------------------------------------- open a workbook
  XL.open = function (bytes) {
    var files;
    try { files = fflate.unzipSync(bytes); } catch (e) { fail('This does not look like an Excel (.xlsx) file.'); }
    if (!files['xl/workbook.xml']) fail('This does not look like an Excel (.xlsx) file.');
    var wb = { files: files, docs: {}, sheets: {}, shared: [], dirty: {} };
    var wdoc = wb.docs['xl/workbook.xml'] = parseXml(files['xl/workbook.xml'], 'workbook');
    var rels = relsOf(files, 'xl/workbook.xml');
    var sheetsEl = first(wdoc.documentElement, 'sheets');
    kids(sheetsEl, 'sheet').forEach(function (s) {
      var rid = s.getAttributeNS(REL, 'id') || s.getAttribute('r:id'), r = rels[rid];
      if (r) wb.sheets[s.getAttribute('name')] = { path: r.path };
    });
    if (files['xl/sharedStrings.xml']) {
      kids(parseXml(files['xl/sharedStrings.xml'], 'texts').documentElement, 'si').forEach(function (si) { wb.shared.push(siText(si)); });
    }
    return wb;
  };
  function siText(si) {                          // plain or rich text, without phonetic hints
    var out = '';
    kids(si).forEach(function (k) {
      if (k.localName === 't') out += k.textContent;
      else if (k.localName === 'r') kids(k, 't').forEach(function (t) { out += t.textContent; });
    });
    return out;
  }
  function sheet(wb, name) {
    var s = wb.sheets[name];
    if (!s) return null;
    if (s.doc) return s;
    s.doc = wb.docs[s.path] = parseXml(wb.files[s.path], name);
    s.data = first(s.doc.documentElement, 'sheetData');
    s.rows = {};
    kids(s.data, 'row').forEach(function (r) { s.rows[+r.getAttribute('r')] = r; });
    s.table = null;
    var rels = relsOf(wb.files, s.path);
    Object.keys(rels).forEach(function (id) {
      if (s.table || !/\/table$/.test(rels[id].type) || !wb.files[rels[id].path]) return;
      var tdoc = wb.docs[rels[id].path] = parseXml(wb.files[rels[id].path], 'table');
      var ref = (tdoc.documentElement.getAttribute('ref') || '').split(':');
      var a = splitRef(ref[0]), b = splitRef(ref[1] || ref[0]);
      if (a && b) s.table = { path: rels[id].path, doc: tdoc, c1: a.c, r1: a.r, c2: b.c, r2: b.r };
    });
    return s;
  }
  function cellOf(s, r, c) {
    var row = s.rows[r]; if (!row) return null;
    var want = colName(c) + r;
    for (var n = row.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.getAttribute('r') === want) return n;
    return null;
  }
  function raw(wb, cell) {                        // {v: text, num: true when Excel holds a number}
    if (!cell) return { v: '', num: false };
    var t = cell.getAttribute('t'), v = first(cell, 'v'), txt = v ? v.textContent : '';
    if (t === 's') return { v: wb.shared[+txt] || '', num: false };
    if (t === 'inlineStr') { var is = first(cell, 'is'); return { v: is ? siText(is) : '', num: false }; }
    if (t === 'str' || t === 'b') return { v: txt, num: false };
    if (t === 'e') return { v: '', num: false };
    return { v: txt, num: txt !== '' };
  }
  function show(kind, x) {                        // Excel value -> the text the app works with
    if (!x.num) return x.v;
    var n = parseFloat(x.v);
    if (kind === 'date') return serialToIso(n);
    if (kind === 'time') return fracToHm(n);
    return tidy(x.v);
  }

  // ---------------------------------------------------------------- read everything the app shows
  XL.read = function (wb, schema) {
    var out = { sheets: {}, lists: {}, tripDates: [], missing: [] };
    var L = sheet(wb, 'Lists');
    if (L) {
      var heads = {};
      for (var c = 1; c <= 60; c++) { var hv = raw(wb, cellOf(L, 3, c)).v.trim(); if (hv) heads[hv] = c; }
      Object.keys(schema.lists).forEach(function (ln) {
        var col = heads[schema.lists[ln]], arr = [];
        if (col) for (var r = 4; r <= 200; r++) { var x = raw(wb, cellOf(L, r, col)); var t = show('text', x).trim(); if (t) arr.push(t); }
        out.lists[ln] = arr;
      });
    }
    Object.keys(schema.sheets).forEach(function (name) {
      var s = sheet(wb, name), def = schema.sheets[name];
      if (!s) { out.missing.push(name); out.sheets[name] = []; return; }
      var map = layout(wb, s, def), rows = [];
      for (var r = map.hr + 1; r <= map.last; r++) {
        if (!s.rows[r]) continue;
        var v = {}, any = false;
        def.cols.forEach(function (cd) {
          var c = map.col[cd.h]; if (!c) return;
          var t = show(cd.list === 'L_TripDates' ? 'date' : cd.k, raw(wb, cellOf(s, r, c)));
          if (t !== '') { v[cd.h] = t; if (cd.k !== 'auto' && !(def.fixed && def.fixed.indexOf(cd.h) >= 0)) any = true; }
        });
        if (any || def.fixed) rows.push({ r: r, v: v });
      }
      if (def.fixed) rows = rows.filter(function (x) { return x.v[def.fixed[0]]; });
      out.sheets[name] = rows;
    });
    (out.sheets.Itinerary || []).forEach(function (x) { if (x.v.Date) out.tripDates.push(x.v.Date); });
    return out;
  };
  // where the header row, the columns and the last row of a sheet's table are right now
  function layout(wb, s, def) {
    var hr = s.table ? s.table.r1 : def.hr, col = {}, maxc = s.table ? s.table.c2 : 60;
    for (var c = 1; c <= maxc; c++) { var t = raw(wb, cellOf(s, hr, c)).v.trim(); if (t) col[t] = c; }
    var last = hr;
    if (s.table) last = s.table.r2;
    else Object.keys(s.rows).forEach(function (r) { if (+r > last) last = +r; });
    return { hr: hr, col: col, last: last };
  }

  // ---------------------------------------------------------------- write
  function rowEl(s, r) {
    if (s.rows[r]) return s.rows[r];
    var el = s.doc.createElementNS(s.doc.documentElement.namespaceURI, 'row');
    el.setAttribute('r', String(r));
    var after = null;
    kids(s.data, 'row').forEach(function (x) { if (+x.getAttribute('r') < r) after = x; });
    s.data.insertBefore(el, after ? after.nextSibling : s.data.firstChild);
    s.rows[r] = el; return el;
  }
  function cellEl(s, r, c, styleRow) {
    var have = cellOf(s, r, c); if (have) return have;
    var row = rowEl(s, r), el = s.doc.createElementNS(s.doc.documentElement.namespaceURI, 'c');
    el.setAttribute('r', colName(c) + r);
    var model = styleRow ? cellOf(s, styleRow, c) : null;
    if (model && model.getAttribute('s')) el.setAttribute('s', model.getAttribute('s'));
    var before = null;
    kids(row, 'c').some(function (x) { var p = splitRef(x.getAttribute('r') || ''); if (p && p.c > c) { before = x; return true; } return false; });
    row.insertBefore(el, before);
    return el;
  }
  // A date written into a cell that has no date format would show as a number (46492), so give it one.
  function dateStyle(wb, cell) {
    var p = 'xl/styles.xml'; if (!wb.files[p]) return;
    var doc = wb.docs[p] || (wb.docs[p] = parseXml(wb.files[p], 'styles'));
    var xfs = first(doc.documentElement, 'cellXfs'); if (!xfs) return;
    var list = kids(xfs, 'xf'), idx = +(cell.getAttribute('s') || 0), xf = list[idx]; if (!xf) return;
    if ((xf.getAttribute('numFmtId') || '0') !== '0') return;        // already has a number or date format
    wb.dateXf = wb.dateXf || {};
    if (wb.dateXf[idx] == null) {
      var copy = xf.cloneNode(true);
      copy.setAttribute('numFmtId', '15'); copy.setAttribute('applyNumberFormat', '1');   // 15 = built-in "d-mmm-yy"
      xfs.appendChild(copy); xfs.setAttribute('count', String(list.length + 1));
      wb.dateXf[idx] = list.length; wb.dirty[p] = 1;
    }
    cell.setAttribute('s', String(wb.dateXf[idx]));
  }
  function put(s, cell, kind, text, wb) {         // text from the app -> the right Excel cell type
    if (first(cell, 'f')) return;                 // never overwrite a formula
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.removeAttribute('t');
    text = text == null ? '' : String(text);
    if (text === '') return;
    var ns = s.doc.documentElement.namespaceURI, num = null;
    if (kind === 'date') { num = isoToSerial(text); if (num != null && wb) dateStyle(wb, cell); }
    else if (kind === 'time') num = hmToFrac(text);
    else if ((kind === 'money' || kind === 'num' || kind === 'int') && isNum(text)) num = parseFloat(text);
    if (num != null) { var v = s.doc.createElementNS(ns, 'v'); v.textContent = String(num); cell.appendChild(v); return; }
    cell.setAttribute('t', 'inlineStr');
    var is = s.doc.createElementNS(ns, 'is'), t = s.doc.createElementNS(ns, 't');
    if (/^\s|\s$|\n/.test(text)) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    t.textContent = text.replace(/\r\n?/g, '\n'); is.appendChild(t); cell.appendChild(is);
  }
  function kindOf(cd) { return cd.list === 'L_TripDates' ? 'date' : cd.k; }
  function rowVals(wb, s, def, map, r) {
    var v = {};
    def.cols.forEach(function (cd) { var c = map.col[cd.h]; if (c) { var t = show(kindOf(cd), raw(wb, cellOf(s, r, c))); if (t !== '') v[cd.h] = t; } });
    return v;
  }
  function isEmpty(v, def) { return !def.cols.some(function (cd) { return cd.k !== 'auto' && v[cd.h]; }); }
  function sameId(v, before, def) { return def.id.every(function (h) { return (v[h] || '') === (before[h] || ''); }); }

  function growTable(wb, s, def, map) {           // add one styled row under the table
    var r = map.last + 1, t = s.table, c;
    if (s.rows[r] && kids(s.rows[r], 'c').some(function (x) { return first(x, 'v') || first(x, 'is') || first(x, 'f'); })) fail('The "' + def.name + '" list is full and something is written right under it in Excel. Add rows in Excel, then try again.');
    for (c = (t ? t.c1 : 1); c <= (t ? t.c2 : def.cols.length); c++) {
      var cell = cellEl(s, r, c, map.last), src = cellOf(s, map.hr + 1, c), f = src && first(src, 'f');
      if (f && f.textContent && !f.getAttribute('t') || (f && f.textContent && f.getAttribute('t') === 'shared')) {
        var from = map.hr + 1, nf = s.doc.createElementNS(s.doc.documentElement.namespaceURI, 'f');
        nf.textContent = f.textContent.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(])/g, function (m, d1, col, d2, num) { return (!d2 && +num === from) ? d1 + col + r : m; });
        while (cell.firstChild) cell.removeChild(cell.firstChild);
        cell.removeAttribute('t'); cell.appendChild(nf);
      }
    }
    if (t) {
      t.r2 = r;
      var ref = colName(t.c1) + t.r1 + ':' + colName(t.c2) + r;
      t.doc.documentElement.setAttribute('ref', ref);
      var af = first(t.doc.documentElement, 'autoFilter'); if (af) af.setAttribute('ref', ref);
      wb.dirty[t.path] = 1;
    }
    var dim = first(s.doc.documentElement, 'dimension');
    if (dim) { var p = (dim.getAttribute('ref') || '').split(':'), b = splitRef(p[1] || p[0]); if (b && b.r < r) dim.setAttribute('ref', p[0] + ':' + colName(b.c) + r); }
    map.last = r;
    return r;
  }

  /* ops: [{sheet, r (row number or null for a new record), before: {...}, v: {changed fields}, del: bool}]
     Returns {moved: n} - how many changes had to be saved as a new row because the row changed in Excel. */
  XL.apply = function (wb, schema, ops) {
    var moved = 0;
    ops.forEach(function (op) {
      var def = schema.sheets[op.sheet], s = sheet(wb, op.sheet);
      if (!def || !s) return;
      var map = layout(wb, s, def), r = op.r, r2, before = op.before || {};
      if (r != null) {                            // an existing row: make sure it is still the same record
        var ok = r > map.hr && r <= map.last && sameId(rowVals(wb, s, def, map, r), before, def);
        if (!ok) {
          r = null;
          for (r2 = map.hr + 1; r2 <= map.last; r2++) { var cur = rowVals(wb, s, def, map, r2); if (!isEmpty(cur, def) && sameId(cur, before, def)) { r = r2; break; } }
          if (r == null) { if (op.del || def.fixed) return; moved++; }
        }
      }
      var vals = op.v || {};
      if (r == null) {                            // a new record: first empty row, or one more row
        if (op.del) return;
        if (op.r != null) { var merged = {}; Object.keys(before).forEach(function (k) { merged[k] = before[k]; }); Object.keys(vals).forEach(function (k) { merged[k] = vals[k]; }); vals = merged; }
        for (r2 = map.hr + 1; r2 <= map.last; r2++) if (isEmpty(rowVals(wb, s, def, map, r2), def)) { r = r2; break; }
        if (r == null) r = growTable(wb, s, def, map);
      }
      def.cols.forEach(function (cd) {
        var c = map.col[cd.h];
        if (!c || cd.k === 'auto') return;
        if (def.fixed && def.fixed.indexOf(cd.h) >= 0) return;
        if (op.del) { var ex = cellOf(s, r, c); if (ex) put(s, ex, cd.k, ''); return; }
        if (!(cd.h in vals)) return;
        put(s, cellEl(s, r, c, map.hr + 1), kindOf(cd), vals[cd.h], wb);
      });
      wb.dirty[s.path] = 1;
    });
    return { moved: moved };
  };

  XL.save = function (wb) {
    var wdoc = wb.docs['xl/workbook.xml'], calc = first(wdoc.documentElement, 'calcPr');
    if (!calc) {                                  // ask Excel to recalculate formulas when it opens the file
      calc = wdoc.createElementNS(wdoc.documentElement.namespaceURI, 'calcPr');
      var anchor = first(wdoc.documentElement, 'definedNames') || first(wdoc.documentElement, 'externalReferences') || first(wdoc.documentElement, 'sheets');
      wdoc.documentElement.insertBefore(calc, anchor ? anchor.nextSibling : null);
    }
    calc.setAttribute('fullCalcOnLoad', '1');
    wb.dirty['xl/workbook.xml'] = 1;
    var out = {};
    Object.keys(wb.files).forEach(function (p) { out[p] = wb.dirty[p] && wb.docs[p] ? ser(wb.docs[p]) : wb.files[p]; });
    return fflate.zipSync(out, { level: 6 });
  };

  XL.toB64 = function (u8) { var s = '', i; for (i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  XL.fromB64 = function (b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
})(window);
