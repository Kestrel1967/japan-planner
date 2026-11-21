// Old sheet (v2.7 layout, plus the pre-2.7 link columns of the real sheet) -> new script v2.8 -> check everything moved and nothing was lost.
const { SS, load, post, redirects } = require('./mock3');
const assert = require('assert');
const ss = new SS();
const old = load(ss, __dirname + '/Code_v27.gs');
old.setup();
const key = ss.getSheetByName('_App').getRange('B1').getDisplayValue();

// the real sheet still has the older single link columns
function oldCol(tab, keep, drop, newName) {
  const sh = ss.getSheetByName(tab), h = sh.cells[0];
  const d = h.indexOf(drop); sh.deleteColumn(d + 1);
  sh.cells[0][sh.cells[0].indexOf(keep)] = newName;
}
oldCol('Hotels', 'Map link', 'Booking link', 'Map / booking link');
oldCol('Apps', 'iPhone download', 'Android download', 'Download link');
ss.getSheetByName('Apps').deleteColumn(ss.getSheetByName('Apps').cells[0].indexOf('Other link') + 1);

const P = (ops) => post(old, { key, action: 'push', ops });
P([
  { sheet: 'Day plan', rid: 'p1', isNew: true, v: { Date: '2027-04-08', Part: 'Morning', Name: 'Park', Time: '10:00' } },
  { sheet: 'Day plan', rid: 'p2', isNew: true, v: { Date: '2027-04-08', Part: 'Afternoon', Name: 'Park2', From: 'Places' } },
  { sheet: 'Day plan', rid: 'p3', isNew: true, v: { Date: '2027-04-08', Part: 'Hotel', Name: 'Hotel Gracery' } },
  { sheet: 'Day plan', rid: 'p4', isNew: true, v: { Date: '2027-04-09', Part: 'Start hotel', Name: 'Hotel Gracery' } },
  { sheet: 'Day plan', rid: 'p5', isNew: true, v: { Date: '2027-04-09', Part: 'Bookings', Name: 'Ghibli', Time: '14:00' } },
  { sheet: 'Day plan', rid: 'p6', isNew: true, v: { Date: '2027-04-09', Part: 'Bookings', Name: 'Sumo' } },
  { sheet: 'Itinerary', rid: 'd2', v: { 'Starts in': 'Tokyo', 'Ends in': 'Tokyo', Notes: 'first full day' } },
  { sheet: 'Bookings', rid: 'b1', isNew: true, v: { What: 'teamLab Planets', 'Visit date': '2027-04-10', Time: '09:30', 'Where to book (link)': 'https://teamlab.art/e/planets/', Status: 'To book' } },
  { sheet: 'Hotels', rid: 'h1', isNew: true, v: { 'Hotel name': 'Hotel Gracery', 'Map / booking link': 'https://maps.app.goo.gl/abc' } },
  { sheet: 'Hotels', rid: 'h2', isNew: true, v: { 'Hotel name': 'Kyoto Inn', 'Map / booking link': 'https://www.booking.com/hotel/jp/kyoto-inn.html' } },
  { sheet: 'Apps', rid: 'a1', isNew: true, v: { 'App name': 'Suica', 'Download link': 'https://apps.apple.com/app/suica/id1156875272' } },
  { sheet: 'Apps', rid: 'a2', isNew: true, v: { 'App name': 'GO Taxi', 'Download link': 'https://play.google.com/store/apps/details?id=com.dena.automotive.taxibell' } },
  { sheet: 'Apps', rid: 'a3', isNew: true, v: { 'App name': 'Japan Guide', 'Download link': 'https://www.instagram.com/japanguide' } },
]);
const before = JSON.stringify(ss.sheets.map(s => [s.name, s.rows().length]));
console.log('old tabs:', ss.sheets.map(s => s.name).join(', '));

// ----- new script
const ctx = load(ss, __dirname + '/Code.gs');
ctx.setup(); ctx.setup();   // safe to run twice
const names = ss.sheets.map(s => s.name);
console.log('new tabs:', names.join(', '));
['Days', 'Itinerary', 'Attractions'].forEach(n => assert(names.includes(n), n));
['Day plan', 'Bookings'].forEach(n => assert(!names.includes(n), n));
const days = ss.getSheetByName('Days'), it = ss.getSheetByName('Itinerary');
console.log('Days heads:', days.heads().join(' | '));
console.log('Itinerary heads:', it.heads().join(' | '));
assert.deepStrictEqual(days.heads(), ['Day', 'Date', 'Weekday', 'Day type', 'Starts in', 'Start hotel', 'Ends in', 'End hotel', 'Est. cost', 'Actual cost', 'Currency', 'Notes', '_id']);
assert.deepStrictEqual(it.heads().slice().sort(), ['Date', 'Time', 'Part', 'Name', 'Type', 'Map link', 'Website', 'Notes', 'Source', '_id'].sort());
const D = days.rows();
assert.strictEqual(D.length, 23);
assert.strictEqual(D[0]['End hotel'], 'Hotel Gracery');
assert.strictEqual(D[1]['Start hotel'], 'Hotel Gracery');
assert.strictEqual(D[1]['Starts in'], 'Tokyo'); assert.strictEqual(D[1].Notes, 'first full day');
const I = it.rows();
console.log('Itinerary rows:'); I.forEach(r => console.log('  ', JSON.stringify(r)));
assert(!I.some(r => /hotel/i.test(r.Part)), 'hotel rows moved');
const by = n => I.find(r => r.Name === n);
assert.strictEqual(by('Ghibli').Part, 'Afternoon'); assert.strictEqual(by('Sumo').Part, 'Evening');
assert.strictEqual(by('Park2').Type, 'Place'); assert.strictEqual(by('Park').Type, 'Own');
const tl = by('teamLab Planets');
assert(tl && tl.Source && tl.Part === 'Morning' && tl.Type === 'Attraction' && tl.Website === 'https://teamlab.art/e/planets/', 'attraction auto row');
assert.strictEqual(tl._id, 'auto-Attractions-b1');
// links split
const H = ss.getSheetByName('Hotels'), A = ss.getSheetByName('Apps');
assert(!H.heads().includes('Map / booking link') && !A.heads().includes('Download link'), 'old link columns gone');
const hr = H.rows(); assert.strictEqual(hr[0]['Map link'], 'https://maps.app.goo.gl/abc'); assert.strictEqual(hr[1]['Booking link'], 'https://www.booking.com/hotel/jp/kyoto-inn.html');
const ar = A.rows(); assert(ar[0]['iPhone download'] && ar[1]['Android download'] && ar[2]['Other link']);
assert(ar.every(r => r._id), 'ids kept');
console.log('Hotels heads:', H.heads().join(' | '));
// Lists
const L = post(ctx, { key, action: 'pull' }).data.lists['Day part'];
assert.deepStrictEqual(L, ['Morning', 'Afternoon', 'Evening', 'Food', 'Transport']);
assert.strictEqual(ctx._triggers.length, 1);

// ----- reconcile on push
let res = post(ctx, { key, action: 'push', ops: [
  { sheet: 'Food', rid: 'f1', isNew: true, v: { Name: 'Ichiran', 'Planned day': '2027-04-09', 'Planned time': '19:00', 'Map link': 'https://maps.app.goo.gl/ich' } },
  { sheet: 'Places', rid: 'pl1', isNew: true, v: { 'Place name': 'Senso-ji', 'Planned day': '2027-04-09', 'Planned time': '8:30' } },
  { sheet: 'Places', rid: 'pl2', isNew: true, v: { 'Place name': 'Unscheduled', 'Planned day': '2027-04-09' } },
  { sheet: 'Flights', rid: 'fl1', isNew: true, v: { 'Departure date': '2027-04-08', 'Departs (local)': '06:10', 'From (airport)': 'CDG', 'To (airport)': 'HND', 'Flight no.': 'AF274' } },
  { sheet: 'Hotels', rid: 'h1', v: { 'Check-in': '2027-04-08', 'Check-out': '2027-04-12' } },
  { sheet: 'Hotels', rid: 'h2', v: { 'Check-in': '2027-04-12', 'Check-out': '2027-04-15' } },
] });
let I2 = it.rows();
const n2 = n => I2.find(r => r.Name === n);
assert.strictEqual(n2('Ichiran').Part, 'Food'); assert.strictEqual(n2('Senso-ji').Part, 'Morning'); assert.strictEqual(n2('Senso-ji').Time, '08:30');
assert.strictEqual(n2('Unscheduled').Part, 'Evening');
assert.strictEqual(n2('CDG → HND · AF274').Part, 'Transport');
// sorted by date then time
const keys = I2.map(r => r.Date + ' ' + (r.Time || '~')); assert.deepStrictEqual(keys, keys.slice().sort(), 'sorted');
const D2 = days.rows();
assert.strictEqual(D2[3]['End hotel'], 'Hotel Gracery');  // Apr 11
assert.strictEqual(D2[4]['Start hotel'], 'Hotel Gracery'); assert.strictEqual(D2[4]['End hotel'], 'Kyoto Inn'); // Apr 12
assert.strictEqual(D2[7]['Start hotel'], 'Kyoto Inn'); assert(!D2[7]['End hotel']); // Apr 15
// own Part choice kept when no time; notes kept
const un = n2('Unscheduled'); post(ctx, { key, action: 'push', ops: [{ sheet: 'Itinerary', rid: un._id, v: { Part: 'Evening', Notes: 'if time' } }, { sheet: 'Places', rid: 'pl2', v: { 'Place name': 'Unscheduled!' } }] });
I2 = it.rows(); assert.strictEqual(n2('Unscheduled!').Part, 'Evening'); assert.strictEqual(n2('Unscheduled!').Notes, 'if time');
// app-created auto row with the same id is not duplicated
post(ctx, { key, action: 'push', ops: [
  { sheet: 'Shopping', rid: 's1', isNew: true, v: { Item: 'Knife', 'Shop / brand': 'Aritsugu', 'Planned day': '2027-04-13', 'Planned time': '15:00' } },
  { sheet: 'Itinerary', rid: 'auto-Shopping-s1', isNew: true, v: { Date: '2027-04-13', Time: '15:00', Part: 'Afternoon', Name: 'Knife (Aritsugu)', Type: 'Shopping', Source: 'Shopping:s1' } }] });
I2 = it.rows(); assert.strictEqual(I2.filter(r => r.Source === 'Shopping:s1').length, 1);
// removing the date removes the auto row; deleting a source removes it
post(ctx, { key, action: 'push', ops: [{ sheet: 'Places', rid: 'pl1', v: { 'Planned day': '', 'Planned time': '' } }, { sheet: 'Food', rid: 'f1', del: true }] });
I2 = it.rows(); assert(!n2('Senso-ji') && !n2('Ichiran'));
// hotel dates moved: stale names cleared, own (undated) choice kept
post(ctx, { key, action: 'push', ops: [{ sheet: 'Days', rid: 'd20', v: { 'End hotel': 'Friend house' } }, { sheet: 'Hotels', rid: 'h2', v: { 'Check-in': '2027-04-20', 'Check-out': '2027-04-22' } }] });
const D3 = days.rows(); assert(!D3[4]['End hotel']); assert.strictEqual(D3[12]['End hotel'], 'Kyoto Inn'); assert.strictEqual(D3[14]['Start hotel'], 'Kyoto Inn'); assert.strictEqual(D3[19]['End hotel'], 'Friend house');
// a row typed straight into a sheet is picked up by the timer
ss.getSheetByName('Attractions').appendRow(['Shibuya Sky', '', 'Tokyo', '2027-04-10', '17:30']);
ctx.timer(); I2 = it.rows(); assert.strictEqual(n2('Shibuya Sky').Part, 'Evening');
// own items never touched
assert(n2('Park') && n2('Sumo'));
// Days cannot be deleted or have its dates changed
post(ctx, { key, action: 'push', ops: [{ sheet: 'Days', rid: 'd1', del: true }, { sheet: 'Days', rid: 'd2', v: { Date: '2099-01-01' } }] });
assert.strictEqual(days.rows().length, 23); assert.strictEqual(days.rows()[1].Date, '2027-04-09');

// ----- Maps short-link names
redirects['https://maps.app.goo.gl/xyz'] = 'https://www.google.com/maps/place/Ichiran+Shibuya/@35.66,139.7,17z/data=!3m1';
redirects['https://maps.app.goo.gl/qqq'] = 'https://maps.google.com/?q=Tsukiji+Outer+Market,+4+Chome-16-2+Tsukiji,+Chuo+City&ftid=0x1';
redirects['https://maps.app.goo.gl/geo'] = 'https://maps.google.com/?q=35.6,139.7';
assert.strictEqual(post(ctx, { key, action: 'resolve', url: 'https://maps.app.goo.gl/xyz' }).name, 'Ichiran Shibuya');
assert.strictEqual(post(ctx, { key, action: 'resolve', url: 'https://maps.app.goo.gl/qqq' }).name, 'Tsukiji Outer Market');
assert.strictEqual(post(ctx, { key, action: 'resolve', url: 'https://maps.app.goo.gl/geo' }).name, '');
assert.strictEqual(post(ctx, { key, action: 'resolve', url: 'https://evil.example/x' }).name, '');
assert.strictEqual(post(ctx, { key: 'wrong', action: 'resolve', url: 'https://maps.app.goo.gl/xyz' }).error, 'key');
let s = post(ctx, { key, share: '(maps.app.goo.gl) https://maps.app.goo.gl/xyz?g_st=ic', who: 'Kuti' });
assert.strictEqual(s.saved, 'Ichiran Shibuya');
s = post(ctx, { key, share: 'Great ramen https://maps.app.goo.gl/xyz' }); assert.strictEqual(s.saved, 'Great ramen');
console.log('ideas:', ss.getSheetByName('Ideas').rows().map(r => r.Idea + ' ' + r.Link).join(' / '));
// transport: between cities -> Transport box; inside one city -> by its hour
post(ctx, { key, action: 'push', ops: [
  { sheet: 'Transport', rid: 't1', isNew: true, v: { Date: '2027-04-10', Departs: '08:15', From: 'Tokyo st', To: 'Kyoto st', 'Origin city': 'Tokyo', 'Destination city': 'Kyoto' } },
  { sheet: 'Transport', rid: 't2', isNew: true, v: { Date: '2027-04-10', Departs: '18:00', From: 'Shibuya', To: 'Asakusa', 'Origin city': 'Tokyo', 'Destination city': 'Tokyo' } },
  { sheet: 'Transport', rid: 't3', isNew: true, v: { Date: '2027-04-10', From: 'Hotel', To: 'Park', 'Origin city': 'Tokyo', 'Destination city': 'Tokyo' } }] });
I2 = it.rows(); const T = id => I2.find(r => r.Source === 'Transport:' + id);
assert.strictEqual(T('t1').Part, 'Transport'); assert.strictEqual(T('t2').Part, 'Evening'); assert.strictEqual(T('t3').Part, 'Evening');
assert(ss.getSheetByName('Expenses') && !ss.getSheetByName('Budget'), 'Budget -> Expenses');
const EH = ss.getSheetByName('Expenses').heads(); assert(EH.includes('Name') && EH.includes('Price') && EH.includes('Other category') && !EH.includes('Item / description'));
console.log('Expenses heads:', EH.join(' | '));
console.log('\nALL MIGRATION + ITINERARY TESTS PASSED');
