const { SS, load, post } = require('./mock3'); const assert = require('assert');
function run(twoStep) {
  const ss = new SS(); const old = load(ss, __dirname + '/Code_v27.gs'); old.setup();
  const key = ss.getSheetByName('_App').getRange('B1').getDisplayValue();
  post(old, { key, action: 'push', ops: [
    { sheet: 'Places', rid: 'pl1', isNew: true, v: { 'Place name': 'Togoshi Park', 'Planned day': '2027-04-08' } },
    { sheet: 'Day plan', rid: 'p1', isNew: true, v: { Date: '2027-04-08', Part: 'Morning', Time: '15:30', Name: 'Togoshi Park', From: 'Places' } },
    { sheet: 'Day plan', rid: 'p2', isNew: true, v: { Date: '2027-04-08', Part: 'Morning', Name: 'Shinjuku' } },
    { sheet: 'Day plan', rid: 'p3', isNew: true, v: { Date: '2027-04-08', Part: 'Morning', Time: '09:30', Name: 'Early walk' } }] });
  let ctx = load(ss, __dirname + '/Code.gs');
  if (twoStep) {   // the TEST sheet: migrated by the first fix-less script, so both rows exist; then the fix runs
    const it0 = ss.getSheetByName('Day plan'); // simulate: an auto row already appended
  }
  ctx.setup(); ctx.timer();
  const I = ss.getSheetByName('Itinerary').rows();
  console.log(I.map(r => [r.Date, r.Time || '', r.Part, r.Name, r.Source || ''].join(' | ')).join('\n'));
  const tg = I.filter(r => r.Name === 'Togoshi Park'); assert.strictEqual(tg.length, 1); assert.strictEqual(tg[0].Time, '15:30'); assert.strictEqual(tg[0].Part, 'Afternoon'); assert(tg[0].Source);
  assert.strictEqual(ss.getSheetByName('Places').rows()[0]['Planned time'], '15:30');
  assert.deepStrictEqual(I.map(r => r.Name), ['Early walk', 'Togoshi Park', 'Shinjuku'], 'sorted, untimed last');
  // already-duplicated state (like the TEST sheet now): add a second, Source-less copy and run again
  ss.getSheetByName('Itinerary').appendRow(['2027-04-08', 'Morning', '', 'Togoshi Park', '', '', '', '', 'Place', 'xdup']);
}
run(false);
// TEST-sheet state: old row without Source + auto row without time
const ss = new SS(); const c = load(ss, __dirname + '/Code.gs'); c.setup();
const key = ss.getSheetByName('_App').getRange('B1').getDisplayValue();
post(c, { key, action: 'push', ops: [{ sheet: 'Places', rid: 'pl1', isNew: true, v: { 'Place name': 'Togoshi Park', 'Planned day': '2027-04-08' } }] });
const it = ss.getSheetByName('Itinerary'), H = it.heads();
const row = H.map(h => ({ Date: '2027-04-08', Part: 'Morning', Time: '15:30', Name: 'Togoshi Park', Type: 'Place', _id: 'old1' })[h] || '');
it.appendRow(row);
c.timer();
const I = it.rows(); console.log(I.map(r => [r.Time || '', r.Part, r.Name, r._id].join(' | ')).join('\n'));
assert.strictEqual(I.length, 1); assert.strictEqual(I[0]._id, 'old1'); assert.strictEqual(I[0].Time, '15:30');
console.log('ADOPT TESTS PASSED');
