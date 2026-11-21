/**
 * Japan Planner - the data service that lives inside your Google Sheet.
 * The phone app sends changes here; this script writes them into the sheet and sends the sheet back.
 * It can only touch THIS spreadsheet.
 *
 * @OnlyCurrentDoc
 */

// What tabs and columns the planner has: [header, t = text / n = number, dropdown list, width]
var DEF = __DEF__;

var ID = '_id';            // hidden column that gives every row a permanent name
var APP_TAB = '_App';      // holds the passcode
var TRIP_START = [2027, 4, 8], TRIP_DAYS = 23;

/** Run this once (and again any time - it never deletes data). Builds the tabs and the passcode. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Lists (the dropdown options)
  var lists = ss.getSheetByName('Lists') || ss.insertSheet('Lists');
  var lh = headers_(lists);
  if (lists.getMaxColumns() < DEF.lists.length + 2) lists.insertColumnsAfter(lists.getMaxColumns(), DEF.lists.length + 2 - lists.getMaxColumns());
  DEF.lists.forEach(function (l) {
    if (lh.indexOf(l[0]) >= 0) return;
    var c = lh.length + 1; lh.push(l[0]);
    lists.getRange(1, c).setValue(l[0]);
    lists.getRange(2, c, lists.getMaxRows() - 1, 1).setNumberFormat('@');
    if (l[1].length) lists.getRange(2, c, l[1].length, 1).setValues(l[1].map(function (x) { return [x]; }));
    lists.setColumnWidth(c, 170);
  });
  styleHeader_(lists, lh.length, '#E0E0E0');

  // 2. One tab per section
  DEF.sheets.forEach(function (d) {
    var sh = ss.getSheetByName(d.name) || ss.insertSheet(d.name);
    var hs = headers_(sh);
    if (sh.getMaxColumns() < d.cols.length + 1) sh.insertColumnsAfter(sh.getMaxColumns(), d.cols.length + 1 - sh.getMaxColumns());
    d.cols.map(function (c) { return c[0]; }).concat([ID]).forEach(function (h) {
      if (hs.indexOf(h) >= 0) return;
      hs.push(h); sh.getRange(1, hs.length).setValue(h);
    });
    var rows = sh.getMaxRows() - 1;
    d.cols.forEach(function (c) {
      var col = hs.indexOf(c[0]) + 1, body = sh.getRange(2, col, rows, 1);
      body.setNumberFormat(c[1] === 'n' ? '0.##' : '@');
      body.setWrap(c[3] >= 250).setVerticalAlignment('top');
      sh.setColumnWidth(col, c[3]);
      if (c[2]) {
        var it = ss.getSheetByName('Itinerary'), dc = it ? headers_(it).indexOf('Date') + 1 : 0;
        var src = c[2] === 'Itinerary!Date' ? (dc ? it.getRange(2, dc, TRIP_DAYS, 1) : null) : lists.getRange(2, lh.indexOf(c[2]) + 1, 300, 1);
        if (src) body.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(src, true).setAllowInvalid(true).build());
      }
    });
    sh.getRange(2, hs.indexOf(ID) + 1, rows, 1).setNumberFormat('@');
    sh.hideColumns(hs.indexOf(ID) + 1);
    styleHeader_(sh, hs.length, d.color);
    sh.setTabColor(d.color);
    if (d.name === 'Itinerary' && sh.getLastRow() < 2) {
      var out = [], names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (var i = 0; i < TRIP_DAYS; i++) {
        var dt = new Date(Date.UTC(TRIP_START[0], TRIP_START[1] - 1, TRIP_START[2] + i)), row = hs.map(function () { return ''; });
        row[hs.indexOf('Day')] = i + 1;
        row[hs.indexOf('Date')] = dt.toISOString().slice(0, 10);
        row[hs.indexOf('Weekday')] = names[dt.getUTCDay()];
        row[hs.indexOf(ID)] = 'd' + (i + 1);
        out.push(row);
      }
      sh.getRange(2, 1, out.length, hs.length).setValues(out);
    }
  });

  // 3. The passcode tab
  var app = ss.getSheetByName(APP_TAB) || ss.insertSheet(APP_TAB);
  app.getRange('A1').setValue('Passcode');
  app.getRange('B1').setNumberFormat('@');
  if (!app.getRange('B1').getDisplayValue()) app.getRange('B1').setValue(newPasscode_());
  app.getRange('A3').setValue('Type this passcode once on each phone. To change it, type a new one in B1 (both phones will ask again).');
  app.getRange('A4').setValue('Anyone who has the app link AND this passcode can read and change the trip data. Do not post it anywhere.');
  app.setColumnWidth(1, 120); app.setColumnWidth(2, 220);
  app.getRange('A1:B1').setFontWeight('bold').setFontSize(14);

  // 4. Remove the empty starter tab, if any
  var keep = DEF.sheets.map(function (d) { return d.name; }).concat(['Lists', APP_TAB]);
  ss.getSheets().forEach(function (sh) { if (keep.indexOf(sh.getName()) < 0 && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh); });

  Logger.log('Setup finished. Passcode: ' + app.getRange('B1').getDisplayValue());
}

/** Opening the web address in a browser shows this line - a quick way to check the service is up. */
function doGet() {
  return ContentService.createTextOutput('Japan Planner data service is running.');
}

/** The phone app talks to this. */
function doPost(e) {
  try {
    var req;
    try { req = JSON.parse(e.postData.contents); } catch (x) { req = e.parameter || {}; }   // the iPhone Shortcut may send a plain form
    if (!keyOk_(req.key)) return json_({ error: 'key' });
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);                         // one phone at a time, so two saves never collide
    try {
      var res = {};
      if (req.share != null) return json_(share_(req));   // something sent from a phone's Share menu
      if (req.action === 'push') res.skipped = push_(req.ops || []);
      res.data = pull_();
      return json_(res);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ error: 'server', message: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------- reading
function pull_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = { sheets: {}, lists: {} };
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName(), lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (name.charAt(0) === '_' || lr < 1 || lc < 1) return;
    var vals = sh.getRange(1, 1, lr, lc).getDisplayValues(), heads = vals[0], r, c;
    if (name === 'Lists') {
      for (c = 0; c < lc; c++) {
        if (!heads[c]) continue;
        var arr = [];
        for (r = 1; r < lr; r++) if (vals[r][c] !== '') arr.push(vals[r][c]);
        out.lists[heads[c]] = arr;
      }
      return;
    }
    var idCol = heads.indexOf(ID);
    if (idCol < 0) return;                         // not one of the planner's tabs
    var rows = [];
    for (r = 1; r < lr; r++) {
      var v = {}, any = false;
      for (c = 0; c < lc; c++) if (c !== idCol && heads[c] && vals[r][c] !== '') { v[heads[c]] = vals[r][c]; any = true; }
      if (!any) continue;
      var id = vals[r][idCol];
      if (!id) { id = 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); sh.getRange(r + 1, idCol + 1).setValue(id); }   // a row somebody typed straight into the sheet
      rows.push({ id: id, v: v });
    }
    out.sheets[name] = rows;
  });
  return out;
}

// ---------------------------------------------------------------- writing
// ops: [{sheet, rid, isNew, v: {header: text}, del}]   Returns how many edits were skipped (their row no longer exists).
function push_(ops) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), skipped = 0;
  ops.forEach(function (op) {
    var sh = ss.getSheetByName(op.sheet);
    if (!sh || !op.rid) { skipped++; return; }
    var heads = headers_(sh), idCol = heads.indexOf(ID), lr = sh.getLastRow();
    if (idCol < 0) { skipped++; return; }
    var ids = lr > 1 ? sh.getRange(2, idCol + 1, lr - 1, 1).getDisplayValues().map(function (x) { return x[0]; }) : [];
    var at = ids.indexOf(String(op.rid)), v = op.v || {};
    if (at < 0) {
      if (op.del) return;
      if (!op.isNew) { skipped++; return; }
      sh.appendRow(heads.map(function (h) { return h === ID ? String(op.rid) : clean_(v[h]); }));
      return;
    }
    var row = at + 2;
    if (op.del) { if (op.sheet !== 'Itinerary') sh.deleteRow(row); return; }
    Object.keys(v).forEach(function (h) {
      var c = heads.indexOf(h);
      if (c < 0 || h === ID) return;
      if (op.sheet === 'Itinerary' && (h === 'Day' || h === 'Date' || h === 'Weekday')) return;
      sh.getRange(row, c + 1).setValue(clean_(v[h]));
    });
  });
  return skipped;
}

// ---------------------------------------------------------------- the Ideas inbox
// Whatever was shared (a name, a link, or both) becomes one new row in the Ideas tab.
function share_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Ideas')) return { error: 'server', message: 'The Ideas tab is missing. Run setup again.' };
  var all = String(req.share || ''), m = /https?:\/\/\S+/.exec(all), link = m ? m[0] : '';
  link = link.replace(/([?&])g_st=[^&#]*(&?)/, function (m, sep, amp) { return amp ? sep : ''; }).replace(/[?&]$/, '');
  var idea = cleanName_(all.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300));
  if (!idea && !link) return { error: 'server', message: 'Nothing was shared.' };   // no name: left empty, the app asks for one
  push_([{ sheet: 'Ideas', rid: 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), isNew: true,
    v: { 'Idea': idea, 'Link': link, 'Added': Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'), 'Added by': String(req.who || '') } }]);
  return { ok: true, saved: idea };
}

// words that apps put around a shared name ("בדוק את ...", "Check out ...", "... on Google Play")
function cleanName_(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (/^\([^()]*\)$/.test(s)) return '';
  s = s.replace(/^(check (this )?out|look at|בדוק את|בדקי את|בדקו את|תבדוק את|תבדקי את|כדאי לבדוק את)\s*[:\-–]?\s*/i, '');
  s = s.replace(/\s*(on|in|at) (the )?(Google Play|App Store)( Store)?\s*[!.]?$/i, '').replace(/\s*ב-?\s?(Google Play|App Store)\s*[!.]?$/, '');
  return s.replace(/^["'“”„׳״]+|["'“”„׳״]+$/g, '').trim();
}

// ---------------------------------------------------------------- small helpers
function headers_(sh) {
  var lc = sh.getLastColumn();
  return lc < 1 ? [] : sh.getRange(1, 1, 1, lc).getDisplayValues()[0];
}
function clean_(x) {
  x = x == null ? '' : String(x);
  return x.charAt(0) === '=' ? "'" + x : x;        // text from the phone is never run as a formula
}
function styleHeader_(sh, n, color) {
  if (n < 1) return;
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground(color).setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
}
function norm_(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function keyOk_(k) {
  var app = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP_TAB);
  var real = app ? norm_(app.getRange('B1').getDisplayValue()) : '';
  return real.length >= 6 && norm_(k) === real;
}
function newPasscode_() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), s = '';
  for (var i = 0; i < 12; i++) { s += abc.charAt(parseInt(hex.substr(i * 2, 2), 16) % 32); if (i === 3 || i === 7) s += '-'; }
  return s;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
