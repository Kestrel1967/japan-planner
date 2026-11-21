/**
 * Japan Planner - BACKUP (lives inside the "Japan Trip data - backup" sheet).
 * Every 15 minutes it reads the real trip sheet and ADDS rows here for anything new, changed or removed.
 * It only ever writes below the last filled row of a tab (and new column titles to the right of the last title).
 * It never clears, overwrites or deletes anything - not here, and it never writes to the real sheet at all.
 *
 * One-time start: choose the function  startBackup  at the top and press Run.
 */

var SOURCE_ID = '1yQyxA2awd6rtlzYmN2ikGHTOSSc_FcNc_k_reA_vPSM';                 // the real sheet "Japan2027 Trip data"
var ID = '_id', WHEN = 'Backed up at', CHANGE = 'Change';

/** Run once: makes the 15-minute timer and takes the first copy. Safe to run again. */
function startBackup() {
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'backup'; })) {
    ScriptApp.newTrigger('backup').timeBased().everyMinutes(15).create();
  }
  backup();
  Logger.log('Backup is running. It adds rows every 15 minutes.');
}

/** Runs by itself every 15 minutes. */
function backup() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var src = SpreadsheetApp.openById(SOURCE_ID), here = SpreadsheetApp.getActiveSpreadsheet();
    var now = Utilities.formatDate(new Date(), here.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    src.getSheets().forEach(function (sh) {
      var name = sh.getName();
      if (name.charAt(0) === '_') return;                      // the passcode stays out of the backup
      var lr = sh.getLastRow(), lc = sh.getLastColumn();
      if (lr < 1 || lc < 1) return;
      var vals = sh.getRange(1, 1, lr, lc).getDisplayValues(), heads = vals[0];
      if (heads.indexOf(ID) < 0) return;                       // only the planner's tabs (Lists is rebuilt by setup)
      copyTab_(here, name, heads, vals.slice(1), now);
    });
  } finally { lock.releaseLock(); }
}

function copyTab_(here, name, heads, rows, now) {
  var bk = here.getSheetByName(name);
  if (!bk) { bk = here.insertSheet(name); protect_(bk); }

  // column titles: [Backed up at, Change, ...]; a column new in the real sheet gets a new title to the right
  var bh = bk.getLastColumn() ? bk.getRange(1, 1, 1, bk.getLastColumn()).getDisplayValues()[0] : [];
  while (bh.length && bh[bh.length - 1] === '') bh.pop();
  var add = [];
  if (!bh.length) add = [WHEN, CHANGE];
  heads.forEach(function (h) { if (h && bh.indexOf(h) < 0 && add.indexOf(h) < 0) add.push(h); });
  if (add.length) {
    var at = bh.length + 1;
    if (bk.getMaxColumns() < at + add.length - 1) bk.insertColumnsAfter(bk.getMaxColumns(), at + add.length - 1 - bk.getMaxColumns());
    var cells = bk.getRange(1, at, 1, add.length);
    if (cells.getDisplayValues()[0].some(String)) return;      // never write over a filled cell
    cells.setValues([add]).setFontWeight('bold');
    bh = bh.concat(add);
    bk.setFrozenRows(1);
  }
  var idc = bh.indexOf(ID), wc = bh.indexOf(WHEN), cc = bh.indexOf(CHANGE);

  // what the backup last saw for each row
  var last = {}, blr = bk.getLastRow();
  if (blr > 1) {
    bk.getRange(2, 1, blr - 1, bh.length).getDisplayValues().forEach(function (r) {
      if (r[idc]) last[r[idc]] = r;
    });
  }
  var out = [], seen = {};
  rows.forEach(function (r) {
    var id = r[heads.indexOf(ID)];
    if (!id || !r.some(function (x, i) { return x !== '' && heads[i] !== ID; })) return;
    seen[id] = 1;
    var line = bh.map(function () { return ''; });
    heads.forEach(function (h, i) { if (h) line[bh.indexOf(h)] = r[i]; });
    var prev = last[id], kind = !prev || prev[cc] === 'deleted' ? 'new' : null;
    if (!kind) {
      var same = bh.every(function (h, i) { return i === wc || i === cc || (line[i] || '') === (prev[i] || ''); });
      if (same) return;
      kind = 'changed';
    }
    line[wc] = now; line[cc] = kind;
    out.push(line);
  });
  Object.keys(last).forEach(function (id) {
    var prev = last[id];
    if (seen[id] || prev[cc] === 'deleted') return;
    var line = prev.slice(); line[wc] = now; line[cc] = 'deleted';   // the row's last values, marked as removed
    out.push(line);
  });
  if (!out.length) return;
  var start = bk.getLastRow() + 1;                             // the next empty row - nothing above it is touched
  if (bk.getMaxRows() < start + out.length) bk.insertRowsAfter(bk.getMaxRows(), start + out.length - bk.getMaxRows() + 100);
  var block = bk.getRange(start, 1, out.length, bh.length);
  if (block.getDisplayValues().some(function (r) { return r.some(String); })) return;   // never write over a filled cell
  block.setNumberFormat('@').setValues(out.map(function (r) { return r.map(safe_); }));
}

// a warning appears if anyone edits a backup tab by hand
function protect_(sh) {
  try { sh.protect().setDescription('Backup - add only').setWarningOnly(true); } catch (e) {}
}
function safe_(x) { x = x == null ? '' : String(x); return /^[=+\-@]/.test(x) ? "'" + x : x; }
