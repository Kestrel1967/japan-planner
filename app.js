/* Japan Planner - the screens.
   Data flow: the shared Google Sheet is the one true copy. The phone keeps a small copy to show quickly,
   plus a list of changes that are waiting. "Sync" = send the waiting changes, get the latest sheet back. */
(function () {
  'use strict';
  var SC = window.SCHEMA, TABS = SC.tabs, LS = window.localStorage;
  var app = document.getElementById('app'), overlay = document.getElementById('overlay'), toastEl = document.getElementById('toast');
  var VERSION = '2.9';

  // ------------------------------------------------------------------ storage
  function sk(k) { return window.JP_PREVIEW ? k.replace(/^jp_/, 'jpv_') : k; }   // preview keeps its own data
  function get(k, d) { try { var v = LS.getItem(sk(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { if (v == null) LS.removeItem(sk(k)); else LS.setItem(sk(k), JSON.stringify(v)); return true; } catch (e) { return false; } }

  var S = {
    mode: get('jp_mode', ''),                     // '' = not set up, 'sheet' = the shared Google Sheet, 'local' = practice on this phone only
    base: get('jp_data', null),                   // the data as of the last sync
    ops: get('jp_ops', []),                       // changes waiting to be sent
    tabs4: get('jp_tabs', ['days', 'places', 'food', 'money']),
    tab: get('jp_tab', ''), day: get('jp_day', -1), filters: {},
    view: 'main', sync: 'idle', syncMsg: '', lastSync: get('jp_last', 0), data: null, fresh: {}
  };
  var RENAMED = { bookings: 'attractions', money: 'expenses' };                                // renamed in 2.8 / 2.9
  S.tabs4 = S.tabs4.map(function (t) { return RENAMED[t] || t; });
  if (RENAMED[S.tab]) S.tab = RENAMED[S.tab];
  if (!byId(S.tab)) S.tab = S.tabs4[0];
  function byId(id) { for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) return TABS[i]; return null; }
  function def(sheet) { return SC.sheets[sheet]; }
  function col(sheet, h) { var c = def(sheet).cols; for (var i = 0; i < c.length; i++) if (c[i].h === h) return c[i]; return null; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // what the Google Sheet sends -> what the app keeps (dropdown lists get the app's own names)
  function normalize(d) {
    var out = { sheets: {}, lists: {} };
    Object.keys(SC.sheets).forEach(function (n) { out.sheets[n] = (d.sheets[n] || []).map(function (r) { return { id: String(r.id), v: r.v || {} }; }); });
    Object.keys(SC.lists).forEach(function (ln) { out.lists[ln] = (d.lists && d.lists[SC.lists[ln]]) || []; });
    return out;
  }
  // Version 2.8 renamed the tabs: Itinerary (one row per day) -> Days, Day plan -> Itinerary, Bookings -> Attractions.
  // What this phone still keeps in the old layout is moved over once, waiting changes included.
  function upgradeLocal() {
    var b = S.base;
    if (!b || !b.sheets || 'Days' in b.sheets) return;
    var sh = b.sheets, plan = sh['Day plan'] || [], days = sh.Itinerary || [], byDate = {}, byRid = {};
    var TYPE = { Places: 'Place', Food: 'Food', Bookings: 'Attraction', Shopping: 'Shopping', Transport: 'Transport' };
    days.forEach(function (r) { byDate[r.v.Date] = r; });
    plan.forEach(function (r) { byRid[r.id] = r; });
    var HOTEL = { Hotel: 'End hotel', 'Start hotel': 'Start hotel' };
    function fix(v) {                             // an item's fields in the new layout
      if (v.Part === 'Bookings') v.Part = v.Time ? partOf(v.Time) : 'Evening';
      if ('From' in v) { v.Type = TYPE[v.From] || 'Own'; delete v.From; }
      return v;
    }
    S.ops = S.ops.map(function (op) {
      if (op.sheet === 'Itinerary') { op.sheet = 'Days'; return op; }
      if (op.sheet === 'Bookings') { op.sheet = 'Attractions'; return op; }
      if (op.sheet !== 'Day plan') return op;
      var row = byRid[op.rid], p = (op.v && op.v.Part) || (row && row.v.Part) || '';
      if (HOTEL[p]) {                             // a hotel item becomes the day's Start / End hotel
        var day = byDate[(op.v && op.v.Date) || (row && row.v.Date)], o = {};
        if (!day) return null;
        o[HOTEL[p]] = op.del ? '' : (op.v && op.v.Name) || (row && row.v.Name) || '';
        return { id: op.id, sheet: 'Days', rid: day.id, isNew: false, v: o, del: false };
      }
      op.sheet = 'Itinerary'; if (op.v) fix(op.v);
      if (op.isNew && op.v && !op.v.Type) op.v.Type = 'Own';
      return op;
    }).filter(Boolean);
    var items = [];
    plan.forEach(function (r) {
      var p = HOTEL[r.v.Part], day = byDate[r.v.Date];
      if (p) { if (day && r.v.Name && !day.v[p]) day.v[p] = r.v.Name; return; }
      fix(r.v); if (!r.v.Type) r.v.Type = 'Own'; items.push(r);
    });
    sh.Days = days; sh.Itinerary = items; sh.Attractions = sh.Bookings || [];
    delete sh['Day plan']; delete sh.Bookings;
    set('jp_data', b); set('jp_ops', S.ops);
  }
  // the Google Sheet answers in the layout before 2.8: its script was not updated yet
  function oldLayout(data) { var x = data && data.sheets; return !!(x && ((!x.Days && (x['Day plan'] || x.Bookings)) || (!x.Expenses && x.Budget))); }
  // 2.9: Budget became Expenses (Item / description -> Name, Actual amount -> Price)
  function upgradeBudget() {
    var b = S.base;
    if (!b || !b.sheets || !('Budget' in b.sheets) || ('Expenses' in b.sheets)) return;
    var ren = { 'Item / description': 'Name', 'Actual amount': 'Price' };
    function fix(v) { Object.keys(ren).forEach(function (k) { if (k in v) { if (!(ren[k] in v)) v[ren[k]] = v[k]; delete v[k]; } }); return v; }
    b.sheets.Expenses = (b.sheets.Budget || []).map(function (r) { fix(r.v); return r; });
    delete b.sheets.Budget;
    S.ops.forEach(function (op) { if (op.sheet === 'Budget') { op.sheet = 'Expenses'; if (op.v) fix(op.v); } });
    set('jp_data', b); set('jp_ops', S.ops);
  }
  var OLD_MSG = 'The Google Sheet still has the old layout. Update its script and run setup (see the update steps). Your changes are kept on this phone until then.';
  function practiceData() {                       // an empty planner for practice mode
    var d = { sheets: {}, lists: clone(SC.listDefaults) }, MS = 86400000, start = Date.UTC(2027, 3, 8);
    Object.keys(SC.sheets).forEach(function (n) { d.sheets[n] = []; });
    for (var i = 0; i < 23; i++) d.sheets.Days.push({ id: 'd' + (i + 1), v: { Day: String(i + 1), Date: new Date(start + i * MS).toISOString().slice(0, 10) } });
    return d;
  }
  // the data to show = last synced copy + waiting changes
  function rebuild() {
    var d = S.base ? clone(S.base) : { sheets: {}, lists: {} };
    S.ops.forEach(function (op) {
      var rows = d.sheets[op.sheet] = d.sheets[op.sheet] || [], i, row = null;
      for (i = 0; i < rows.length; i++) if (rows[i].id === op.rid) { row = rows[i]; break; }
      if (op.del) { if (row) rows.splice(i, 1); return; }
      if (!row) { if (!op.isNew) return; row = { id: op.rid, v: {} }; rows.push(row); }
      Object.keys(op.v).forEach(function (k) { if (op.v[k] === '') delete row.v[k]; else row.v[k] = op.v[k]; });
      row.wait = true;
    });
    reconcileLocal(d);
    d.tripDates = (d.sheets.Days || []).map(function (r) { return r.v.Date; }).filter(Boolean).sort();
    S.data = d;
  }
  function saveOps() { if (!set('jp_ops', S.ops)) toast('Phone storage is full - sync soon'); rebuild(); }
  // rec = the record being changed, or null for a new one
  function change(sheet, rec, vals, del) {
    var rid = rec ? rec.id : uid();
    S.ops.push({ id: uid(), sheet: sheet, rid: rid, isNew: !rec, v: vals || {}, del: !!del });
    if (sheet === 'Ideas' && !rec) markSeen([rid]);   // made on this phone: never announced as "new" later
    saveOps(); render();
    if (S.mode === 'local') sync(); else syncSoon();
    return rid;
  }

  // ------------------------------------------------------------------ sync
  var syncing = false, soon = 0, syncPromise = null;
  function syncSoon() { clearTimeout(soon); soon = setTimeout(function () { sync(); }, 500); }
  function setSync(state, msg) { S.sync = state; S.syncMsg = msg || ''; paintPill(); }
  function sync(manualTap) {
    if (!S.mode) return Promise.resolve();
    if (syncing) return syncPromise;
    if (S.mode === 'local') {                     // practice: nothing to send, just keep the changes
      rebuild();
      S.base = { sheets: {}, lists: S.data.lists };
      Object.keys(S.data.sheets).forEach(function (n) { S.base.sheets[n] = S.data.sheets[n].map(function (r) { return { id: r.id, v: r.v }; }); });
      S.ops = []; set('jp_data', S.base); saveOps(); setSync('idle'); render();
      return Promise.resolve();
    }
    syncing = true; setSync('busy');
    var checked = get('jp_layout', '') === '2.9', sent = checked ? S.ops.slice() : [];   // first sync after the update: look before sending
    syncPromise = Api.call(sent.length ? 'push' : 'pull', sent).then(function (res) {
      syncing = false;
      if (oldLayout(res.data)) { setSync('error', OLD_MSG); render(); if (manualTap) toast(OLD_MSG); return; }
      if (!checked) set('jp_layout', '2.9');
      var ids = {}; sent.forEach(function (o) { ids[o.id] = 1; });
      S.ops = S.ops.filter(function (o) { return !ids[o.id]; });
      S.base = normalize(res.data); S.lastSync = Date.now();
      set('jp_data', S.base); set('jp_last', S.lastSync); saveOps();
      setSync('idle'); render();
      checkIdeas();
      if (res.skipped) toast(res.skipped + ' change' + (res.skipped > 1 ? 's were' : ' was') + ' skipped: the item was deleted meanwhile');
      else if (manualTap) toast('Up to date');
      if (S.ops.length) syncSoon();
    }, function (e) {
      syncing = false;
      if (e && e.code === 'offline') setSync('wait', 'No internet. Your changes are kept on this phone and will be sent later.');
      else if (e && e.code === 'key') setSync('key', 'The passcode is missing or was changed. Enter it again to send your changes.');
      else setSync('error', (e && e.friendly) ? e.message : 'Sync failed: ' + ((e && e.message) || e));
      render();
      if (manualTap) { if (e && e.code === 'key') askKey(); else showError(e); }
    });
    return syncPromise;
  }
  window.addEventListener('online', function () { if (S.mode === 'sheet') sync(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.mode === 'sheet' && Date.now() - S.lastSync > 20000) sync(); });
  setInterval(function () {                       // send what is waiting; otherwise look for the other phone's changes now and then
    if (S.mode !== 'sheet' || document.hidden || S.sync === 'key') return;
    if (S.ops.length || (overlay.hidden && Date.now() - S.lastSync > 120000)) sync();
  }, 30000);

  // ------------------------------------------------------------------ small tools
  function h(tag, attrs, kids) {
    var el = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      var a = attrs[k]; if (a == null || a === false) continue;
      if (k === 'class') el.className = a;
      else if (k === 'text') el.textContent = a;
      else if (k === 'html') el.innerHTML = a;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), guard(a));
      else if (k === 'value') el.value = a;
      else el.setAttribute(k, a === true ? '' : a);
    }
    (kids || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function guard(fn) { return function (ev) { try { var r = fn.call(this, ev); if (r && r.catch) r.catch(showError); } catch (e) { showError(e); } }; }
  function btn(label, cls, fn, extra) { var a = { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }; if (extra) Object.assign(a, extra); return h('button', a, typeof label === 'string' ? [label] : label); }
  var toastT = 0;
  function toast(msg) { if (!msg) return; toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 3200); }
  function openSheet(nodes, cls) { overlay.textContent = ''; overlay.appendChild(h('div', { class: 'sheetbox ' + (cls || '') }, nodes)); overlay.hidden = false; overlay.scrollTop = 0; }
  function closeSheet() { overlay.hidden = true; overlay.textContent = ''; }
  function showError(e) {
    var msg = (e && e.message) || String(e), nodes = [h('h2', { text: 'That did not work' }),
      h('p', { text: e && e.friendly ? msg : 'Something went wrong. Nothing was lost: your changes are kept on this phone.' })];
    if (!(e && e.friendly)) nodes.push(h('pre', { class: 'details', text: msg }));
    nodes.push(btn('OK', 'primary block', closeSheet));
    openSheet(nodes);
  }
  window.addEventListener('error', function (ev) { showError(ev.error || new Error(ev.message)); });
  window.addEventListener('unhandledrejection', function (ev) { showError(ev.reason); });

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(iso, long) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return iso || '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return DOW[d.getUTCDay()] + ' ' + (+m[3]) + ' ' + MON[+m[2] - 1] + (long ? ' ' + m[1] : '');
  }
  function host(u) { return String(u).replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0]; }
  function shown(sheet, field, v) { var c = col(sheet, field); if (c && c.k === 'link') return host(v); return c && (c.k === 'date' || c.list === 'L_TripDates') ? fmtDate(v) : v; }
  function icon(name) { return h('span', { class: 'ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.more) + '</svg>' }); }
  var ICONS = {
    days: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    places: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    food: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 3v4M13 3v4M17 3v4M8 21h8"/>',
    expenses: '<circle cx="12" cy="12" r="9"/><path d="M9 7l3 5 3-5M12 12v5M9 13h6"/>',
    flights: '<path d="M3 13l18-7-6 14-3-6-9-1z"/>',
    hotels: '<path d="M3 20V8M3 15h18v5M21 15v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11.5" r="1.5"/>',
    transport: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4M9 14h.01M15 14h.01"/>',
    attractions: '<path d="M4 8a2 2 0 0 0 0 4v5h16v-5a2 2 0 0 0 0-4V5H4z"/><path d="M14 5v12"/>',
    itinerary: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    packing: '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3M9 11v5M15 11v5"/>',
    todo: '<path d="M4 6l2 2 3-3M4 13l2 2 3-3M13 7h7M13 14h7M4 20h16"/>',
    apps: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    shopping: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    phrases: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    emergency: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    ideas: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    sun: '<path d="M2 20h20M4 20a5 5 0 0 1 10 0M9 12.5v-2M4.6 15.2L3.2 13.8M13.4 15.2l1.4-1.4M19 16.5V5M16 8l3-3 3 3"/>',
    noon: '<path d="M2 21h20M9 9.3V7.6M3.3 15H1.8M14.7 15h1.5M5 11l-1.1-1.1M13 11l1.1-1.1M5 19l-.7.7M13 19l.7.7M20 4v11M17.4 12.4L20 15l2.6-2.6"/><circle cx="9" cy="15" r="3.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    check: '<path d="M5 12l5 5 9-10"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'
  };

  // ------------------------------------------------------------------ frame: header, tab bar
  function tabOrder() {
    var seen = {}, out = [];
    S.tabs4.concat(TABS.map(function (t) { return t.id; })).forEach(function (id) { if (byId(id) && !seen[id]) { seen[id] = 1; out.push(id); } });
    return out;
  }
  function pillText() {
    if (S.sync === 'busy') return 'Saving…';
    if (S.sync === 'key') return 'Passcode';
    if (S.ops.length) return S.ops.length + ' waiting';
    if (S.sync === 'error') return 'Problem';
    return S.mode === 'local' ? 'Practice' : 'Saved';
  }
  function paintPill() { var p = document.getElementById('pill'); if (p) { p.textContent = pillText(); p.className = 'pill ' + (S.sync === 'busy' ? 'busy' : (S.ops.length || S.sync !== 'idle') ? 'warn' : 'ok'); } }
  function pillTap() {
    if (S.sync === 'key') return askKey();
    if (S.mode === 'local') { toast('Practice mode: data stays on this phone only'); return; }
    if (S.syncMsg && S.sync !== 'busy') toast(S.syncMsg);
    return sync(true);
  }
  function go(tab) {
    S.tab = tab; S.view = 'main'; set('jp_tab', tab); closeSheet(); render(); app.querySelector('.main').scrollTop = 0;
    var at = tab === 'itinerary' && document.getElementById('iday-' + Math.max(0, S.day));   // the Itinerary opens at the day you were looking at
    if (at && S.day > 0) app.querySelector('.main').scrollTop = at.offsetTop - 8;
  }
  function frame(title, body, fab) {
    var bar = h('div', { class: 'tabs', id: 'tabs' }, tabOrder().map(function (id) {
      var t = byId(id);
      return h('button', { type: 'button', class: 'tab' + (S.view === 'main' && S.tab === id ? ' on' : ''), 'data-id': id, onclick: function () { go(id); } }, [icon(id), h('span', { text: t.label })]);
    }));
    return [
      h('header', { class: 'top' + (window.JP_PREVIEW ? ' preview' : '') }, [h('h1', { text: (window.JP_PREVIEW ? 'PREVIEW · ' : '') + title }), h('button', { type: 'button', id: 'pill', class: 'pill', onclick: pillTap })]),
      h('main', { class: 'main' }, body),
      fab ? h('div', { class: 'fabdock' }, [fab]) : null,
      h('nav', { class: 'bar', 'aria-label': 'Sections' }, [bar,
        h('button', { type: 'button', class: 'tab more' + (S.view !== 'main' ? ' on' : ''), onclick: openMore }, [icon('more'), h('span', { text: 'More' })])])
    ];
  }
  function openMore() {
    openSheet([h('h2', { text: 'All sections' }),
      h('div', { class: 'grid3' }, TABS.map(function (t) { return h('button', { type: 'button', class: 'gridbtn', style: 'background:' + t.tint, onclick: function () { go(t.id); } }, [icon(t.id), h('span', { text: t.label })]); })),
      btn([icon('gear'), 'Settings'], 'block row', function () { closeSheet(); S.view = 'settings'; render(); }),
      btn('Close', 'block', closeSheet)]);
  }

  function render() {
    var keep = app.querySelector('.main'), top = keep ? keep.scrollTop : 0, nodes;
    if (!S.mode) nodes = setupView();
    else if (S.view === 'settings') nodes = frame('Settings', settingsView());
    else if (S.tab === 'days') nodes = frame('Days', daysView());
    else if (S.tab === 'itinerary') nodes = frame('Itinerary', itinView());
    else if (S.tab === 'expenses') nodes = expensesView();
    else nodes = listView(byId(S.tab));
    app.textContent = ''; nodes.forEach(function (n) { if (n) app.appendChild(n); });
    paintPill();
    var m = app.querySelector('.main'); if (m) { m.scrollTop = top; if (S.mode && S.view === 'main' && S.tab === 'days') m.classList.add('fit'); }
    var on = app.querySelector('#tabs .tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ------------------------------------------------------------------ Days (one day at a time)
  function days() { return ((S.data.sheets.Days) || []).slice().sort(function (a, b) { return (+a.v.Day || 0) - (+b.v.Day || 0); }); }
  function daysView() {
    var list = days();
    if (!list.length) return [h('p', { class: 'empty', text: S.base ? 'The Days tab was not found in the Google Sheet.' : 'Loading…' })];
    if (S.day < 0 || S.day >= list.length) {
      var iso = today();
      S.day = 0; list.forEach(function (d, i) { if (d.v.Date === iso) S.day = i; });
    }
    var d = list[S.day], v = d.v;
    function move(n) { S.day = Math.max(0, Math.min(list.length - 1, S.day + n)); set('jp_day', S.day); render(); }
    var when = fmtDate(v.Date);
    function cityChip(label) {
      return h('button', { type: 'button', class: 'citychip', onclick: function () { cityForm(list, S.day); } },
        [h('span', { class: 'clabel', text: label }), h('span', { class: 'cval' + (v[label] ? '' : ' none'), dir: 'auto', text: v[label] || 'Not set' })]);
    }
    function small(label, val, fn, cls, empty) {
      return h('button', { type: 'button', class: 'chip sm', onclick: fn }, [h('span', { class: 'clabel', text: label }), h('span', { class: 'cval' + (val ? (cls || '') : ' none'), dir: 'auto', text: val || empty || 'Not set' })]);
    }
    function field1(label, fields, title) { return function () { editFields('Days', d, fields, when + ' · ' + (title || label)); }; }
    var spent = sumByCur(expensesOn(v.Date));
    var tb = toBook(v.Date), tbVal = tb.length ? (tb[0].v.What || '(no name)') + (tb.length > 1 ? '  +' + (tb.length - 1) : '') : '';
    return [
      h('div', { class: 'dayhead' }, [
        h('button', { type: 'button', class: 'round', 'aria-label': 'Previous day', disabled: S.day === 0, onclick: function () { move(-1); } }, [icon('left')]),
        h('button', { type: 'button', class: 'daytitle', onclick: function () { pickDay(list); } }, [
          h('span', { class: 'dline' }, [h('span', { class: 'big', text: when }), h('span', { class: 'small', text: 'Day ' + (v.Day || S.day + 1) + ' of ' + list.length })]),
          h('span', { class: 'track' }, [h('span', { style: 'width:' + Math.max(4, Math.round((S.day + 1) / list.length * 100)) + '%' })])]),
        h('button', { type: 'button', class: 'round', 'aria-label': 'Next day', disabled: S.day === list.length - 1, onclick: function () { move(1); } }, [icon('right')])]),
      h('div', { class: 'rowx' }, [cityChip('Starts in'), cityChip('Ends in'),
        h('button', { type: 'button', class: 'routebtn', 'aria-label': 'Route of this day in Google Maps', onclick: function () { openRoute(list, S.day); } }, [icon('route'), h('span', { text: 'Route' })])]),
      h('div', { class: 'blocks' }, ['Morning', 'Afternoon', 'Evening', 'Food'].map(function (id) { return bigPart(d, part(id)); })),
      h('div', { class: 'rowx' }, [small('Sleeping at', v['End hotel'], function () { cityForm(list, S.day); }), smallPart(d, part('Transport'), small)]),
      h('div', { class: 'rowx' }, [small('Tickets to book', tbVal, function () { ticketsSheet(d, tb); }, '', 'Nothing to book'), small('Day type', v['Day type'], field1('Day type', ['Day type']))]),
      h('div', { class: 'rowx' }, [
        h('button', { type: 'button', class: 'chip sm addexp', onclick: function () { expenseForm(null, v.Date); } }, [icon('plus'), h('span', { text: 'Add expense' })]),
        small('Spent today', spent, function () { var f = expFilter(); f.mode = 'day'; f.day = v.Date; go('expenses'); }, '', 'Nothing yet')]),
      h('div', { class: 'rowx notes' }, [small('Notes', v.Notes, field1('Notes', ['Notes']))])
    ];
  }
  // attractions on this day that still need a ticket (not Booked, Paid or Cancelled)
  var TICKET_DONE = ['Booked', 'Paid', 'Cancelled'];
  function toBook(date) { return (S.data.sheets.Attractions || []).filter(function (r) { return r.v['Visit date'] === date && TICKET_DONE.indexOf(r.v.Status || '') < 0; }); }
  function ticketsSheet(day, rows) {
    var back = function () { ticketsSheet(day, toBook(day.v.Date)); };
    if (rows.length === 1) { editFields('Attractions', rows[0], null, rows[0].v.What || 'Attraction'); return; }
    openSheet([h('h2', { class: 'withico' }, [icon('attractions'), 'Tickets to book · ' + fmtDate(day.v.Date)])].concat(
      rows.length ? rows.map(function (r) {
        return h('div', { class: 'pitem' }, [h('button', { type: 'button', class: 'pmain', onclick: function () { editFields('Attractions', r, null, r.v.What || 'Attraction', null, back); } }, [
          h('span', { class: 'ptime', text: r.v.Time || '' }),
          h('span', { class: 'pname', dir: 'auto' }, [r.v.What || '(no name)', h('span', { class: 'pnote', text: [r.v.Status || 'To book', r.v['Book by (deadline)'] ? 'book by ' + fmtDate(r.v['Book by (deadline)']) : ''].filter(Boolean).join(' · ') })])]),
          linkBtn('Book', r.v['Where to book (link)'])]);
      }) : [h('p', { class: 'note', text: 'Nothing left to book for this day. Attractions with this visit date that are not Booked, Paid or Cancelled show here.' })],
      [btn('Open Attractions', 'block', function () { go('attractions'); }), btn('Close', 'block', closeSheet)]));
  }

  // ------------------------------------------------------------------ the parts of a day
  // each part is a list of Itinerary items; "from" = the sections its dropdown offers
  var PARTS = [
    { id: 'Morning', label: 'Morning', icon: 'sun', tint: '#FFF2CC', from: ['places', 'attractions', 'shopping', 'ideas'] },
    { id: 'Afternoon', label: 'Afternoon', icon: 'noon', tint: '#FCE0C5', from: ['places', 'attractions', 'shopping', 'ideas'] },
    { id: 'Evening', label: 'Evening', icon: 'moon', tint: '#D9D2E9', from: ['places', 'attractions', 'shopping', 'ideas'] },
    { id: 'Food', label: 'Food plans', icon: 'food', tint: '#F4CCCC', from: ['food'] },
    { id: 'Transport', label: 'Transport', icon: 'transport', tint: '#C9E7EC', from: ['transport', 'flights'] }
  ];
  function part(id) { for (var i = 0; i < PARTS.length; i++) if (PARTS[i].id === id) return PARTS[i]; return PARTS[2]; }   // anything else: Evening
  function byTime(a, b) { var x = a.v.Time || '99', y = b.v.Time || '99'; return x < y ? -1 : x > y ? 1 : 0; }
  // the box an item lives in when it has no hour (Food, Transport, or the part it was added to; Evening when none)
  function homePart(r) { var p = r.v.Part || ''; return p === 'Food' || p === 'Transport' || FREE.indexOf(p) >= 0 ? p : 'Evening'; }
  // Morning / Afternoon / Evening: everything whose hour falls there (food and transport too), then the items without an hour that live there.
  // Food: all of the day's food. Transport: trips between cities.
  function planItems(date, p) {
    return (S.data.sheets.Itinerary || []).filter(function (r) {
      if (r.v.Date !== date) return false;
      var t = padTime(r.v.Time), home = homePart(r);
      if (p === 'Food' || p === 'Transport') return home === p;
      return t ? partOf(t) === p : home === p;
    }).sort(byTime);
  }
  // the whole day in hour order; items without an hour at the end of the day
  function itemKey(r) { return r.v.Time || '99'; }
  function dayItems(date) {
    return (S.data.sheets.Itinerary || []).filter(function (r) { return r.v.Date === date; })
      .sort(function (a, b) { var x = itemKey(a), y = itemKey(b); return x < y ? -1 : x > y ? 1 : (a.v.Name || '') < (b.v.Name || '') ? -1 : 1; });
  }
  function isMap(u) { return /(^|\.)google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|maps\.apple\./i.test(u || ''); }
  // a link as shared from the iPhone shortcut can carry leftover text (?g_st=...): remove it
  function cleanUrl(u) {
    u = String(u || '').trim();
    return u.replace(/([?&])g_st=[^&#]*(&?)/, function (m, sep, amp) { return amp ? sep : ''; }).replace(/[?&]$/, '');
  }

  // ------------------------------------------------------------------ the automatic Itinerary (the same rules as the sheet's script)
  // A row with a date in one of these sections has one Itinerary item (Source = "<tab>:<row id>"). Items without a Source are your own.
  var SRC = [
    { sheet: 'Flights', tab: 'flights', type: 'Flight', part: 'Transport', date: 'Departure date', time: 'Departs (local)',
      name: function (v) { return [v['From (airport)'], v['To (airport)']].filter(Boolean).join(' → ') + (v['Flight no.'] ? ' · ' + v['Flight no.'] : ''); } },
    { sheet: 'Transport', tab: 'transport', type: 'Transport', part: intercity, date: 'Date', time: 'Departs',
      name: function (v) { return [v.From, v.To].filter(Boolean).join(' → ') + (v.Type ? ' · ' + v.Type : ''); } },
    { sheet: 'Attractions', tab: 'attractions', type: 'Attraction', date: 'Visit date', time: 'Time', link: 'Where to book (link)', name: function (v) { return v.What || ''; } },
    { sheet: 'Food', tab: 'food', type: 'Food', part: 'Food', date: 'Planned day', time: 'Planned time', link: 'Map link', name: function (v) { return v.Name || ''; } },
    { sheet: 'Places', tab: 'places', type: 'Place', date: 'Planned day', time: 'Planned time', link: 'Map link', name: function (v) { return v['Place name'] || ''; } },
    { sheet: 'Shopping', tab: 'shopping', type: 'Shopping', date: 'Planned day', time: 'Planned time',
      name: function (v) { return (v.Item || '') + (v['Shop / brand'] ? ' (' + v['Shop / brand'] + ')' : ''); } }
  ];
  var FREE = ['Morning', 'Afternoon', 'Evening'], ISO = /^\d{4}-\d{2}-\d{2}$/;
  // a trip between two cities goes in the Transport box; inside one city it is placed by its hour like anything else
  function intercity(v) { var a = v['Origin city'] || '', b = v['Destination city'] || ''; return a && b && a === b ? '' : 'Transport'; }
  function fixedPart(s, v) { return typeof s.part === 'function' ? s.part(v) : s.part || ''; }
  function srcByTab(tab) { for (var i = 0; i < SRC.length; i++) if (SRC[i].tab === tab) return SRC[i]; return null; }
  function srcBySheet(sh) { for (var i = 0; i < SRC.length; i++) if (SRC[i].sheet === sh) return SRC[i]; return null; }
  function autoId(sheet, id) { return 'auto-' + sheet.replace(/[^A-Za-z]/g, '') + '-' + id; }
  function partOf(t) { var hr = parseInt(t, 10); return hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening'; }
  function padTime(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; }
  function autoVals(s, r, oldPart) {
    var v = r.v, time = padTime(v[s.time]), link = s.link ? v[s.link] || '' : '';
    return { Date: v[s.date], Time: time, Part: fixedPart(s, v) || (time ? partOf(time) : FREE.indexOf(oldPart) >= 0 ? oldPart : 'Evening'),
      Name: s.name(v) || '(no name)', Type: s.type, 'Map link': isMap(link) ? link : '', Website: link && !isMap(link) ? link : '', Source: s.sheet + ':' + r.id };
  }
  function reconcileLocal(d) {
    var want = {}, order = [], seen = {};
    SRC.forEach(function (s) {
      (d.sheets[s.sheet] || []).forEach(function (r) { if (ISO.test(r.v[s.date] || '')) { var k = s.sheet + ':' + r.id; want[k] = { s: s, r: r }; order.push(k); } });
    });
    d.sheets.Itinerary = (d.sheets.Itinerary || []).filter(function (row) {
      var k = row.v.Source;
      if (!k) return true;                         // your own item
      var w = want[k];
      if (!w || seen[k]) return false;             // its source lost its date, or was deleted
      seen[k] = 1;
      var nv = autoVals(w.s, w.r, row.v.Part);
      Object.keys(nv).forEach(function (x) { if (nv[x]) row.v[x] = nv[x]; else delete row.v[x]; });
      return true;
    });
    order.forEach(function (k) {
      if (seen[k]) return;
      var w = want[k], nv = autoVals(w.s, w.r, '');
      Object.keys(nv).forEach(function (x) { if (!nv[x]) delete nv[x]; });
      d.sheets.Itinerary.push({ id: autoId(w.s.sheet, w.r.id), v: nv });
    });
    // the hotels of each day follow the Hotels tab's dates: End hotel = sleeping there that night, Start hotel = woke up there
    var stays = (d.sheets.Hotels || []).map(function (r) { return { name: r.v['Hotel name'] || '', ci: r.v['Check-in'] || '', co: r.v['Check-out'] || '' }; })
      .filter(function (x) { return x.name && ISO.test(x.ci) && ISO.test(x.co) && x.co > x.ci; }), dated = {};
    stays.forEach(function (x) { dated[x.name] = 1; });
    (d.sheets.Days || []).forEach(function (r) {
      var dt = r.v.Date || '';
      if (!dt) return;
      [['End hotel', function (x) { return x.ci <= dt && dt < x.co; }], ['Start hotel', function (x) { return x.ci < dt && dt <= x.co; }]].forEach(function (p) {
        var hit = stays.filter(p[1])[0], cur = r.v[p[0]] || '', now = hit ? hit.name : (dated[cur] ? '' : cur);
        if (now) r.v[p[0]] = now; else delete r.v[p[0]];
      });
    });
  }
  function sourceOf(item) {                       // the row an automatic item comes from: {s, r}, or null
    var m = /^([^:]+):(.+)$/.exec(item.v.Source || ''), s = m && srcBySheet(m[1]);
    if (!s) return null;
    var r = (S.data.sheets[s.sheet] || []).filter(function (x) { return x.id === m[2]; })[0];
    return r ? { s: s, r: r } : null;
  }
  // an automatic item's own details (its part of the day, notes): always sent as "create or update", it may exist only on this phone yet
  function setAuto(s, r, vals) {
    vals.Source = s.sheet + ':' + r.id;
    S.ops.push({ id: uid(), sheet: 'Itinerary', rid: autoId(s.sheet, r.id), isNew: true, v: vals, del: false });
    saveOps(); render();
    if (S.mode === 'local') sync(); else syncSoon();
  }

  // ------------------------------------------------------------------ the day's route in Google Maps
  // stops = Morning, Afternoon, Evening and Food items in hour order; from last night's hotel to tonight's hotel
  var ROUTE_PARTS = ['Morning', 'Afternoon', 'Evening', 'Food'], MAX_STOPS = 9;
  function stopText(name, city) {                 // Maps finds a stop by its name; the day's city helps it pick the right one
    var n = String(name || '').trim(), low = n.toLowerCase();
    if (!n || !city) return n;
    var named = (S.data.lists.L_Cities || []).concat([city]).some(function (c) { return c && low.indexOf(String(c).toLowerCase()) >= 0; });
    return named ? n : n + ', ' + city;           // the name already says which city: leave it as it is
  }
  function dayStops(date) {
    var out = [], seen = {}, moving = { Transport: 1, Flight: 1 };
    ['Morning', 'Afternoon', 'Evening', 'Food'].forEach(function (p) {
      planItems(date, p).forEach(function (r) {
        if (seen[r.id] || moving[r.v.Type] || (p === 'Food' && r.v.Time)) return;   // timed food is already in its time part
        seen[r.id] = 1; out.push(r);
      });
    });
    return out;                                   // Morning, Afternoon, Evening by hour, then food without an hour
  }
  function routeUrl(list, idx) {
    var day = list[idx], v = day.v, prev = idx > 0 ? list[idx - 1].v : {};
    var cityStart = v['Starts in'] || prev['Ends in'] || '', cityEnd = v['Ends in'] || cityStart;
    var sh = startHotel(list, idx), hotel = v['End hotel'] || '';
    var oneCity = cityStart && cityStart === cityEnd ? cityStart : '';   // on a travel day the stops may be in either city: names only
    var stops = dayStops(v.Date).map(function (r) { return stopText(r.v.Name, oneCity); }).filter(Boolean);
    var origin = sh ? stopText(sh.name, sh.auto ? (prev['Ends in'] || cityStart) : cityStart) : '', dest = hotel ? stopText(hotel, cityEnd) : '';   // last night's hotel is in the city where yesterday ended
    if (!stops.length && !dest) return { error: 'Nothing to route on this day yet. Add places to Morning, Afternoon, Evening or Food, or a hotel to Sleeping at.' };
    if (!dest) dest = stops.pop();                // no hotel tonight: the route ends at the last stop
    var dropped = Math.max(0, stops.length - MAX_STOPS);
    stops = stops.slice(0, MAX_STOPS);
    var q = 'api=1&destination=' + encodeURIComponent(dest);
    if (origin) q += '&origin=' + encodeURIComponent(origin);   // no origin: Google Maps starts where you are
    if (stops.length) q += '&waypoints=' + stops.map(encodeURIComponent).join('%7C');
    return { url: 'https://www.google.com/maps/dir/?' + q, dropped: dropped, count: stops.length + 1 + (origin ? 1 : 0) };
  }
  function openRoute(list, idx) {
    var r = routeUrl(list, idx);
    if (r.error) { toast(r.error); return; }
    if (r.dropped) toast('Google Maps takes ' + MAX_STOPS + ' stops at most: the last ' + r.dropped + ' were left out');
    window.open(r.url, '_blank', 'noopener');
  }

  function linkBtn(label, url) { return /^https?:\/\//i.test(url || '') ? h('a', { class: 'linkbtn', href: url, target: '_blank', rel: 'noopener', text: label }) : null; }
  function tapPart(day, p, items) {               // nothing yet: straight to the form. Otherwise the list
    if (!items.length) planForm(day, p, null);
    else openPart(day, p);
  }
  // a big coloured block: the first three items by hour, name and hour only
  function bigPart(day, p) {
    var items = planItems(day.v.Date, p.id), kids = [h('span', { class: 'bhead' }, [icon(p.icon), h('span', { text: p.label })])];
    items.slice(0, 3).forEach(function (r) { kids.push(h('span', { class: 'bline' }, [h('b', { text: r.v.Time || '' }), h('span', { dir: 'auto', text: r.v.Name || '(no name)' })])); });
    if (items.length > 3) kids.push(h('span', { class: 'bmore', text: '+' + (items.length - 3) + ' more' }));
    if (!items.length) kids.push(h('span', { class: 'bmore', text: 'Tap to add' }));
    return h('button', { type: 'button', class: 'dblock', style: 'background:' + p.tint, onclick: function () { tapPart(day, p, items); } }, kids);
  }
  // a small white block: the first item, and how many more
  function smallPart(day, p, small) {
    var items = planItems(day.v.Date, p.id), f = items[0], val = f ? (f.v.Time ? f.v.Time + ' ' : '') + (f.v.Name || '') : '';
    if (items.length > 1) val += '  +' + (items.length - 1);
    return small(p.label, val, function () { tapPart(day, p, items); }, '', 'Tap to add');
  }
  function itemRow(day, r, back, showPart) {
    var t = padTime(r.v.Time), home = homePart(r), p = part(home !== 'Food' && home !== 'Transport' && t ? partOf(t) : home), tag = r.v.Source ? r.v.Type : '';
    return h('div', { class: 'pitem' }, [
      h('button', { type: 'button', class: 'pmain', onclick: function () { planForm(day, p, r, back); } }, [
        showPart ? h('span', { class: 'pico' }, [icon(p.icon)]) : null,
        h('span', { class: 'ptime' + (r.v.Time ? '' : ' soft'), text: r.v.Time || (showPart ? '—' : '') }),
        h('span', { class: 'pname', dir: 'auto' }, [r.v.Name || '(no name)', tag || r.v.Notes ? h('span', { class: 'pnote', dir: 'auto', text: [tag, r.v.Notes].filter(Boolean).join(' · ') }) : null])]),
      linkBtn('Map', r.v['Map link']), linkBtn('Web', r.v.Website)]);
  }
  // an opened part: one row per item with hour, name, Map and Web
  function openPart(day, p) {
    var items = planItems(day.v.Date, p.id), back = function () { openPart(day, p); };
    openSheet([h('h2', { class: 'withico' }, [icon(p.icon), p.label + ' · ' + fmtDate(day.v.Date)])].concat(
      items.length ? items.map(function (r) { return itemRow(day, r, back); }) : [h('p', { class: 'note', text: 'Nothing here yet.' })],
      [btn([icon('plus'), 'Add to ' + p.label], 'primary block', function () { planForm(day, p, null, back); }), btn('Close', 'block', closeSheet)]), 'tinted');
    overlay.firstChild.style.background = p.tint;
  }
  // what one row of another section offers to a day item
  function offer(t, r) {
    var v = r.v, s = srcByTab(t.id), o = { name: t.title.map(function (x) { return v[x] || ''; }).filter(Boolean).join(t.sep || ' '), map: cleanUrl(v['Map link'] || ''), web: cleanUrl(v['Booking link'] || v['Where to book (link)'] || ''), time: s ? padTime(v[s.time]) : '' };
    if (t.id === 'ideas' && v.Link) { if (isMap(v.Link)) o.map = cleanUrl(v.Link); else o.web = cleanUrl(v.Link); }
    if (o.map && !isMap(o.map) && !o.web) { o.web = o.map; o.map = ''; }
    o.hint = [v.City, v['District / ward'], v.Type || v.Category].filter(Boolean).join(', ');
    if (s && ISO.test(v[s.date] || '')) o.hint = (o.hint ? o.hint + ' · ' : '') + 'on ' + fmtDate(v[s.date]);
    return o;
  }
  // the form for one item. back = where to return to (the opened list), if any
  function planForm(day, p, rec, back) {
    var v = rec ? rec.v : {}, date = day.v.Date, picked = null, byH = {};
    function done() { if (back) back(); else closeSheet(); }
    var from = rec && v.Source ? sourceOf(rec) : null;
    if (from) return autoForm(day, p, rec, from, done);
    def('Itinerary').cols.forEach(function (c) { byH[c.h] = c; });
    var fName = field('Itinerary', byH.Name, v.Name || ''), fTime = field('Itinerary', byH.Time, v.Time || ''),
      fMap = field('Itinerary', byH['Map link'], v['Map link'] || ''), fWeb = field('Itinerary', byH.Website, v.Website || ''), fNotes = field('Itinerary', byH.Notes, v.Notes || '');
    fMap.querySelector('label').textContent = 'Google Maps link'; fTime.querySelector('label').textContent = 'Hour';
    function inp(f) { return f.querySelector('[data-h]'); }
    var fromLine = h('p', { class: 'note', hidden: true });
    function showOwn(on) { [fName, fMap, fWeb].forEach(function (f) { f.hidden = !on; }); fromLine.hidden = on; }
    var choices = {}, groups = [];
    if (!rec) p.from.forEach(function (id) {
      var t = byId(id), rows = S.data.sheets[t.sheet] || [];
      if (!rows.length) return;
      groups.push(h('optgroup', { label: t.label }, rows.map(function (r) {
        var o = offer(t, r), key = id + '|' + r.id; choices[key] = { t: t, r: r, o: o, s: srcByTab(id) };
        return h('option', { value: key, text: (o.name || '(no name)') + (o.hint ? ' · ' + o.hint : '') });
      })));
    });
    var nodes = [h('h2', { class: 'withico' }, [icon(p.icon), fmtDate(date) + ' · ' + p.label])];
    if (groups.length) {
      var sel = h('select', { id: 'pick', onchange: function () {
        var c = choices[this.value];
        picked = c || null;
        if (!c) { showOwn(true); return; }
        if (c.s) {                                // from a section with dates: the item IS that row, put on this day
          showOwn(false); fromLine.textContent = c.t.label + ': ' + (c.o.name || '(no name)') + '. Its day and hour are saved in ' + c.t.label + ' too.';
          inp(fTime).value = c.o.time || '';
        } else {
          showOwn(true); inp(fName).value = c.o.name;
          if (c.o.map) inp(fMap).value = c.o.map;
          if (c.o.web) inp(fWeb).value = c.o.web;
        }
      } }, [h('option', { value: '', text: 'Choose from your lists…' })].concat(groups));
      nodes.push(h('div', { class: 'field' }, [h('label', { for: 'pick', text: 'Pick one you already saved' }), sel]));
      nodes.push(h('p', { class: 'note', text: 'Or type your own below.' }));
    } else if (!rec) nodes.push(h('p', { class: 'note', text: 'Nothing saved in ' + p.from.map(function (id) { return byId(id).label; }).join(', ') + ' yet, so type it here.' }));
    nodes = nodes.concat([fromLine, fName, fTime, fMap, fWeb, fNotes]);
    nodes.push(btn('Save', 'primary block', function () {
      var time = padTime(inp(fTime).value.trim()) || inp(fTime).value.trim(), notes = inp(fNotes).value.trim();
      if (picked && picked.s) {
        var s = picked.s, r = picked.r, o = {};
        if ((r.v[s.date] || '') !== date) o[s.date] = date;
        if ((r.v[s.time] || '') !== time) o[s.time] = time;
        if (Object.keys(o).length) change(s.sheet, r, o);
        var a = { Date: date, Part: fixedPart(s, r.v) || (time ? partOf(time) : FREE.indexOf(p.id) >= 0 ? p.id : 'Evening') };
        if (notes) a.Notes = notes;
        setAuto(s, r, a);
        done(); toast(a.Part !== p.id && !(time && FREE.indexOf(p.id) >= 0 && partOf(time) === p.id) ? 'Saved in ' + part(a.Part).label + (time ? ' (by its hour)' : '') : 'Saved');
        return;
      }
      var now = { 'Name': inp(fName).value.trim(), 'Time': time, 'Map link': inp(fMap).value.trim(), 'Website': inp(fWeb).value.trim(), 'Notes': notes }, out = {};
      if (!now.Name) { toast('Give it a name, or pick one from the list'); return; }
      Object.keys(now).forEach(function (k) { if (now[k] !== (v[k] || '')) out[k] = now[k]; });
      if (!rec) { out.Date = date; out.Part = time && FREE.indexOf(p.id) >= 0 ? partOf(time) : p.id; out.Type = 'Own'; Object.keys(out).forEach(function (k) { if (out[k] === '') delete out[k]; }); change('Itinerary', null, out); }
      else if (Object.keys(out).length) change('Itinerary', rec, out);
      done(); toast('Saved');
    }));
    nodes.push(btn('Cancel', 'block', done));
    if (rec) nodes.push(btn('Remove from this day', 'danger block', function () { change('Itinerary', rec, null, true); done(); toast('Removed'); }));
    openSheet(nodes, 'form');
  }
  // an item that comes from Places, Food, Attractions… : its hour lives there; notes and the part of the day live here
  function autoForm(day, p, rec, from, done) {
    var s = from.s, r = from.r, t = byId(s.tab), v = rec.v;
    var fTime = field(s.sheet, col(s.sheet, s.time) || { h: s.time, k: 'time' }, padTime(r.v[s.time]) || r.v[s.time] || '');
    fTime.querySelector('label').textContent = 'Hour';
    var fNotes = field('Itinerary', col('Itinerary', 'Notes'), v.Notes || '');
    function inp(f) { return f.querySelector('[data-h]'); }
    var nodes = [h('h2', { class: 'withico', dir: 'auto' }, [icon(p.icon), v.Name || '(no name)']),
      h('p', { class: 'note', text: fmtDate(day.v.Date) + ' · from ' + t.label + '. Its day and hour are kept in ' + t.label + '.' }), fTime, fNotes];
    var links = [linkBtn('Map', v['Map link']), linkBtn('Web', v.Website)].filter(Boolean);
    if (links.length) nodes.splice(2, 0, h('div', { class: 'rowl' }, links));
    nodes.push(btn('Save', 'primary block', function () {
      var time = padTime(inp(fTime).value.trim()) || inp(fTime).value.trim(), notes = inp(fNotes).value.trim();
      if (time !== (r.v[s.time] || '')) { var o = {}; o[s.time] = time; change(s.sheet, r, o); }
      if (notes !== (v.Notes || '')) setAuto(s, r, { Notes: notes });
      done(); toast('Saved');
    }));
    nodes.push(btn('Open in ' + t.label, 'block', function () { editFields(s.sheet, r, null, t.label + ' · ' + (v.Name || ''), null, done); }));
    nodes.push(btn('Cancel', 'block', done));
    nodes.push(btn('Remove from this day', 'danger block', function () {
      var o = {}; o[s.date] = ''; o[s.time] = '';
      change(s.sheet, r, o); done(); toast('Removed from the day. It stays in ' + t.label + '.');
    }));
    openSheet(nodes, 'form');
  }

  // ------------------------------------------------------------------ hotels of a day
  // End hotel = "Sleeping at". Start hotel = chosen for the day, else last night's hotel. Hotels with dates fill both by themselves.
  function hotelRows() { return (S.data.sheets.Hotels || []).filter(function (r) { return r.v['Hotel name']; }); }
  function hotelRow(name) { return hotelRows().filter(function (r) { return r.v['Hotel name'] === name; })[0] || null; }
  function hotelMap(name) { var r = hotelRow(name); return r ? cleanUrl(r.v['Map link'] || '') : ''; }
  function datedHotel(date, which) {              // the hotel whose check-in / check-out dates cover this day, if any
    var hit = '';
    hotelRows().forEach(function (r) {
      var ci = r.v['Check-in'] || '', co = r.v['Check-out'] || '';
      if (hit || !ISO.test(ci) || !ISO.test(co) || co <= ci) return;
      if (which === 'end' ? ci <= date && date < co : ci < date && date <= co) hit = r.v['Hotel name'];
    });
    return hit;
  }
  function startHotel(list, idx) {
    var own = list[idx].v['Start hotel'];
    if (own) return { name: own, auto: false };
    var prev = idx > 0 ? list[idx - 1].v['End hotel'] : '';
    return prev ? { name: prev, auto: true } : null;
  }
  // a hotel holds for the following days too, until a day that has another one
  function carryHotel(list, idx, oldName, now) {
    var filled = 0;
    for (var i = idx + 1; now && i < list.length; i++) {
      var dv = list[i].v, cur = dv['End hotel'] || '';
      if (datedHotel(dv.Date, 'end')) break;
      if (!cur || (oldName && cur === oldName)) { if (cur !== now) change('Days', list[i], { 'End hotel': now }); filled++; }
      else break;
    }
    return filled;
  }
  // Starts in / Start hotel / Ends in / End hotel, each hotel with its Google Maps link
  function cityForm(list, idx) {
    var d = list[idx], v = d.v, date = v.Date, prev = idx > 0 ? list[idx - 1].v : {};
    var startGuess = v['Starts in'] || prev['Ends in'] || prev['Starts in'] || '';
    var fStart = field('Days', col('Days', 'Starts in'), v['Starts in'] || startGuess);
    var fEnd = field('Days', col('Days', 'Ends in'), v['Ends in'] || v['Starts in'] || startGuess);
    var sh = startHotel(list, idx), eh = v['End hotel'] || '', lastNight = prev['End hotel'] || '';
    var lockS = datedHotel(date, 'start'), lockE = datedHotel(date, 'end');
    var names = hotelRows().map(function (r) { return r.v['Hotel name']; });
    [sh && sh.name, eh].forEach(function (n) { if (n && names.indexOf(n) < 0) names.push(n); });
    function hotelField(id, label, cur, lock) {
      var sel = h('select', { id: id, disabled: !!lock }, [h('option', { value: '', text: '— not set —' })].concat(names.map(function (n) { return h('option', { value: n, text: n }); })));
      sel.value = cur || '';
      var a = h('a', { class: 'open', target: '_blank', rel: 'noopener', text: 'Open in Google Maps' }), none = h('span', { class: 'note', text: 'This hotel has no Map link in the Hotels tab.' });
      function upd() { var m = sel.value ? hotelMap(sel.value) : ''; a.hidden = !m; none.hidden = !sel.value || !!m; if (m) a.href = m; }
      sel.addEventListener('change', guard(upd)); upd();
      return { el: h('div', { class: 'field' }, [h('label', { for: id, text: label }), sel, lock ? h('span', { class: 'note', text: 'Set by its check-in / check-out dates in Hotels.' }) : null, a, none]), sel: sel };
    }
    var fSH = hotelField('starthotel', 'Start hotel' + (sh && sh.auto ? ' (last night\'s)' : ''), sh ? sh.name : '', lockS);
    var fEH = hotelField('endhotel', 'End hotel (Sleeping at)', eh, lockE);
    function val(f) { var el = f.querySelector('[data-h]'); return el && el.value !== '\u0001new' ? el.value.trim() : ''; }
    var nodes = [h('h2', { text: fmtDate(date) + ' · Start and end' }), fStart, fSH.el, fEnd, fEH.el];
    if (!hotelRows().length) nodes.push(h('p', { class: 'note warn', text: 'The hotel lists come from the Hotels tab. Add your hotels there first.' }));
    nodes.push(btn('Save', 'primary block', function () {
      var out = {}, st = val(fStart), en = val(fEnd) || st, filled = 0;
      if (st !== (v['Starts in'] || '')) out['Starts in'] = st;
      if (en !== (v['Ends in'] || '')) out['Ends in'] = en;
      if (!lockS) { var s2 = fSH.sel.value, want = s2 && s2 !== lastNight ? s2 : ''; if (want !== (v['Start hotel'] || '')) out['Start hotel'] = want; }   // same as last night's: nothing to store
      if (!lockE && fEH.sel.value !== eh) { out['End hotel'] = fEH.sel.value; filled = carryHotel(list, idx, eh, fEH.sel.value); }
      if (Object.keys(out).length) change('Days', d, out);
      closeSheet(); toast(filled ? 'Saved; the hotel also fills the ' + filled + ' day(s) after it' : 'Saved');
    }));
    nodes.push(btn('Cancel', 'block', closeSheet));
    openSheet(nodes, 'form');
  }
  function pickDay(list) {
    openSheet([h('h2', { text: 'Choose a day' }), h('div', { class: 'grid4' }, list.map(function (d, i) {
      var p = fmtDate(d.v.Date).split(' ');
      return h('button', { type: 'button', class: 'daybtn' + (i === S.day ? ' on' : ''), onclick: function () { S.day = i; set('jp_day', i); closeSheet(); render(); } }, [h('span', { text: p[0] || '' }), h('b', { text: p[1] || String(i + 1) }), h('span', { text: p[2] || '' })]);
    })), btn('Close', 'block', closeSheet)]);
  }

  // ------------------------------------------------------------------ Itinerary: every day, its items by hour
  function itinView() {
    var list = days();
    if (!list.length) return [h('p', { class: 'empty', text: S.base ? 'The Days tab was not found in the Google Sheet.' : 'Loading…' })];
    var out = list.map(function (d, i) {
      var v = d.v, items = dayItems(v.Date), back = function () { closeSheet(); render(); };
      var cities = v['Starts in'] && v['Ends in'] && v['Starts in'] !== v['Ends in'] ? v['Starts in'] + ' → ' + v['Ends in'] : v['Starts in'] || v['Ends in'] || '';
      var head = h('button', { type: 'button', class: 'ihead', onclick: function () { S.day = i; set('jp_day', i); go('days'); } }, [
        h('span', { class: 'idate' }, [h('b', { text: fmtDate(v.Date) }), h('span', { text: 'Day ' + (v.Day || i + 1) })]),
        h('span', { class: 'icity', dir: 'auto', text: cities })]);
      var kids = [head];
      if (v['End hotel']) kids.push(h('div', { class: 'ihotel', dir: 'auto' }, [icon('hotels'), h('span', { text: v['End hotel'] })]));
      if (items.length) kids = kids.concat(items.map(function (r) { return itemRow(d, r, back, true); }));
      else kids.push(h('p', { class: 'inone', text: 'Nothing planned yet. Tap the day to plan it.' }));
      return h('section', { class: 'iday' + (v.Date === today() ? ' now' : ''), id: 'iday-' + i }, kids);
    });
    out.push(h('div', { class: 'spacer' }));
    return out;
  }

  // ------------------------------------------------------------------ Expenses
  var CUR_SIGN = { JPY: '¥', USD: '$', ILS: '₪', EUR: '€' }, CUR_ORDER = ['JPY', 'USD', 'ILS', 'EUR'];
  function money(n, c) { return CUR_SIGN[c] ? CUR_SIGN[c] + fmtNum(Math.round(n * 100) / 100) : fmtNum(Math.round(n * 100) / 100) + ' ' + (c || ''); }
  function sumByCur(rows) {                       // "¥12,300 + $40": each currency on its own, no exchange rates
    var by = {};
    rows.forEach(function (r) { var p = parseFloat(String(r.v.Price || '').replace(/,/g, '')); if (!isNaN(p)) { var c = r.v.Currency || 'JPY'; by[c] = (by[c] || 0) + p; } });
    return Object.keys(by).sort(function (a, b) { return (CUR_ORDER.indexOf(a) + 1 || 99) - (CUR_ORDER.indexOf(b) + 1 || 99); }).map(function (c) { return money(by[c], c); }).join(' + ');
  }
  function expenses() { return (S.data.sheets.Expenses || []).slice(); }
  function expensesOn(date) { return expenses().filter(function (r) { return r.v.Date === date; }); }
  function expCat(v) { return v.Category === 'Other' && v['Other category'] ? v['Other category'] : v.Category || ''; }
  function expFilter() { return S.filters.expenses = S.filters.expenses || { mode: 'trip' }; }
  function nowTime() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dayCity(date) {                        // the city of that day, for a new expense
    var d = days().filter(function (x) { return x.v.Date === date; })[0];
    return d ? d.v['Ends in'] || d.v['Starts in'] || '' : '';
  }
  function expensesView() {
    var t = byId('expenses'), f = expFilter(), all = expenses(), dates = S.data.tripDates || [];
    function opts(label, vals, cur, key) {
      var sel = h('select', { class: 'fsel' + (cur ? ' on' : ''), 'aria-label': label, onchange: function () { f[key] = this.value; render(); } },
        [h('option', { value: '', text: label })].concat(vals.map(function (o) { return h('option', { value: o, text: o }); })));
      sel.value = cur || ''; return sel;
    }
    var cats = {}, cities = {};
    all.forEach(function (r) { var c = expCat(r.v); if (c) cats[c] = 1; if (r.v.City) cities[r.v.City] = 1; });
    if (f.cat && !cats[f.cat]) f.cat = ''; if (f.city && !cities[f.city]) f.city = '';
    function dateSel(key, label) {
      var sel = h('select', { class: 'fsel on', 'aria-label': label, onchange: function () { f[key] = this.value; render(); } }, dates.map(function (d) { return h('option', { value: d, text: fmtDate(d) }); }));
      if (!f[key] || dates.indexOf(f[key]) < 0) f[key] = dates.indexOf(today()) >= 0 ? today() : (key === 'to' ? dates[dates.length - 1] : dates[0]) || '';
      sel.value = f[key]; return sel;
    }
    var modes = h('div', { class: 'seg' }, [['day', 'One day'], ['range', 'Days range'], ['trip', 'Whole trip']].map(function (m) {
      return h('button', { type: 'button', class: 'segb' + (f.mode === m[0] ? ' on' : ''), onclick: function () { f.mode = m[0]; render(); } }, [m[1]]);
    }));
    var body = [h('div', { class: 'filters' }, [opts('All categories', Object.keys(cats).sort(), f.cat, 'cat'), opts('All places', Object.keys(cities).sort(), f.city, 'city')]), modes];
    if (f.mode === 'day' && dates.length) body.push(h('div', { class: 'filters' }, [dateSel('day', 'Day')]));
    if (f.mode === 'range' && dates.length) body.push(h('div', { class: 'filters' }, [h('span', { class: 'flab', text: 'From' }), dateSel('from', 'From'), h('span', { class: 'flab', text: 'to' }), dateSel('to', 'To')]));
    var rows = all.filter(function (r) {
      var v = r.v;
      if (f.cat && expCat(v) !== f.cat) return false;
      if (f.city && v.City !== f.city) return false;
      if (f.mode === 'day' && v.Date !== f.day) return false;
      if (f.mode === 'range' && (!v.Date || v.Date < (f.from <= f.to ? f.from : f.to) || v.Date > (f.from <= f.to ? f.to : f.from))) return false;
      return true;
    }).sort(function (a, b) { var x = (a.v.Date || '') + (a.v.Time || ''), y = (b.v.Date || '') + (b.v.Time || ''); return x < y ? 1 : x > y ? -1 : 0; });
    body.push(h('div', { class: 'expsum' }, [h('span', { class: 'l', text: rows.length + (rows.length === 1 ? ' expense' : ' expenses') }), h('b', { text: sumByCur(rows) || '—' })]));
    if (!all.length) body.push(h('p', { class: 'empty', text: S.base ? 'No expenses yet. Tap + to add the first one.' : 'Loading…' }));
    else if (!rows.length) body.push(h('p', { class: 'empty', text: 'Nothing matches these filters.' }));
    rows.forEach(function (r) {
      var v = r.v, sub = [v.Date ? fmtDate(v.Date) + (v.Time ? ' ' + v.Time : '') : '', expCat(v), [v.City, v.Place].filter(Boolean).join(', '), v['Paid by']].filter(Boolean).join(' · ');
      var right = [h('span', { class: 'amt', text: v.Price ? money(parseFloat(String(v.Price).replace(/,/g, '')) || 0, v.Currency || 'JPY') : '' })];
      if (r.wait) right.push(h('span', { class: 'waitdot', title: 'Waiting to be saved', text: '●' }));
      body.push(h('div', { class: 'card' }, [h('button', { type: 'button', class: 'cbody', onclick: function () { expenseForm(r); } }, [h('span', { class: 'ctitle', dir: 'auto', text: v.Name || expCat(v) || '(no name)' }), h('span', { class: 'csub', dir: 'auto', text: sub })]), h('div', { class: 'cright' }, right)]));
    });
    body.push(h('div', { class: 'spacer' }));
    return frame(t.label, body, h('button', { type: 'button', class: 'fab', 'aria-label': 'Add expense', onclick: function () { expenseForm(null, null); } }, [icon('plus')]));
  }
  // rec = an expense to change, or null for a new one; date = the day on screen (null = now)
  function expenseForm(rec, date) {
    var v = rec ? rec.v : {}, sheet = 'Expenses';
    var when = rec ? '' : (date || today());
    var fName = field(sheet, col(sheet, 'Name'), v.Name || '');
    var fCat = field(sheet, col(sheet, 'Category'), v.Category || '');
    var fOther = field(sheet, col(sheet, 'Other category'), v['Other category'] || '');
    fOther.querySelector('label').textContent = 'Your category';
    var catSel = fCat.querySelector('select');
    function showOther() { var c = fCat.querySelector('[data-h]'); fOther.hidden = !(c && c.value === 'Other'); }
    if (catSel) catSel.addEventListener('change', guard(showOther));
    var price = h('input', { id: 'f_Price', 'data-h': 'Price', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' }); price.value = v.Price || '';
    var curs = CUR_ORDER.slice(); (S.data.lists.L_Currency || []).concat(v.Currency ? [v.Currency] : []).forEach(function (c) { if (curs.indexOf(c) < 0) curs.push(c); });
    var cur = h('select', { id: 'f_Currency', 'aria-label': 'Currency' }, curs.map(function (c) { return h('option', { value: c, text: (CUR_SIGN[c] ? CUR_SIGN[c] + ' ' : '') + c }); }));
    cur.value = v.Currency || get('jp_lastCur', 'JPY') || 'JPY';
    var fPrice = h('div', { class: 'field' }, [h('label', { for: 'f_Price', text: 'Price' }), h('div', { class: 'pricerow' }, [price, cur])]);
    var fPaid = field(sheet, col(sheet, 'Paid by'), rec ? v['Paid by'] || '' : get('jp_who', ''));
    var fCity = field(sheet, col(sheet, 'City'), rec ? v.City || '' : dayCity(when) || get('jp_lastCity', ''));
    var fPlace = field(sheet, col(sheet, 'Place'), v.Place || '');
    fCity.querySelector('label').textContent = 'Location'; fPlace.querySelector('label').textContent = 'Place (optional)';
    var loc = h('div', { class: 'locrow' }, [fCity, fPlace]);
    var nodes = [h('h2', { class: 'withico' }, [icon('expenses'), rec ? 'Expense' : 'Add expense · ' + fmtDate(when)]), fName, fCat, fOther, fPrice, fPaid, loc];
    var fDate, fTime;
    if (rec) { fDate = field(sheet, col(sheet, 'Date'), v.Date || ''); fTime = field(sheet, col(sheet, 'Time'), v.Time || ''); nodes.push(h('div', { class: 'locrow' }, [fDate, fTime])); }
    else nodes.push(h('p', { class: 'note', text: 'Date and time: ' + fmtDate(when) + ', the hour when you press Save.' }));
    function val(f) { var el = f.querySelector('[data-h]'); return el && el.value !== '\u0001new' ? el.value.trim() : ''; }
    nodes.push(btn('Save', 'primary block', function () {
      var p = price.value.trim().replace(/,/g, '').replace(/[^\d.]/g, '');
      if (!p || isNaN(parseFloat(p))) { toast('Enter the price'); price.focus(); return; }
      var now = { 'Name': val(fName), 'Category': val(fCat), 'Other category': val(fCat) === 'Other' ? val(fOther) : '', 'Price': String(parseFloat(p)), 'Currency': cur.value,
        'Paid by': val(fPaid), 'City': val(fCity), 'Place': val(fPlace) };
      if (rec) { now.Date = val(fDate); now.Time = val(fTime); } else { now.Date = when; now.Time = nowTime(); }
      var out = {};
      Object.keys(now).forEach(function (k) { if (now[k] !== (v[k] || '')) out[k] = now[k]; });
      set('jp_lastCur', cur.value); if (now.City) set('jp_lastCity', now.City);
      if (!rec) { Object.keys(out).forEach(function (k) { if (out[k] === '') delete out[k]; }); change(sheet, null, out); }
      else if (Object.keys(out).length) change(sheet, rec, out);
      closeSheet(); toast('Saved');
    }));
    nodes.push(btn('Cancel', 'block', closeSheet));
    if (rec) nodes.push(btn('Delete this expense', 'danger block', function () {
      openSheet([h('h2', { text: 'Delete this expense?' }), h('p', { text: (v.Name || expCat(v) || 'Expense') + (v.Price ? ' · ' + money(parseFloat(v.Price) || 0, v.Currency || 'JPY') : '') }),
        btn('Yes, delete', 'danger block', function () { closeSheet(); change(sheet, rec, null, true); toast('Deleted'); }), btn('No, keep it', 'block', closeSheet)]);
    }));
    openSheet(nodes, 'form');
    showOther();
  }

  // ------------------------------------------------------------------ lists (every other section)
  function listView(t) {
    var sheet = t.sheet, rows = (S.data.sheets[sheet] || []).slice(), f = S.filters[t.id] = S.filters[t.id] || {};
    var filters = (t.filters || []).map(function (field) {
      var vals = {}; rows.forEach(function (r) { if (r.v[field]) vals[r.v[field]] = 1; });
      var opts = Object.keys(vals).sort();
      if (f[field] && !vals[f[field]]) delete f[field];
      if (!opts.length) return null;
      var sel = h('select', { class: 'fsel' + (f[field] ? ' on' : ''), 'aria-label': 'Filter by ' + field, onchange: function () { f[field] = this.value; render(); } },
        [h('option', { value: '', text: field + ': all' })].concat(opts.map(function (o) { return h('option', { value: o, text: shown(sheet, field, o) }); })));
      sel.value = f[field] || ''; return sel;
    }).filter(Boolean);
    var showRows = rows.filter(function (r) { return Object.keys(f).every(function (k) { return !f[k] || r.v[k] === f[k]; }); });
    var body = [];
    if (t.totals) body.push(totals(rows));
    if (t.paste) body.push(btn('Paste a link or text', 'block', pasteIdea));
    if (filters.length) body.push(h('div', { class: 'filters' }, filters));
    if (!rows.length) body.push(h('p', { class: 'empty', text: S.base ? 'Nothing here yet. Tap + to add the first one.' : 'Loading…' }));
    else if (!showRows.length) body.push(h('p', { class: 'empty', text: 'Nothing matches these filters.' }));
    showRows.forEach(function (r) { body.push(card(t, r)); });
    body.push(h('div', { class: 'spacer' }));
    var fab = h('button', { type: 'button', class: 'fab', 'aria-label': 'Add to ' + t.label, onclick: function () { editFields(sheet, null, null, 'Add to ' + t.label, f); } }, [icon('plus')]);
    return frame(t.label, body, fab);
  }
  function card(t, r) {
    var v = r.v, sheet = t.sheet;
    var title = t.title.map(function (x) { return v[x] || ''; }).filter(Boolean).join(t.sep || ' ') || '(no name)';
    var sub = t.sub.map(function (x) { return v[x] ? shown(sheet, x, v[x]) : ''; }).filter(Boolean).join(' · ');
    var kids = [], done = t.toggle && v[t.toggle[0]] === t.toggle[1];
    if (t.toggle) kids.push(h('button', { type: 'button', class: 'tick' + (done ? ' on' : ''), 'aria-label': t.toggle[0] + ' ' + title, 'aria-pressed': done ? 'true' : 'false',
      onclick: function (ev) { ev.stopPropagation(); var o = {}; o[t.toggle[0]] = done ? t.toggle[2] : t.toggle[1]; change(sheet, r, o); } }, [icon('check')]));
    var mid = [h('span', { class: 'ctitle', dir: 'auto', text: title })];
    if (sub) mid.push(h('span', { class: 'csub' + (t.big ? ' bigsub' : ''), dir: 'auto', text: sub }));
    kids.push(h('button', { type: 'button', class: 'cbody', onclick: function () { editFields(sheet, r, null, title); } }, mid));
    var right = [];
    if (t.amount) { var amt = v[t.amount[0]] || v[t.amount[1]]; if (amt) right.push(h('span', { class: 'amt', text: fmtNum(amt) + ' ' + (v[t.amount[2]] || '') })); }
    if (t.badge && v[t.badge]) right.push(h('span', { class: 'badge b-' + v[t.badge].toLowerCase().replace(/[^a-z]+/g, '-'), text: v[t.badge] }));
    if (r.wait) right.push(h('span', { class: 'waitdot', title: 'Waiting to be saved', text: '●' }));
    if (S.fresh[r.id]) right.unshift(h('span', { class: 'badge b-new', text: 'New' }));
    if (right.length) kids.push(h('div', { class: 'cright' }, right));
    return h('div', { class: 'card' + (done ? ' done' : '') + (S.fresh[r.id] ? ' fresh' : '') }, kids);
  }
  function fmtNum(x) { var n = parseFloat(x); return isNaN(n) ? x : n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function totals(rows) {
    var by = {};
    rows.forEach(function (r) { var c = r.v.Currency || '?'; by[c] = by[c] || { p: 0, a: 0 }; by[c].p += parseFloat(r.v['Planned amount']) || 0; by[c].a += parseFloat(r.v['Actual amount']) || 0; });
    var keys = Object.keys(by);
    if (!keys.length) return null;
    return h('div', { class: 'totals' }, [h('div', { class: 'trow thead' }, [h('span', { text: 'Currency' }), h('span', { text: 'Planned' }), h('span', { text: 'Actual' })])].concat(
      keys.map(function (k) { return h('div', { class: 'trow' }, [h('b', { text: k }), h('span', { text: fmtNum(by[k].p) }), h('span', { text: fmtNum(by[k].a) })]); })));
  }

  // ------------------------------------------------------------------ the edit form
  function options(sheet, c) {
    if (c.list === 'L_TripDates') return (S.data.tripDates || []).map(function (d) { return [d, fmtDate(d)]; });
    var out = (S.data.lists[c.list] || []).slice(), seen = {};
    out.forEach(function (x) { seen[x] = 1; });
    if (c.soft) Object.keys(S.data.sheets).forEach(function (sn) {   // values already typed anywhere in the same kind of column
      def(sn).cols.forEach(function (c2) { if (c2.list === c.list) (S.data.sheets[sn] || []).forEach(function (r) { var x = r.v[c2.h]; if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); });
    });
    return out.map(function (x) { return [x, x]; });
  }
  function field(sheet, c, val) {
    var id = 'f_' + c.h.replace(/[^A-Za-z0-9]+/g, '_'), input;
    if (c.k === 'list') {
      var opts = options(sheet, c);
      if (val && !opts.some(function (o) { return o[0] === val; })) opts.push([val, shown(sheet, c.h, val)]);
      input = h('select', { id: id, 'data-h': c.h }, [h('option', { value: '', text: '—' })].concat(opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }),
        c.list !== 'L_TripDates' ? [h('option', { value: '\u0001new', text: '+ Type a new one…' })] : []));
      input.value = val || '';
      input.addEventListener('change', guard(function () {
        if (this.value !== '\u0001new') return;
        var txt = h('input', { id: id, 'data-h': c.h, type: 'text', dir: 'auto', placeholder: 'Type here', autocomplete: 'off' });
        this.parentNode.replaceChild(txt, this); txt.focus();
      }));
    } else if (c.k === 'wrap') { input = h('textarea', { id: id, 'data-h': c.h, rows: '4', dir: 'auto' }); input.value = val || ''; }
    else {
      var type = c.k === 'date' ? 'date' : c.k === 'time' ? 'time' : 'text', a = { id: id, 'data-h': c.h, type: type, autocomplete: 'off' };
      if (c.k === 'money' || c.k === 'num' || c.k === 'int') a.inputmode = 'decimal';
      if (c.k === 'link') { a.inputmode = 'url'; a.autocapitalize = 'off'; }
      if (type === 'text') a.dir = 'auto';
      if ((c.k === 'date' && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) || (c.k === 'time' && val && !/^\d{2}:\d{2}$/.test(val))) a.type = 'text';   // Excel holds free text here: keep it editable
      input = h('input', a); input.value = val || '';
    }
    var parts = [h('label', { for: id, text: c.h }), input];
    if (c.k === 'link' && /^https?:\/\//i.test(val || '')) parts.push(h('a', { class: 'open', href: val, target: '_blank', rel: 'noopener', text: 'Open link' }));
    return h('div', { class: 'field' }, parts);
  }
  // rec = null for a new record; only = list of fields to show (null = all)
  function editFields(sheet, rec, only, title, preset, after) {
    var d = def(sheet), v = rec ? rec.v : {}, fields = [];
    d.cols.forEach(function (c) {
      if (c.k === 'auto' || (d.fixed && d.fixed.indexOf(c.h) >= 0)) return;
      if (only && only.indexOf(c.h) < 0) return;
      var start = v[c.h] || '';
      if (preset && preset[c.h] && !start) start = preset[c.h];
      fields.push(field(sheet, c, start));
    });
    function collect() {
      var out = {}, any = false;
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-h]'), function (el) {
        var hh = el.getAttribute('data-h'), val = (el.value === '\u0001new' ? '' : el.value || '').trim();
        if (val !== (v[hh] || '')) out[hh] = val;
        if (val) any = true;
      });
      return { out: out, any: any };
    }
    var nodes = [h('h2', { text: title, dir: 'auto' })].concat(fields);
    nodes.push(btn('Save', 'primary block', function () {
      var c = collect();
      if (!rec && !c.any) { toast('Fill at least one field'); return; }
      if (sheet === 'Ideas' && !('Idea' in c.out ? c.out.Idea : v.Idea || '')) { toast('Give the idea a name first'); return; }
      if (sheet === 'Apps') sortAppLinks(v, c.out);
      if (sheet === 'Days') {                       // a day with only a start city ends in the same city
        var st = 'Starts in' in c.out ? c.out['Starts in'] : v['Starts in'] || '', en = 'Ends in' in c.out ? c.out['Ends in'] : v['Ends in'] || '';
        if (st && !en) c.out['Ends in'] = st;
      }
      closeSheet();
      if (Object.keys(c.out).length) { change(sheet, rec, c.out); toast('Saved'); }
      if (after) after();
    }));
    if (sheet === 'Ideas' && rec && !only) nodes.push(btn('Move to a section…', 'block', function () { moveIdea(rec); }));
    nodes.push(btn('Cancel', 'block', closeSheet));
    if (rec && !only && !d.fixed) nodes.push(btn('Delete this item', 'danger block', function () {
      openSheet([h('h2', { text: 'Delete this item?' }), h('p', { text: 'It will be removed for both of you.' }),
        btn('Yes, delete', 'danger block', function () { closeSheet(); change(sheet, rec, null, true); toast('Deleted'); }), btn('No, keep it', 'block', closeSheet)]);
    }));
    openSheet(nodes, 'form');
    if (only && only.length === 1) { var first = overlay.querySelector('[data-h]'); if (first && first.tagName !== 'SELECT') first.focus(); }
  }

  // ------------------------------------------------------------------ Ideas inbox: share, paste, move
  // a shared item is a name, a link, or both
  function parseShare(title, text, url) {
    var all = [title, text, url].filter(Boolean).join('\n'), m = /https?:\/\/\S+/.exec(url || '') || /https?:\/\/\S+/.exec(all), link = m ? cleanUrl(m[0]) : '';
    var idea = all.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title && text && idea.indexOf(title + ' ' + title) === 0) idea = idea.slice(title.length + 1);
    idea = cleanName(idea);
    return idea || link ? { idea: idea, link: link } : null;
  }
  // words that apps put around a shared name ("בדוק את …", "Check out …", "… on Google Play"), and the old "(instagram.com)" placeholder
  function cleanName(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (/^\([^()]*\)$/.test(s)) return '';
    s = s.replace(/^(check (this )?out|look at|בדוק את|בדקי את|בדקו את|תבדוק את|תבדקי את|כדאי לבדוק את)\s*[:\-–]?\s*/i, '');
    s = s.replace(/\s*(on|in|at) (the )?(Google Play|App Store)( Store)?\s*[!.]?$/i, '').replace(/\s*ב-?\s?(Google Play|App Store)\s*[!.]?$/, '');
    return s.replace(/^["'“”„׳״]+|["'“”„׳״]+$/g, '').trim();
  }
  // which Apps column a link belongs in
  function appLinkCol(u) {
    var hst = host(u).toLowerCase();
    if (/(^|\.)play\.google\.com$/.test(hst)) return 'Android download';
    if (/(^|\.)(apps|itunes)\.apple\.com$/.test(hst)) return 'iPhone download';
    return 'Other link';
  }
  function sortAppLinks(v, out) {                 // put every link of an app into the column its address belongs to
    var cols = ['iPhone download', 'Android download', 'Other link'], now = {}, put = {};
    cols.forEach(function (k) { now[k] = k in out ? out[k] : v[k] || ''; put[k] = ''; });
    cols.forEach(function (k) { var u = now[k]; if (!u) return; var to = appLinkCol(u); if (put[to]) to = put['Other link'] ? null : 'Other link'; if (to) put[to] = u; });
    cols.forEach(function (k) { if (put[k] !== (v[k] || '')) out[k] = put[k]; else delete out[k]; });
  }
  function linkColFor(sheet, u) {
    if (sheet === 'Apps') return appLinkCol(u);
    if (sheet === 'Hotels') return isMap(u) ? 'Map link' : 'Booking link';
    var c = def(sheet).cols.filter(function (x) { return x.k === 'link'; })[0];
    return c ? c.h : null;
  }
  // new ideas that reached the sheet from elsewhere (the iPhone shortcut): open Ideas, mark them, ask for a missing name
  function markSeen(ids) { var s = get('jp_seenIdeas', []) || []; set('jp_seenIdeas', s.concat(ids).slice(-3000)); }
  function checkIdeas() {
    if (S.mode !== 'sheet' || !S.data) return;
    var rows = S.data.sheets.Ideas || [], seen = get('jp_seenIdeas', null), who = get('jp_who', '');
    rows.forEach(function (r) {                   // tidy names and links saved before these rules existed
      var o = {}, nm = cleanName(r.v.Idea), ln = cleanUrl(r.v.Link);
      if (nm !== (r.v.Idea || '')) o.Idea = nm;
      if (ln !== (r.v.Link || '')) o.Link = ln;
      if (Object.keys(o).length) change('Ideas', r, o);
    });
    if (!seen) { markSeen(rows.map(function (r) { return r.id; })); return; }   // first time on this phone: nothing is "new"
    var have = {}; seen.forEach(function (id) { have[id] = 1; });
    var fresh = rows.filter(function (r) { return !have[r.id]; });
    if (!fresh.length) return;
    markSeen(fresh.map(function (r) { return r.id; }));
    var mine = fresh.filter(function (r) { return (r.v['Added by'] || '') === who; });   // the other phone's ideas are not announced
    if (!mine.length) return;
    mine.forEach(function (r) { S.fresh[r.id] = 1; });
    if (!overlay.hidden) { toast(mine.length + ' new idea' + (mine.length > 1 ? 's' : '') + ' in Ideas'); return; }
    S.tab = 'ideas'; S.view = 'main'; set('jp_tab', 'ideas'); render();
    var unnamed = mine.filter(function (r) { return !cleanName(r.v.Idea); })[0];
    if (unnamed) {
      var ask = function (pre) { nameForm(unnamed.v.Link || '', function (name) { change('Ideas', unnamed, { Idea: name }); toast('Saved'); }, null, pre); };
      if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(unnamed.v.Link || '')) Api.resolve(unnamed.v.Link).then(ask, function () { ask(''); }); else ask('');
    }
    else toast(mine.length > 1 ? mine.length + ' new ideas saved' : 'Saved to Ideas: ' + mine[0].v.Idea);
  }
  // the name is required before the idea is saved
  function nameForm(link, onSave, onCancel, prefill) {
    var inp = h('input', { type: 'text', id: 'ideaname', dir: 'auto', autocomplete: 'off', placeholder: 'For example: Ramen place in Shibuya' });
    if (prefill) inp.value = prefill;
    var nodes = [h('h2', { text: 'Name this idea' })];
    if (link) nodes.push(h('div', { class: 'field' }, [h('label', { text: 'Link' }), h('a', { class: 'open', href: link, target: '_blank', rel: 'noopener', text: host(link) + ' (open)' })]));
    nodes.push(h('div', { class: 'field' }, [h('label', { for: 'ideaname', text: 'Name' }), inp]));
    nodes.push(btn('Save', 'primary block', function () { var n = cleanName(inp.value); if (!n) { toast('Type a name first'); inp.focus(); return; } closeSheet(); onSave(n); }));
    nodes.push(btn('Cancel', 'block', function () { closeSheet(); if (onCancel) onCancel(); }));
    openSheet(nodes, 'form'); inp.focus();
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addIdea(x) {
    if (!x.idea) {                                // no name: ask first, save after
      var ask = function (pre) { nameForm(x.link, function (n) { addIdea({ idea: n, link: x.link }); }, null, pre); };
      if (S.mode === 'sheet' && /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(x.link || '')) { toast('Reading the place name…'); return Api.resolve(x.link).then(ask, function () { ask(''); }); }
      ask(''); return;
    }
    var v = { 'Idea': x.idea, 'Added': today() };
    if (x.link) v.Link = x.link;
    if (get('jp_who', '')) v['Added by'] = get('jp_who', '');
    S.tab = 'ideas'; S.view = 'main'; set('jp_tab', 'ideas');
    var rid = change('Ideas', null, v); S.fresh[rid] = 1; render(); toast('Added to Ideas');
  }
  function pasteIdea() {
    function manual() {                           // the phone did not hand over the clipboard: paste by hand
      var ta = h('textarea', { id: 'pastebox', rows: '4', dir: 'auto', placeholder: 'Press and hold here, then Paste' });
      openSheet([h('h2', { text: 'Paste a link or text' }), h('div', { class: 'field' }, [h('label', { for: 'pastebox', text: 'What you copied' }), ta]),
        btn('Add to Ideas', 'primary block', function () { var x = parseShare('', ta.value, ''); if (!x) { toast('Nothing to add'); return; } closeSheet(); addIdea(x); }),
        btn('Cancel', 'block', closeSheet)], 'form');
      ta.focus();
    }
    if (!navigator.clipboard || !navigator.clipboard.readText) return manual();
    return navigator.clipboard.readText().then(function (t) { var x = parseShare('', t, ''); if (x) addIdea(x); else manual(); }, manual);
  }
  function moveIdea(rec) {
    var v = rec.v, name = cleanName(v.Idea), guess = /hotel|ryokan|hostel|guest ?house|מלון/i.test(name) ? 'hotels'
      : /ramen|sushi|caf[eé]|coffee|restaurant|izakaya|bakery|yakitori|udon|soba|tempura|burger|pizza|bar\b|מסעד|קפה/i.test(name) ? 'food' : '';
    function toDay() {                            // an idea goes onto a day: pick the day, then the box
      var list = days();
      openSheet([h('h2', { text: 'Which day?' }), h('p', { dir: 'auto', text: name }), h('div', { class: 'grid4' }, list.map(function (d) {
        var p = fmtDate(d.v.Date).split(' ');
        return h('button', { type: 'button', class: 'daybtn', onclick: function () {
          openSheet([h('h2', { text: fmtDate(d.v.Date) + ' · which part?' }), h('p', { dir: 'auto', text: name })].concat(PARTS.map(function (part) {
            return btn([icon(part.icon), part.label], 'block row', function () {
              var o = { Date: d.v.Date, Part: part.id, Name: name || (v.Link ? host(v.Link) : 'Idea'), Type: 'Own' };
              if (v.Link) o[isMap(v.Link) ? 'Map link' : 'Website'] = v.Link;
              if (v.Notes) o.Notes = v.Notes;
              closeSheet(); change('Itinerary', null, o); change('Ideas', rec, null, true); toast('Added to ' + fmtDate(d.v.Date));
            });
          }), [btn('Cancel', 'block', closeSheet)]));
        } }, [h('span', { text: p[0] || '' }), h('b', { text: p[1] || '' }), h('span', { text: p[2] || '' })]);
      })), btn('Cancel', 'block', closeSheet)]);
    }
    function toTab(t) {
      var preset = {}, notes = v.Notes || '', link = cleanUrl(v.Link), linkCol = link ? linkColFor(t.sheet, link) : null;
      preset[t.title[0]] = name;
      if (link) { if (linkCol) preset[linkCol] = link; else notes = (notes ? notes + '\n' : '') + link; }
      if (notes && col(t.sheet, 'Notes')) preset.Notes = notes;
      editFields(t.sheet, null, null, 'Add to ' + t.label, preset, function () { change('Ideas', rec, null, true); toast('Moved to ' + t.label); });
    }
    openSheet([h('h2', { text: 'Move to…' }), h('p', { dir: 'auto', text: name }),
      h('div', { class: 'grid3' }, TABS.filter(function (t) { return t.id !== 'ideas'; }).map(function (t) {
        return h('button', { type: 'button', class: 'gridbtn' + (t.id === guess ? ' pick' : ''), style: 'background:' + t.tint, onclick: function () { if (t.id === 'days') toDay(); else toTab(t); } }, [icon(t.id), h('span', { text: t.label })]);
      })), btn('Cancel', 'block', closeSheet)]);
  }
  // Android: the planner shows in the Share menu; the shared item arrives in the page address
  function takeShared() {
    var q = new URLSearchParams(location.search);
    if (!q.has('text') && !q.has('url') && !q.has('title')) return;
    var x = parseShare(q.get('title') || '', q.get('text') || '', q.get('url') || '');
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* keep going */ }
    if (!x) return;
    if (!S.mode) { toast('Connect the app first, then share again'); return; }
    addIdea(x);
  }

  // ------------------------------------------------------------------ settings
  function settingsView() {
    var out = [h('h3', { text: 'The 4 sections shown first' })];
    [0, 1, 2, 3].forEach(function (i) {
      var sel = h('select', { 'aria-label': 'Section ' + (i + 1), onchange: function () {
        var j = S.tabs4.indexOf(this.value); if (j >= 0) S.tabs4[j] = S.tabs4[i];
        S.tabs4[i] = this.value; set('jp_tabs', S.tabs4); render();
      } }, TABS.map(function (t) { return h('option', { value: t.id, text: t.label }); }));
      sel.value = S.tabs4[i];
      out.push(h('div', { class: 'field inline' }, [h('label', { text: 'Place ' + (i + 1) }), sel]));
    });
    var who = h('select', { 'aria-label': 'Who uses this phone', onchange: function () { set('jp_who', this.value); } },
      [h('option', { value: '', text: '—' })].concat((S.data.lists.L_Travellers || []).map(function (n) { return h('option', { value: n, text: n }); })));
    who.value = get('jp_who', '');
    out.push(h('h3', { text: 'Who uses this phone' }));
    out.push(h('div', { class: 'field' }, [who]));
    out.push(h('p', { class: 'note', text: 'Written next to ideas you add, so you know who saved them.' }));
    out.push(h('h3', { text: 'Trip data' }));
    if (S.mode === 'sheet') {
      out.push(h('p', { class: 'note', text: 'Saved in your shared Google Sheet' + (S.lastSync ? ' · last sync ' + new Date(S.lastSync).toLocaleString() : '') }));
      out.push(btn('Sync now', 'primary block', function () { return sync(true); }));
    } else out.push(h('p', { class: 'note', text: 'Practice mode: everything stays on this phone only.' }));
    out.push(btn('Download an Excel copy', 'block', exportExcel));
    if (S.mode === 'sheet') {
      out.push(btn('Enter the passcode again', 'block', askKey));
      out.push(btn('Disconnect this phone', 'block', function () { askReset('Disconnect this phone?', 'The trip data stays safe in the Google Sheet. This phone will forget the passcode.'); }));
    } else out.push(btn('Leave practice mode', 'block', function () { askReset('Leave practice mode?', 'What you typed in practice mode will be erased from this phone.'); }));
    if (S.syncMsg) out.push(h('p', { class: 'note warn', text: S.syncMsg }));
    if (S.ops.length) {
      out.push(h('p', { class: 'note', text: S.ops.length + ' change' + (S.ops.length > 1 ? 's are' : ' is') + ' waiting to be sent.' }));
      out.push(btn('Throw away waiting changes', 'danger block', function () {
        openSheet([h('h2', { text: 'Throw away ' + S.ops.length + ' waiting change(s)?' }), h('p', { text: 'They were not saved to the Google Sheet yet and will be lost.' }),
          btn('Yes, throw away', 'danger block', function () { S.ops = []; saveOps(); closeSheet(); setSync('idle'); render(); }), btn('No, keep them', 'block', closeSheet)]);
      }));
    }
    out.push(h('p', { class: 'note', text: 'Japan Planner ' + VERSION }));
    out.push(h('div', { class: 'spacer' }));
    return out;
  }
  function askReset(q, text) {
    openSheet([h('h2', { text: q }), h('p', { text: text + (S.ops.length && S.mode === 'sheet' ? ' ' + S.ops.length + ' waiting change(s) will be lost.' : '') }),
      btn('Yes', 'danger block', function () { closeSheet(); reset(); }), btn('No', 'block', closeSheet)]);
  }
  function reset() {
    Api.forget(); ['jp_mode', 'jp_data', 'jp_ops', 'jp_last'].forEach(function (k) { set(k, null); });
    S.mode = ''; S.base = null; S.ops = []; S.view = 'main'; S.sync = 'idle'; S.syncMsg = ''; S.lastSync = 0; rebuild(); render();
  }

  // Excel copy: the original planner file, filled with everything in the app
  function exportExcel() {
    toast('Preparing the Excel file…');
    return new Promise(function (ok, no) {        // the empty planner is loaded only when asked for
      if (window.TEMPLATE_B64) return ok();
      var sc = document.createElement('script'); sc.src = 'template.js'; sc.onload = ok;
      sc.onerror = function () { var e = new Error('The Excel template could not be loaded. Check the internet connection.'); e.friendly = true; no(e); };
      document.head.appendChild(sc);
    }).then(function () {
      var wb = XL.open(XL.fromB64(window.TEMPLATE_B64)), ops = [];
      Object.keys(SC.sheets).forEach(function (n) {
        var d = def(n), rows = (S.data.sheets[n] || []).slice();
        if (n === 'Itinerary') rows.sort(function (a, b) { var x = (a.v.Date || '') + itemKey(a), y = (b.v.Date || '') + itemKey(b); return x < y ? -1 : x > y ? 1 : 0; });
        rows.forEach(function (r) {
          var v = {}; d.cols.forEach(function (c) { if (c.k !== 'auto' && !c.calc && r.v[c.h] && !(d.fixed && d.fixed.indexOf(c.h) >= 0)) v[c.h] = r.v[c.h]; });
          if (n === 'Days') {                       // the day's summary: each part's items, one per line
            var colOf = { Morning: 'Morning', Afternoon: 'Afternoon', Evening: 'Evening', Food: 'Food plans', Transport: 'Transport today' };
            PARTS.forEach(function (p) {
              var lines = planItems(r.v.Date, p.id).map(function (x) { return (x.v.Time ? x.v.Time + ' ' : '') + (x.v.Name || ''); });
              if (lines.length) v[colOf[p.id]] = lines.join('\n');
            });
            var tb = toBook(r.v.Date).map(function (x) { return x.v.What || ''; });
            if (tb.length) v['Tickets to book'] = tb.join('\n');
            ops.push({ sheet: n, r: d.hr + (+r.v.Day || 0), before: { Day: r.v.Day }, v: v });
          }
          else if (Object.keys(v).length) ops.push({ sheet: n, r: null, v: v });
        });
      });
      XL.apply(wb, SC, ops);
      var name = 'Japan_Trip_Planner_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      var file = new File([XL.save(wb)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      window.JP.lastExport = file;
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(function () { /* closed without saving */ });
      var a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.appendChild(a); a.click(); a.remove();
    });
  }

  // ------------------------------------------------------------------ first-time setup
  function setupView() {
    return [h('div', { class: 'setup' }, [
      h('h1', { text: window.JP_PREVIEW ? 'Japan Planner PREVIEW' : 'Japan Planner' }),
      window.JP_PREVIEW ? h('p', { class: 'note warn', text: 'This is the test version. It uses the TEST copy of the sheet, never the real trip data.' }) : null,
      h('p', { text: 'Fill and view the trip plan from your phone.' }),
      btn('Connect to our trip sheet', 'primary block big', function () { askKey(true); }),
      h('p', { class: 'note', text: 'Type the passcode once. After that everything you save goes to the shared Google Sheet, and you see what the other phone saved.' }),
      btn('Try it in practice mode', 'block big', function () {
        S.mode = 'local'; S.base = practiceData(); S.ops = []; set('jp_mode', 'local'); set('jp_data', S.base); saveOps(); render();
      }),
      h('p', { class: 'note', text: 'An empty planner kept only on this phone. Good for a first look.' })
    ])];
  }
  // ask for the passcode (and the web app address, when it is not built into config.js)
  function askKey(first) {
    var nodes = [h('h2', { text: first === true ? 'Connect to our trip sheet' : 'Passcode' })], urlIn = null;
    if (!Api.urlFixed()) {
      urlIn = h('input', { type: 'text', id: 'apiurl', inputmode: 'url', autocapitalize: 'off', autocomplete: 'off', placeholder: 'https://script.google.com/macros/s/…/exec' });
      urlIn.value = Api.url();
      nodes.push(h('div', { class: 'field' }, [h('label', { for: 'apiurl', text: 'Web app address (ends with /exec)' }), urlIn]));
    }
    var keyIn = h('input', { type: 'text', id: 'pass', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX' });
    nodes.push(h('div', { class: 'field' }, [h('label', { for: 'pass', text: 'Passcode (from the _App tab of the Google Sheet)' }), keyIn]));
    nodes.push(btn('Connect', 'primary block', function () {
      if (urlIn && !Api.goodUrl(urlIn.value)) { toast('The address should start with https://script.google.com and end with /exec'); return; }
      if (keyIn.value.trim().length < 6) { toast('Type the passcode'); return; }
      Api.save(urlIn ? urlIn.value : '', keyIn.value);
      var b = this; b.disabled = true; b.textContent = 'Connecting…';
      return Api.call('pull').then(function (res) {
        if (oldLayout(res.data)) { b.disabled = false; b.textContent = 'Connect'; toast(OLD_MSG); return; }
        set('jp_layout', '2.9');
        closeSheet();
        if (S.mode !== 'sheet') { S.ops = []; S.mode = 'sheet'; set('jp_mode', 'sheet'); }
        S.base = normalize(res.data); S.lastSync = Date.now(); set('jp_data', S.base); set('jp_last', S.lastSync); saveOps();
        setSync('idle'); render(); toast('Connected');
        if (S.ops.length) syncSoon();
      }, function (e) {                              // stay on this form so the passcode can be fixed
        b.disabled = false; b.textContent = 'Connect';
        if (e && e.friendly) toast(e.message); else throw e;
      });
    }));
    nodes.push(btn('Cancel', 'block', closeSheet));
    openSheet(nodes, 'form');
  }

  // ------------------------------------------------------------------ start
  window.JP = { S: S, sync: sync };               // for testing
  upgradeLocal(); upgradeBudget();
  rebuild(); render();
  takeShared();
  if (S.mode === 'sheet' || S.ops.length) sync();
  try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { /* the app works without it */ }); } catch (e) { /* the app works without it */ }
})();
