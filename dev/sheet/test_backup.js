const { SS, load, post } = require('./mock3'); const fs = require('fs'), vm = require('vm'), assert = require('assert');
const real = new SS(); const app = load(real, __dirname + '/Code.gs'); app.setup();
const key = real.getSheetByName('_App').getRange('B1').getDisplayValue();
const bk = new SS(); bk.sheets[0].protect = () => ({ setDescription() { return this; }, setWarningOnly() {} });
const S = require('./mock3').Sheet; S.prototype.protect = function () { return { setDescription() { return this; }, setWarningOnly() {} }; }; S.prototype.insertRowsAfter = function () {};
const trig = []; const ctx = { SpreadsheetApp: { openById: () => real, getActiveSpreadsheet: () => bk },
  Utilities: { formatDate: () => 'T' + (ctx.t || 0) }, Logger: { log() {} }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  ScriptApp: { getProjectTriggers: () => trig, newTrigger: f => { const b = { timeBased: () => b, everyMinutes: () => b, create: () => trig.push({ getHandlerFunction: () => f }) }; return b; } } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/Backup.gs', 'utf8').replace('__SOURCE_ID__', 'x'), ctx);
const P = ops => post(app, { key, action: 'push', ops });
P([{ sheet: 'Food', rid: 'f1', isNew: true, v: { Name: 'Ichiran', 'Planned day': '2027-04-09' } }, { sheet: 'Food', rid: 'f2', isNew: true, v: { Name: '=SUM(1)' } }]);
ctx.t = 1; ctx.startBackup(); ctx.startBackup();
assert.strictEqual(trig.length, 1);
const F = () => bk.getSheetByName('Food').rows();
assert.strictEqual(F().length, 2); assert(!bk.getSheetByName('_App'));
assert.strictEqual(bk.getSheetByName('Days').rows().length, 23);
ctx.t = 2; ctx.backup(); assert.strictEqual(F().length, 2, 'no change, no rows');
P([{ sheet: 'Food', rid: 'f1', v: { Notes: 'go early' } }, { sheet: 'Food', rid: 'f2', del: true }]);
ctx.t = 3; ctx.backup();
console.log(F().map(r => [r['Backed up at'], r.Change, r.Name, r.Notes || ''].join(' ')).join('\n'));
assert.deepStrictEqual(F().map(r => r.Change), ['new', 'new', 'changed', 'deleted']);
// a new column in the real sheet is added to the right; old rows untouched
const fd = real.getSheetByName('Food'); fd._insertCol(3); fd._set(1, 3, 'Spicy?'); fd._set(2, 3, 'yes');
ctx.t = 4; ctx.backup();
const h = bk.getSheetByName('Food').heads(); assert.strictEqual(h[h.length - 1], 'Spicy?'); assert.strictEqual(F().length, 5);
// re-added row after delete
P([{ sheet: 'Food', rid: 'f2', isNew: true, v: { Name: 'back' } }]); ctx.t = 5; ctx.backup(); assert.strictEqual(F()[5].Change, 'new');
// never shrinks: deleting a whole tab in the real sheet only appends 'deleted'
const before = bk.getSheetByName('Food').cells.length; real.deleteSheet(fd); ctx.t = 6; ctx.backup();
assert(bk.getSheetByName('Food').cells.length === before, 'tab gone from real: backup kept as is');
console.log('BACKUP TESTS PASSED');
