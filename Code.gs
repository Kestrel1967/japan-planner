/**
 * Japan Planner - the data service that lives inside your Google Sheet.
 * The phone app sends changes here; this script writes them into the sheet and sends the sheet back.
 * It also keeps the Itinerary tab filled from the other tabs, and the hotels of each day from the Hotels tab.
 * It can only touch THIS spreadsheet (and, to read a place name, open a shared Google Maps link).
 *
 * @OnlyCurrentDoc
 */

// What tabs and columns the planner has: [header, t = text / n = number, dropdown list, width]
var DEF = {"sheets": [{"name": "Days", "color": "#F4CCCC", "cols": [["Day", "n", "", 70], ["Date", "t", "", 110], ["Weekday", "t", "", 90], ["Day type", "t", "Day type", 140], ["Starts in", "t", "Cities (type yours)", 130], ["Start hotel", "t", "", 170], ["Ends in", "t", "Cities (type yours)", 130], ["End hotel", "t", "", 170], ["Est. cost", "n", "", 100], ["Actual cost", "n", "", 100], ["Currency", "t", "Currency", 140], ["Notes", "t", "", 280]]}, {"name": "Itinerary", "color": "#F4CCCC", "cols": [["Date", "t", "Days!Date", 110], ["Time", "t", "", 70], ["Part", "t", "Day part", 110], ["Name", "t", "", 240], ["Type", "t", "", 100], ["Map link", "t", "", 220], ["Website", "t", "", 220], ["Notes", "t", "", 280], ["Source", "t", "", 150]]}, {"name": "Places", "color": "#C9E7EC", "cols": [["Place name", "t", "", 150], ["Category", "t", "Place category", 140], ["City", "t", "Cities (type yours)", 140], ["District / ward", "t", "", 150], ["Neighbourhood", "t", "", 150], ["Nearest station", "t", "", 150], ["Priority", "t", "Priority", 140], ["Planned day", "t", "Days!Date", 140], ["Planned time", "t", "", 90], ["Time needed", "t", "", 150], ["Best time to go", "t", "", 150], ["Opening hours", "t", "", 150], ["Closed on", "t", "", 150], ["Entry fee", "n", "", 100], ["Currency", "t", "Currency", 140], ["Booking needed?", "t", "Yes / No", 140], ["Recommended by / source", "t", "", 150], ["Map link", "t", "", 180], ["Visited?", "t", "Yes / No", 140], ["Our rating", "t", "Rating", 140], ["Notes", "t", "", 280]]}, {"name": "Food", "color": "#FCE0C5", "cols": [["Name", "t", "", 150], ["Type", "t", "Food type", 140], ["Cuisine / must-try dish", "t", "", 150], ["City", "t", "Cities (type yours)", 140], ["District / ward", "t", "", 150], ["Neighbourhood", "t", "", 150], ["Nearest station", "t", "", 150], ["Price range", "t", "Price range", 140], ["Priority", "t", "Priority", 140], ["Planned day", "t", "Days!Date", 140], ["Planned time", "t", "", 90], ["Reservation needed?", "t", "Yes / No", 140], ["Reserved?", "t", "Yes / No", 140], ["Opening hours", "t", "", 150], ["Closed on", "t", "", 150], ["Cash only?", "t", "Yes / No", 140], ["Dietary notes", "t", "", 150], ["Recommended by / source", "t", "", 150], ["Map link", "t", "", 180], ["Visited?", "t", "Yes / No", 140], ["Our rating", "t", "Rating", 140], ["Notes", "t", "", 280]]}, {"name": "Budget", "color": "#D5E8C8", "cols": [["Date", "t", "", 110], ["Category", "t", "Budget category", 140], ["Item / description", "t", "", 150], ["Planned amount", "n", "", 100], ["Actual amount", "n", "", 100], ["Currency", "t", "Currency", 140], ["Paid by", "t", "Travellers", 140], ["Payment method", "t", "Payment method", 140], ["Paid?", "t", "Yes / No", 140], ["Notes", "t", "", 280]]}, {"name": "Ideas", "color": "#FFF2CC", "cols": [["Idea", "t", "", 280], ["Link", "t", "", 260], ["Added", "t", "", 110], ["Added by", "t", "Travellers", 120], ["Notes", "t", "", 280]]}, {"name": "Flights", "color": "#BDD7EE", "cols": [["Leg #", "n", "", 70], ["Leg type", "t", "Flight leg type", 140], ["Departure date", "t", "", 110], ["Airline", "t", "", 150], ["Flight no.", "t", "", 150], ["From (airport)", "t", "", 150], ["To (airport)", "t", "", 150], ["Departs (local)", "t", "", 80], ["Arrival date", "t", "", 110], ["Arrives (local)", "t", "", 80], ["Duration", "t", "", 150], ["Terminal", "t", "", 150], ["Booking ref (PNR)", "t", "", 150], ["Booked via", "t", "", 150], ["Seats", "t", "", 150], ["Baggage allowance", "t", "", 150], ["Price (total)", "n", "", 100], ["Currency", "t", "Currency", 140], ["Online check-in opens", "t", "", 110], ["Status", "t", "Booking status", 140], ["Notes", "t", "", 280]]}, {"name": "Hotels", "color": "#D5E8C8", "cols": [["Stay #", "n", "", 70], ["City", "t", "Cities (type yours)", 140], ["Hotel name", "t", "", 150], ["Check-in", "t", "", 110], ["Check-out", "t", "", 110], ["District / ward", "t", "", 150], ["Neighbourhood", "t", "", 150], ["Address (English)", "t", "", 260], ["Address (Japanese)", "t", "", 260], ["Nearest station", "t", "", 150], ["Check-in from", "t", "", 80], ["Check-out by", "t", "", 80], ["Booked via", "t", "", 150], ["Confirmation #", "t", "", 150], ["Price (total)", "n", "", 100], ["Currency", "t", "Currency", 140], ["Paid?", "t", "Yes / No", 140], ["Free cancellation until", "t", "", 110], ["Breakfast incl.?", "t", "Yes / No", 140], ["Room type", "t", "", 150], ["Phone", "t", "", 150], ["Map link", "t", "", 200], ["Booking link", "t", "", 200], ["Status", "t", "Booking status", 140], ["Notes", "t", "", 280]]}, {"name": "Transport", "color": "#D9D2E9", "cols": [["#", "n", "", 70], ["Date", "t", "", 110], ["Type", "t", "Transport type", 140], ["From", "t", "", 150], ["To", "t", "", 150], ["Departs", "t", "", 80], ["Arrives", "t", "", 80], ["Duration", "t", "", 150], ["Operator / line", "t", "", 150], ["Train name / no.", "t", "", 150], ["Seat reservation needed?", "t", "Yes / No", 140], ["Reserved?", "t", "Yes / No", 140], ["Covered by pass?", "t", "Yes / No", 140], ["Cost", "n", "", 100], ["Currency", "t", "Currency", 140], ["Booking ref", "t", "", 150], ["Luggage note", "t", "", 150], ["Status", "t", "Booking status", 140], ["Notes", "t", "", 280]]}, {"name": "Attractions", "color": "#BDD7EE", "cols": [["What", "t", "", 150], ["Type", "t", "Booking type", 140], ["City", "t", "Cities (type yours)", 140], ["Visit date", "t", "", 110], ["Time", "t", "", 80], ["Booking opens", "t", "", 110], ["Book by (deadline)", "t", "", 110], ["Where to book (link)", "t", "", 180], ["Price (total)", "n", "", 100], ["Currency", "t", "Currency", 140], ["Booked by", "t", "Travellers", 140], ["Confirmation #", "t", "", 150], ["Tickets saved where", "t", "", 150], ["Status", "t", "Booking status", 140], ["Notes", "t", "", 280]]}, {"name": "Packing", "color": "#D9D2E9", "cols": [["Item", "t", "", 150], ["Category", "t", "Packing category", 140], ["Person", "t", "Travellers", 140], ["Bag", "t", "Bag", 140], ["Qty", "n", "", 70], ["Weight each (kg)", "n", "", 100], ["Need to buy?", "t", "Yes / No", 140], ["Packed?", "t", "Yes / No", 140], ["Notes", "t", "", 280]]}, {"name": "To-Do & Docs", "color": "#C9E7EC", "cols": [["Task / document", "t", "", 150], ["Category", "t", "To-do category", 140], ["Owner", "t", "Travellers", 140], ["Due date", "t", "", 110], ["Priority", "t", "Priority", 140], ["Status", "t", "Task status", 140], ["Link", "t", "", 180], ["Where it is saved", "t", "", 150], ["Notes", "t", "", 280]]}, {"name": "Apps", "color": "#FCE0C5", "cols": [["App name", "t", "", 150], ["Category", "t", "App category", 140], ["What we use it for", "t", "", 260], ["Platform", "t", "Platform", 140], ["Cost", "t", "App cost", 140], ["Works offline?", "t", "Yes / No", 140], ["Needs account / setup before trip?", "t", "Yes / No", 140], ["Priority", "t", "Priority", 140], ["Installed – traveller 1", "t", "Yes / No", 140], ["Installed – traveller 2", "t", "Yes / No", 140], ["iPhone download", "t", "", 200], ["Android download", "t", "", 200], ["Other link", "t", "", 200], ["Notes", "t", "", 280]]}, {"name": "Shopping", "color": "#F4CCCC", "cols": [["Item", "t", "", 150], ["Category", "t", "Shopping category", 140], ["For whom", "t", "", 150], ["Shop / brand", "t", "", 150], ["City", "t", "Cities (type yours)", 140], ["District / ward", "t", "", 150], ["Neighbourhood", "t", "", 150], ["Est. price", "n", "", 100], ["Currency", "t", "Currency", 140], ["Tax-free eligible?", "t", "Yes / No", 140], ["Priority", "t", "Priority", 140], ["Planned day", "t", "Days!Date", 110], ["Planned time", "t", "", 90], ["Bought?", "t", "Yes / No", 140], ["Actual price", "n", "", 100], ["Notes", "t", "", 280]]}, {"name": "Important Info", "color": "#BDD7EE", "cols": [["Topic", "t", "Info topic", 140], ["Title", "t", "", 150], ["Details", "t", "", 280], ["Source / link", "t", "", 180], ["Checked on", "t", "", 110], ["Important?", "t", "Yes / No", 140], ["Notes", "t", "", 280]]}, {"name": "Phrases", "color": "#D5E8C8", "cols": [["Category", "t", "Phrase category", 140], ["English", "t", "", 150], ["Japanese (to show)", "t", "", 150], ["Pronunciation (romaji)", "t", "", 150], ["Notes", "t", "", 280]]}, {"name": "Emergency", "color": "#F4CCCC", "cols": [["Type", "t", "Contact type", 140], ["Name", "t", "", 150], ["Phone", "t", "", 150], ["Address", "t", "", 260], ["Email / website", "t", "", 180], ["When to use", "t", "", 150], ["Policy / reference no.", "t", "", 150], ["Notes", "t", "", 280]]}], "lists": [["Travellers", ["Kuti", "Partner", "Both"]], ["Cities (type yours)", []], ["Yes / No", ["Yes", "No"]], ["Booking status", ["To book", "Pending", "Booked", "Paid", "Cancelled"]], ["Task status", ["Not started", "In progress", "Done"]], ["Priority", ["Must", "Want", "If time"]], ["Flight leg type", ["Outbound", "Connection", "Return", "Domestic"]], ["Day type", ["Arrival", "Sightseeing", "Day trip", "Travel day", "Rest / flex", "Departure"]], ["Transport type", ["Shinkansen", "Train", "Subway / metro", "Bus", "Airport transfer", "Taxi", "Ferry", "Domestic flight", "Car rental", "Pass / IC card", "Luggage forwarding", "Other"]], ["Place category", ["Temple / shrine", "Castle / historic", "Museum / art", "Garden / park", "Nature / hike", "Viewpoint", "Neighbourhood / street", "Market", "Shopping", "Onsen", "Theme park / fun", "Experience / workshop", "Nightlife", "Day trip", "Other"]], ["Food type", ["Restaurant", "Izakaya", "Ramen / noodles", "Sushi", "Street food", "Café", "Bakery / dessert", "Bar", "Market / food hall", "Konbini / quick", "Other"]], ["Price range", ["¥", "¥¥", "¥¥¥", "¥¥¥¥"]], ["Booking type", ["Attraction", "Restaurant", "Experience / tour", "Show / event", "Transport", "Other"]], ["Budget category", ["Flights", "Accommodation", "Transport in Japan", "Food & drink", "Attractions & activities", "Shopping", "Insurance", "Connectivity (eSIM / Wi-Fi)", "Other"]], ["Currency", ["JPY", "ILS", "EUR", "USD"]], ["Payment method", ["Credit card", "Cash", "IC card", "Mobile pay", "Other"]], ["Packing category", ["Clothes", "Shoes", "Toiletries", "Medicine & health", "Electronics", "Documents & money", "Comfort / flight", "Other"]], ["Bag", ["Checked (23 kg)", "Carry-on", "Personal item", "Wear on flight"]], ["To-do category", ["Documents", "Insurance", "Money", "Connectivity", "Health", "Bookings", "Home prep", "Other"]], ["App category", ["Navigation & maps", "Trains & transit", "Translation", "Payments", "Food & reservations", "Accommodation", "Flights", "Connectivity", "Weather & safety", "Tickets & attractions", "Taxi & rides", "Shopping", "Other"]], ["Platform", ["Android", "iPhone", "Both"]], ["App cost", ["Free", "Paid", "Free + in-app"]], ["Shopping category", ["Souvenirs", "Gifts", "Food & snacks", "Clothes", "Electronics", "Cosmetics", "Kitchen / knives", "Stationery", "Anime / games", "Other"]], ["Info topic", ["Entry & documents", "Money & payments", "Connectivity", "Etiquette & customs", "Safety & health", "Weather", "Holidays & closures", "Luggage", "Getting around", "Other"]], ["Phrase category", ["Basics", "Restaurant", "Transport", "Shopping", "Hotel", "Emergency", "Other"]], ["Contact type", ["Emergency service", "Embassy / consulate", "Insurance", "Hotel", "Airline", "Bank / card", "Family / home", "Doctor / pharmacy", "Other"]], ["Rating", ["★", "★★", "★★★", "★★★★", "★★★★★"]], ["Day part", ["Morning", "Afternoon", "Evening", "Food", "Transport", "Any time"]]]};

var ID = '_id';            // hidden column that gives every row a permanent name
var APP_TAB = '_App';      // holds the passcode
var TRIP_START = [2027, 4, 8], TRIP_DAYS = 23;
var REPLACE_LISTS = ['Day part'];

// Tabs whose dated rows appear in the Itinerary by themselves.
//   date / time: the columns that place a row on a day; part: fixed part of the day (otherwise by hour)
var SOURCES = [
  { sheet: 'Flights', type: 'Flight', part: 'Transport', date: 'Departure date', time: 'Departs (local)',
    name: function (v) { return join_([v['From (airport)'], v['To (airport)']], ' → ') + (v['Flight no.'] ? ' · ' + v['Flight no.'] : ''); } },
  { sheet: 'Transport', type: 'Transport', part: 'Transport', date: 'Date', time: 'Departs',
    name: function (v) { return join_([v.From, v.To], ' → ') + (v.Type ? ' · ' + v.Type : ''); } },
  { sheet: 'Attractions', type: 'Attraction', date: 'Visit date', time: 'Time', name: function (v) { return v.What || ''; }, link: 'Where to book (link)' },
  { sheet: 'Food', type: 'Food', part: 'Food', date: 'Planned day', time: 'Planned time', name: function (v) { return v.Name || ''; }, link: 'Map link' },
  { sheet: 'Places', type: 'Place', date: 'Planned day', time: 'Planned time', name: function (v) { return v['Place name'] || ''; }, link: 'Map link' },
  { sheet: 'Shopping', type: 'Shopping', date: 'Planned day', time: 'Planned time',
    name: function (v) { return (v.Item || '') + (v['Shop / brand'] ? ' (' + v['Shop / brand'] + ')' : ''); } }
];
var WATCH = SOURCES.map(function (s) { return s.sheet; }).concat(['Hotels', 'Days']);

/** Run this once (and again any time - it never deletes your data). Builds or updates the tabs and the passcode. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  migrate_(ss);

  // 1. Lists (the dropdown options)
  var lists = ss.getSheetByName('Lists') || ss.insertSheet('Lists');
  var lh = headers_(lists);
  if (lists.getMaxColumns() < DEF.lists.length + 2) lists.insertColumnsAfter(lists.getMaxColumns(), DEF.lists.length + 2 - lists.getMaxColumns());
  DEF.lists.forEach(function (l) {
    var c = lh.indexOf(l[0]) + 1;
    if (!c) {
      c = lh.length + 1; lh.push(l[0]);
      lists.getRange(1, c).setValue(l[0]);
      lists.getRange(2, c, lists.getMaxRows() - 1, 1).setNumberFormat('@');
      lists.setColumnWidth(c, 170);
    }
    var have = lists.getRange(2, c, 300, 1).getDisplayValues().map(function (x) { return x[0]; }).filter(String);
    if (REPLACE_LISTS.indexOf(l[0]) >= 0 && have.join('|') !== l[1].join('|')) {   // the app's own list: set exactly
      lists.getRange(2, c, 300, 1).setValue('');
      lists.getRange(2, c, l[1].length, 1).setValues(l[1].map(function (x) { return [x]; }));
      return;
    }
    var add = l[1].filter(function (x) { return have.indexOf(x) < 0; });          // new options are added below, nothing is removed
    if (add.length) lists.getRange(have.length + 2, c, add.length, 1).setValues(add.map(function (x) { return [x]; }));
  });
  styleHeader_(lists, lh.length, '#E0E0E0');

  // 2. One tab per section; a missing column is inserted where it belongs
  DEF.sheets.forEach(function (d) {
    var sh = ss.getSheetByName(d.name) || ss.insertSheet(d.name);
    var want = d.cols.map(function (c) { return c[0]; }).concat([ID]);
    if (sh.getMaxColumns() < want.length + 1) sh.insertColumnsAfter(sh.getMaxColumns(), want.length + 1 - sh.getMaxColumns());
    want.forEach(function (h, i) {
      var hs = headers_(sh);
      if (hs.indexOf(h) >= 0) return;
      var after = 0;
      for (var j = i - 1; j >= 0; j--) { var p = hs.indexOf(want[j]); if (p >= 0) { after = p + 1; break; } }
      if (hs.length && after < hs.length) { if (after) sh.insertColumnAfter(after); else sh.insertColumnBefore(1); }
      sh.getRange(1, after + 1).setValue(h);
    });
    var hs = headers_(sh), rows = sh.getMaxRows() - 1;
    d.cols.forEach(function (c) {
      var col = hs.indexOf(c[0]) + 1, body = sh.getRange(2, col, rows, 1);
      body.setNumberFormat(c[1] === 'n' ? '0.##' : '@');
      body.setWrap(c[3] >= 250).setVerticalAlignment('top');
      sh.setColumnWidth(col, c[3]);
      if (c[2]) {
        var dd = ss.getSheetByName('Days'), dc = dd ? headers_(dd).indexOf('Date') + 1 : 0;
        var src = c[2] === 'Days!Date' ? (dc ? dd.getRange(2, dc, TRIP_DAYS, 1) : null) : lists.getRange(2, lh.indexOf(c[2]) + 1, 300, 1);
        if (src) body.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(src, true).setAllowInvalid(true).build());
      }
    });
    sh.getRange(2, hs.indexOf(ID) + 1, rows, 1).setNumberFormat('@');
    sh.hideColumns(hs.indexOf(ID) + 1);
    styleHeader_(sh, hs.length, d.color);
    sh.setTabColor(d.color);
    if (d.name === 'Days' && sh.getLastRow() < 2) {
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
  moveOldHotels_(ss);
  splitOldLinks_(ss);

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

  // 5. Keep the Itinerary up to date every 15 minutes (catches edits made straight in the sheet)
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'timer'; })) {
    ScriptApp.newTrigger('timer').timeBased().everyMinutes(15).create();
  }
  reconcile_();
  Logger.log('Setup finished. Passcode: ' + app.getRange('B1').getDisplayValue());
}

// The layout before version 2.8: "Itinerary" was one row per day, "Day plan" one row per item, "Bookings" the attractions.
function migrate_(ss) {
  var it = ss.getSheetByName('Itinerary');
  if (!ss.getSheetByName('Days') && it && headers_(it).indexOf('Weekday') >= 0) it.setName('Days');
  var dp = ss.getSheetByName('Day plan');
  if (dp && !ss.getSheetByName('Itinerary')) {
    dp.setName('Itinerary');
    var h = headers_(dp), f = h.indexOf('From');
    if (f >= 0 && h.indexOf('Type') < 0) dp.getRange(1, f + 1).setValue('Type');
  }
  var bk = ss.getSheetByName('Bookings');
  if (bk && !ss.getSheetByName('Attractions')) bk.setName('Attractions');
}
// Before 2.8 the day's hotels were items ("Hotel", "Start hotel"); now they are columns of Days.
function moveOldHotels_(ss) {
  var it = table_(ss.getSheetByName('Itinerary')), days = table_(ss.getSheetByName('Days'));
  if (!it || !days) return;
  var dCol = { start: days.heads.indexOf('Start hotel'), end: days.heads.indexOf('End hotel') }, gone = [];
  var TYPE = { Places: 'Place', Food: 'Food', Attractions: 'Attraction', Bookings: 'Attraction', Shopping: 'Shopping', Transport: 'Transport', Flights: 'Flight', Ideas: 'Own', '': 'Own' };
  it.rows.forEach(function (r) {
    var part = r.v.Part || '', col = part === 'Hotel' ? dCol.end : part === 'Start hotel' ? dCol.start : -1;
    if (col >= 0) {
      var day = days.rows.filter(function (x) { return x.v.Date === r.v.Date; })[0];
      if (day && !day.v[days.heads[col]] && r.v.Name) days.sh.getRange(day.r, col + 1).setValue(clean_(r.v.Name));
      gone.push(r.r); return;
    }
    if (part === 'Bookings') it.sh.getRange(r.r, it.heads.indexOf('Part') + 1).setValue(r.v.Time ? partOf_(r.v.Time) : 'Any time');
    var tc = it.heads.indexOf('Type');
    if (tc >= 0 && !r.v.Source && (r.v.Type || '') in TYPE) it.sh.getRange(r.r, tc + 1).setValue(TYPE[r.v.Type || '']);
  });
  gone.sort(function (a, b) { return b - a; }).forEach(function (n) { it.sh.deleteRow(n); });
}

// Before 2.7 a hotel had one "Map / booking link" and an app one "Download link"; each link now goes to its own column.
function splitOldLinks_(ss) {
  [['Hotels', 'Map / booking link', function (u) { return isMap_(u) ? 'Map link' : 'Booking link'; }],
   ['Apps', 'Download link', function (u) { return /apps\.apple\.com|itunes\.apple\.com/i.test(u) ? 'iPhone download' : /play\.google\.com/i.test(u) ? 'Android download' : 'Other link'; }]
  ].forEach(function (x) {
    var t = table_(ss.getSheetByName(x[0]));
    if (!t || t.heads.indexOf(x[1]) < 0) return;
    var old = t.heads.indexOf(x[1]) + 1, ok = true;
    t.rows.forEach(function (r) {
      var u = r.v[x[1]];
      if (!u) return;
      var to = t.heads.indexOf(x[2](u)) + 1;
      if (!to) { ok = false; return; }
      var cur = t.sh.getRange(r.r, to).getDisplayValue();
      if (!cur) t.sh.getRange(r.r, to).setValue(clean_(u));
      else if (cur !== u) ok = false;                // the new column already holds something else: keep the old column
    });
    if (ok) t.sh.deleteColumn(old);                 // every link was copied, so the old column is no longer needed
  });
}

/** Runs every 15 minutes (set up by setup). */
function timer() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { reconcile_(); } finally { lock.releaseLock(); }
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
    if (req.action === 'resolve') return json_({ name: resolveName_(String(req.url || '')) });
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);                         // one phone at a time, so two saves never collide
    try {
      var res = {};
      if (req.share != null) return json_(share_(req));   // something sent from a phone's Share menu
      if (req.action === 'push') {
        res.skipped = push_(req.ops || []);
        if ((req.ops || []).some(function (o) { return WATCH.indexOf(o.sheet) >= 0; })) reconcile_();
      }
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
      if (!id) { id = newId_(); sh.getRange(r + 1, idCol + 1).setValue(id); }   // a row somebody typed straight into the sheet
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
    if (op.del) { if (op.sheet !== 'Days') sh.deleteRow(row); return; }
    Object.keys(v).forEach(function (h) {
      var c = heads.indexOf(h);
      if (c < 0 || h === ID) return;
      if (op.sheet === 'Days' && (h === 'Day' || h === 'Date' || h === 'Weekday')) return;
      sh.getRange(row, c + 1).setValue(clean_(v[h]));
    });
  });
  return skipped;
}

// ---------------------------------------------------------------- the automatic Itinerary
// Every dated row of a source tab has one Itinerary row (Source = "<tab>:<row id>"). Rows without a Source are your own.
// The hotels of each day follow the Hotels tab: End hotel = where you sleep that night, Start hotel = where you woke up.
function reconcile_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), it = table_(ss.getSheetByName('Itinerary'));
  if (!it) return;
  var H = it.heads, col = function (h) { return H.indexOf(h); }, want = {}, order = [];
  SOURCES.forEach(function (s) {
    var t = table_(ss.getSheetByName(s.sheet));
    if (!t) return;
    t.rows.forEach(function (r) {
      var d = r.v[s.date] || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      var key = s.sheet + ':' + r.id, time = /^\d{1,2}:\d{2}$/.test(r.v[s.time] || '') ? pad_(r.v[s.time]) : '';
      var link = s.link ? r.v[s.link] || '' : '';
      want[key] = { Date: d, Time: time, Name: s.name(r.v) || '(no name)', Type: s.type, part: s.part || (time ? partOf_(time) : ''),
        'Map link': isMap_(link) ? link : '', Website: link && !isMap_(link) ? link : '', Source: key, id: autoId_(s.sheet, r.id) };
      order.push(key);
    });
  });
  var seen = {}, gone = [];
  it.rows.forEach(function (r) {
    var key = r.v.Source;
    if (!key) return;                             // your own item: never touched
    var w = want[key];
    if (!w || seen[key]) { gone.push(r.r); return; }   // its source lost its date, or was deleted
    seen[key] = 1;
    var part = w.part || (['Morning', 'Afternoon', 'Evening', 'Any time'].indexOf(r.v.Part) >= 0 ? r.v.Part : 'Any time');
    var vals = { Date: w.Date, Time: w.Time, Part: part, Name: w.Name, Type: w.Type, 'Map link': w['Map link'], Website: w.Website };
    Object.keys(vals).forEach(function (h) { if (col(h) >= 0 && (r.v[h] || '') !== vals[h]) it.sh.getRange(r.r, col(h) + 1).setValue(clean_(vals[h])); });
  });
  gone.sort(function (a, b) { return b - a; }).forEach(function (n) { it.sh.deleteRow(n); });
  order.forEach(function (key) {
    if (seen[key]) return;
    var w = want[key], vals = { Date: w.Date, Time: w.Time, Part: w.part || 'Any time', Name: w.Name, Type: w.Type, 'Map link': w['Map link'], Website: w.Website, Source: key };
    vals[ID] = w.id;
    it.sh.appendRow(H.map(function (h) { return clean_(vals[h] || ''); }));
  });
  sortItinerary_(it.sh);
  hotels_(ss);
}
function sortItinerary_(sh) {
  var h = headers_(sh), lr = sh.getLastRow(), dc = h.indexOf('Date') + 1, tc = h.indexOf('Time') + 1;
  if (lr > 2 && dc && tc) sh.getRange(2, 1, lr - 1, h.length).sort([{ column: dc, ascending: true }, { column: tc, ascending: true }]);
}
function hotels_(ss) {
  var days = table_(ss.getSheetByName('Days')), hot = table_(ss.getSheetByName('Hotels'));
  if (!days || !hot) return;
  var stays = hot.rows.map(function (r) { return { name: r.v['Hotel name'] || '', ci: r.v['Check-in'] || '', co: r.v['Check-out'] || '' }; })
    .filter(function (s) { return s.name && /^\d{4}-\d{2}-\d{2}$/.test(s.ci) && /^\d{4}-\d{2}-\d{2}$/.test(s.co) && s.co > s.ci; });
  var dated = {}; stays.forEach(function (s) { dated[s.name] = 1; });
  var cs = days.heads.indexOf('Start hotel'), ce = days.heads.indexOf('End hotel');
  days.rows.forEach(function (r) {
    var d = r.v.Date || '';
    if (!d) return;
    var end = stays.filter(function (s) { return s.ci <= d && d < s.co; })[0], start = stays.filter(function (s) { return s.ci < d && d <= s.co; })[0];
    [[ce, end, 'End hotel'], [cs, start, 'Start hotel']].forEach(function (x) {
      if (x[0] < 0) return;
      var cur = r.v[x[2]] || '', now = x[1] ? x[1].name : (dated[cur] ? '' : cur);   // a dated hotel outside its dates is cleared; your own choice stays
      if (now !== cur) days.sh.getRange(r.r, x[0] + 1).setValue(clean_(now));
    });
  });
}

// ---------------------------------------------------------------- the Ideas inbox
// Whatever was shared (a name, a link, or both) becomes one new row in the Ideas tab.
function share_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Ideas')) return { error: 'server', message: 'The Ideas tab is missing. Run setup again.' };
  var all = String(req.share || ''), m = /https?:\/\/\S+/.exec(all), link = m ? m[0] : '';
  link = link.replace(/([?&])g_st=[^&#]*(&?)/, function (m, sep, amp) { return amp ? sep : ''; }).replace(/[?&]$/, '');
  var idea = cleanName_(all.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300));
  if (!idea && !link) return { error: 'server', message: 'Nothing was shared.' };
  if (!idea) idea = resolveName_(link);          // a bare Google Maps link: read the place name; otherwise empty, the app asks
  push_([{ sheet: 'Ideas', rid: newId_(), isNew: true,
    v: { 'Idea': idea, 'Link': link, 'Added': Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'), 'Added by': String(req.who || '') } }]);
  return { ok: true, saved: idea };
}
// The place name behind a short Google Maps link (maps.app.goo.gl/...), or '' when it cannot be read.
function resolveName_(link) {
  if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(link)) return '';
  try {
    var u = link;
    for (var i = 0; i < 4; i++) {
      var n = nameFromMapsUrl_(u);
      if (n) return n;
      var r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true }), hd = r.getHeaders();
      var next = hd.Location || hd.location;
      if (!next) return '';
      u = next;
    }
    return nameFromMapsUrl_(u);
  } catch (e) { return ''; }
}
function nameFromMapsUrl_(u) {
  var m = /\/maps\/place\/([^\/@?#]+)/.exec(u), q;
  if (m) q = m[1];
  else { m = /[?&]q=([^&#]+)/.exec(u); if (m) q = m[1]; }
  if (!q) return '';
  try { q = decodeURIComponent(q.replace(/\+/g, ' ')); } catch (e) { return ''; }
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d/.test(q)) return '';   // only coordinates, no name
  return cleanName_(q.split(',')[0]).slice(0, 120);
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
// A tab as {sh, heads, rows: [{r: row number, id, v: {header: text}}]}; rows without an id get one.
function table_(sh) {
  if (!sh) return null;
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lc < 1) return null;
  var vals = sh.getRange(1, 1, Math.max(lr, 1), lc).getDisplayValues(), heads = vals[0], idCol = heads.indexOf(ID), rows = [];
  if (idCol < 0) return null;
  for (var r = 1; r < vals.length; r++) {
    var v = {}, any = false;
    for (var c = 0; c < lc; c++) if (c !== idCol && heads[c] && vals[r][c] !== '') { v[heads[c]] = vals[r][c]; any = true; }
    if (!any) continue;
    var id = vals[r][idCol];
    if (!id) { id = newId_(); sh.getRange(r + 1, idCol + 1).setValue(id); }
    rows.push({ r: r + 1, id: id, v: v });
  }
  return { sh: sh, heads: heads, rows: rows };
}
function partOf_(t) { var h = parseInt(t, 10); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; }
function pad_(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : t; }
function isMap_(u) { return /(^|\.)google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|maps\.apple\./i.test(u || ''); }
function join_(a, sep) { return a.filter(function (x) { return x; }).join(sep); }
function autoId_(sheet, id) { return 'auto-' + sheet.replace(/[^A-Za-z]/g, '') + '-' + id; }
function newId_() { return 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
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
