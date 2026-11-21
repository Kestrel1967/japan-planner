// In-memory stand-in for Google Sheets (v2.8 tests): renaming tabs, inserting columns, sorting, triggers, URL fetch.
const fs = require('fs'), vm = require('vm');
function chain(obj) { return new Proxy(obj, { get(t, p) { if (p in t) return t[p]; return () => chain(t); } }); }
class Sheet {
  constructor(name) { this.name = name; this.cells = []; this.fmt = {}; this.maxRows = 1000; this.maxCols = 26; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() { for (let r = this.cells.length; r > 0; r--) if ((this.cells[r - 1] || []).some(x => x !== '' && x != null)) return r; return 0; }
  getLastColumn() { let m = 0; this.cells.forEach(row => (row || []).forEach((x, i) => { if (x !== '' && x != null) m = Math.max(m, i + 1); })); return m; }
  _get(r, c) { const v = (this.cells[r - 1] || [])[c - 1]; return v == null ? '' : v; }
  _set(r, c, v) { while (this.cells.length < r) this.cells.push([]); const row = this.cells[r - 1]; while (row.length < c) row.push('');
    if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
    else if (typeof v === 'string' && this.fmt[c] !== '@' && /^-?\d+(\.\d+)?$/.test(v)) v = parseFloat(v);
    row[c - 1] = v; }
  _insertCol(at) {   // new empty column at position `at` (1-based)
    this.cells.forEach(row => { while (row.length < at - 1) row.push(''); row.splice(at - 1, 0, ''); });
    const f = {}; Object.keys(this.fmt).forEach(k => { f[+k >= at ? +k + 1 : k] = this.fmt[k]; }); this.fmt = f; this.maxCols++;
  }
  deleteColumn(c) { this.cells.forEach(row => { if (row.length >= c) row.splice(c - 1, 1); }); const f = {}; Object.keys(this.fmt).forEach(k => { if (+k !== c) f[+k > c ? +k - 1 : k] = this.fmt[k]; }); this.fmt = f; }
  insertColumnAfter(c) { this._insertCol(c + 1); }
  insertColumnBefore(c) { this._insertCol(c); }
  insertColumnsAfter(c, n) { this.maxCols += n; }
  getRange(a, b, n, m) {
    const sh = this; let r, c;
    if (typeof a === 'string') { const mm = /^([A-Z])(\d+)/.exec(a); r = +mm[2]; c = mm[1].charCodeAt(0) - 64; n = 1; m = 1; } else { r = a; c = b; n = n || 1; m = m || 1; }
    return chain({
      getDisplayValues() { const o = []; for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < m; j++) row.push(String(sh._get(r + i, c + j))); o.push(row); } return o; },
      getDisplayValue() { return String(sh._get(r, c)); },
      setValues(vs) { if (vs.length !== n || vs[0].length !== m) throw new Error('size mismatch'); vs.forEach((row, i) => row.forEach((x, j) => sh._set(r + i, c + j, x))); return this; },
      setValue(x) { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) sh._set(r + i, c + j, x); return chain(this); },
      setNumberFormat(f) { for (let j = 0; j < m; j++) sh.fmt[c + j] = f; return chain(this); },
      sort(specs) {
        const rows = []; for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < m; j++) row.push(sh._get(r + i, c + j)); rows.push(row); }
        rows.sort((x, y) => { for (const s of specs) { const a = String(x[s.column - c]), b = String(y[s.column - c]);
          if (a === b) continue; if (a === '') return 1; if (b === '') return -1; return (a < b ? -1 : 1) * (s.ascending ? 1 : -1); } return 0; });
        rows.forEach((row, i) => row.forEach((x, j) => { sh.cells[r + i - 1] = sh.cells[r + i - 1] || []; sh.cells[r + i - 1][c + j - 1] = x; }));
        return chain(this);
      },
    });
  }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((x, j) => this._set(r, j + 1, x)); }
  deleteRow(r) { this.cells.splice(r - 1, 1); }
  setColumnWidth() {} hideColumns() {} showColumns() {} setFrozenRows() {} setTabColor() {}
  // test helper: rows as objects
  rows() { const h = (this.cells[0] || []).map(String); return this.cells.slice(1).filter(r => r.some(x => x !== '')).map(r => { const o = {}; h.forEach((k, i) => { if (k && r[i] !== '' && r[i] != null) o[k] = String(r[i]); }); return o; }); }
  heads() { return (this.cells[0] || []).map(String).filter(String); }
}
class SS { constructor() { this.sheets = [new Sheet('Sheet1')]; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  getSpreadsheetTimeZone() { return 'Asia/Jerusalem'; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); } }

const redirects = {};   // url -> Location, for UrlFetchApp
function load(ss, file) {
  const triggers = [];
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: () => chain({ build: () => ({}) }) },
    Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d) => d.toISOString().slice(0, 10) }, Logger: { log: x => console.log('[log]', x) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    ScriptApp: { getProjectTriggers: () => triggers.slice(), newTrigger: (fn) => chain({ create() { triggers.push({ getHandlerFunction: () => fn }); } }) },
    UrlFetchApp: { fetch(u) { ctx._fetched.push(u); const loc = redirects[u]; return { getHeaders: () => loc ? { Location: loc } : {} }; } }, _fetched: [],
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) } };
  ctx._triggers = triggers;
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return ctx;
}
function post(ctx, body) { return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text); }
module.exports = { SS, Sheet, load, post, redirects };
