/* Japan Planner - the screens.
   Data flow: the shared Google Sheet is the one true copy. The phone keeps a small copy to show quickly,
   plus a list of changes that are waiting. "Sync" = send the waiting changes, get the latest sheet back. */
(function () {
  'use strict';
  var SC = window.SCHEMA, TABS = SC.tabs, LS = window.localStorage;
  var app = document.getElementById('app'), overlay = document.getElementById('overlay'), toastEl = document.getElementById('toast');
  var VERSION = '2.4';

  // ------------------------------------------------------------------ storage
  function get(k, d) { try { var v = LS.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { if (v == null) LS.removeItem(k); else LS.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var S = {
    mode: get('jp_mode', ''),                     // '' = not set up, 'sheet' = the shared Google Sheet, 'local' = practice on this phone only
    base: get('jp_data', null),                   // the data as of the last sync
    ops: get('jp_ops', []),                       // changes waiting to be sent
    tabs4: get('jp_tabs', ['days', 'places', 'food', 'money']),
    tab: get('jp_tab', ''), day: get('jp_day', -1), filters: {},
    view: 'main', sync: 'idle', syncMsg: '', lastSync: get('jp_last', 0), data: null
  };
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
  function practiceData() {                       // an empty planner for practice mode
    var d = { sheets: {}, lists: clone(SC.listDefaults) }, MS = 86400000, start = Date.UTC(2027, 3, 8);
    Object.keys(SC.sheets).forEach(function (n) { d.sheets[n] = []; });
    for (var i = 0; i < 23; i++) d.sheets.Itinerary.push({ id: 'd' + (i + 1), v: { Day: String(i + 1), Date: new Date(start + i * MS).toISOString().slice(0, 10) } });
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
    d.tripDates = (d.sheets.Itinerary || []).map(function (r) { return r.v.Date; }).filter(Boolean).sort();
    S.data = d;
  }
  function saveOps() { if (!set('jp_ops', S.ops)) toast('Phone storage is full - sync soon'); rebuild(); }
  // rec = the record being changed, or null for a new one
  function change(sheet, rec, vals, del) {
    S.ops.push({ id: uid(), sheet: sheet, rid: rec ? rec.id : uid(), isNew: !rec, v: vals || {}, del: !!del });
    saveOps(); render();
    if (S.mode === 'local') sync(); else syncSoon();
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
    var sent = S.ops.slice();
    syncPromise = Api.call(sent.length ? 'push' : 'pull', sent).then(function (res) {
      syncing = false;
      var ids = {}; sent.forEach(function (o) { ids[o.id] = 1; });
      S.ops = S.ops.filter(function (o) { return !ids[o.id]; });
      S.base = normalize(res.data); S.lastSync = Date.now();
      set('jp_data', S.base); set('jp_last', S.lastSync); saveOps();
      setSync('idle'); render();
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
    money: '<circle cx="12" cy="12" r="9"/><path d="M9 7l3 5 3-5M12 12v5M9 13h6"/>',
    flights: '<path d="M3 13l18-7-6 14-3-6-9-1z"/>',
    hotels: '<path d="M3 20V8M3 15h18v5M21 15v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11.5" r="1.5"/>',
    transport: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4M9 14h.01M15 14h.01"/>',
    bookings: '<path d="M4 8a2 2 0 0 0 0 4v5h16v-5a2 2 0 0 0 0-4V5H4z"/><path d="M14 5v12"/>',
    packing: '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3M9 11v5M15 11v5"/>',
    todo: '<path d="M4 6l2 2 3-3M4 13l2 2 3-3M13 7h7M13 14h7M4 20h16"/>',
    apps: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    shopping: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    phrases: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    emergency: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    ideas: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
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
  function go(tab) { S.tab = tab; S.view = 'main'; set('jp_tab', tab); closeSheet(); render(); app.querySelector('.main').scrollTop = 0; }
  function frame(title, body, fab) {
    var bar = h('div', { class: 'tabs', id: 'tabs' }, tabOrder().map(function (id) {
      var t = byId(id);
      return h('button', { type: 'button', class: 'tab' + (S.view === 'main' && S.tab === id ? ' on' : ''), 'data-id': id, onclick: function () { go(id); } }, [icon(id), h('span', { text: t.label })]);
    }));
    return [
      h('header', { class: 'top' }, [h('h1', { text: title }), h('button', { type: 'button', id: 'pill', class: 'pill', onclick: pillTap })]),
      h('main', { class: 'main' }, body),
      fab || null,
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
    else nodes = listView(byId(S.tab));
    app.textContent = ''; nodes.forEach(function (n) { if (n) app.appendChild(n); });
    paintPill();
    var m = app.querySelector('.main'); if (m) { m.scrollTop = top; if (S.mode && S.view === 'main' && S.tab === 'days') m.classList.add('fit'); }
    var on = app.querySelector('#tabs .tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ------------------------------------------------------------------ Days (one day at a time)
  function days() { return ((S.data.sheets.Itinerary) || []).slice().sort(function (a, b) { return (+a.v.Day || 0) - (+b.v.Day || 0); }); }
  function daysView() {
    var list = days();
    if (!list.length) return [h('p', { class: 'empty', text: S.base ? 'The Itinerary tab was not found in the Google Sheet.' : 'Loading…' })];
    if (S.day < 0 || S.day >= list.length) {
      var today = new Date(), iso = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
      S.day = 0; list.forEach(function (d, i) { if (d.v.Date === iso) S.day = i; });
    }
    var d = list[S.day], v = d.v;
    function move(n) { S.day = Math.max(0, Math.min(list.length - 1, S.day + n)); set('jp_day', S.day); render(); }
    // a day starts where the day before ended, and ends where it starts unless you travel
    var prev = S.day > 0 ? list[S.day - 1].v : {}, startGuess = v['Starts in'] || prev['Ends in'] || prev['Starts in'] || '';
    var cityPreset = { 'Starts in': startGuess, 'Ends in': v['Ends in'] || startGuess }, when = fmtDate(v.Date);
    function cityChip(label) {
      return h('button', { type: 'button', class: 'citychip', onclick: function () { editFields('Itinerary', d, ['Starts in', 'Ends in'], when + ' · Cities', cityPreset); } },
        [h('span', { class: 'clabel', text: label }), h('span', { class: 'cval' + (v[label] ? '' : ' none'), dir: 'auto', text: v[label] || 'Not set' })]);
    }
    function small(label, val, fn, cls) {
      return h('button', { type: 'button', class: 'chip sm', onclick: fn }, [h('span', { class: 'clabel', text: label }), h('span', { class: 'cval' + (val ? (cls || '') : ' none'), dir: 'auto', text: val || 'Not set' })]);
    }
    function field1(label, fields, title) { return function () { editFields('Itinerary', d, fields, when + ' · ' + (title || label)); }; }
    // cost: estimate, actual, and how far the actual is above or below the estimate
    var est = parseFloat(v['Est. cost']), act = parseFloat(v['Actual cost']), cur = v.Currency ? ' ' + v.Currency : '', diff = '', dcls = '';
    if (est > 0 && !isNaN(act)) { var pct = Math.round((act - est) / est * 100); diff = (pct > 0 ? '+' : '') + pct + '%'; dcls = pct > 0 ? ' over' : pct < 0 ? ' under' : ''; }
    var cost = field1('Cost', ['Est. cost', 'Actual cost', 'Currency']);
    function part(id) { for (var i = 0; i < PARTS.length; i++) if (PARTS[i].id === id) return PARTS[i]; }
    return [
      h('div', { class: 'dayhead' }, [
        h('button', { type: 'button', class: 'round', 'aria-label': 'Previous day', disabled: S.day === 0, onclick: function () { move(-1); } }, [icon('left')]),
        h('button', { type: 'button', class: 'daytitle', onclick: function () { pickDay(list); } }, [
          h('span', { class: 'dline' }, [h('span', { class: 'big', text: when }), h('span', { class: 'small', text: 'Day ' + (v.Day || S.day + 1) + ' of ' + list.length })]),
          h('span', { class: 'track' }, [h('span', { style: 'width:' + Math.max(4, Math.round((S.day + 1) / list.length * 100)) + '%' })])]),
        h('button', { type: 'button', class: 'round', 'aria-label': 'Next day', disabled: S.day === list.length - 1, onclick: function () { move(1); } }, [icon('right')])]),
      h('div', { class: 'rowx' }, [cityChip('Starts in'), cityChip('Ends in')]),
      h('div', { class: 'blocks' }, ['Morning', 'Afternoon', 'Evening', 'Food'].map(function (id) { return bigPart(d, part(id)); })),
      h('div', { class: 'rowx' }, [smallPart(d, part('Hotel'), small), smallPart(d, part('Transport'), small)]),
      h('div', { class: 'rowx' }, [smallPart(d, part('Bookings'), small), small('Day type', v['Day type'], field1('Day type', ['Day type']))]),
      h('div', { class: 'rowx' }, [small('Est. cost', v['Est. cost'] ? fmtNum(v['Est. cost']) + cur : '', cost), small('Actual cost', v['Actual cost'] ? fmtNum(v['Actual cost']) + cur : '', cost), small('Difference', diff, cost, dcls)]),
      h('div', { class: 'rowx' }, [small('Notes', v.Notes, field1('Notes', ['Notes']))])
    ];
  }

  // ------------------------------------------------------------------ the parts of a day
  // each part is a short list of items; "from" = the sections its dropdown offers; "single" = holds one item only
  var PARTS = [
    { id: 'Morning', label: 'Morning', icon: 'sun', tint: '#FFF2CC', from: ['places', 'shopping', 'bookings', 'ideas'] },
    { id: 'Afternoon', label: 'Afternoon', icon: 'noon', tint: '#FCE0C5', from: ['places', 'shopping', 'bookings', 'ideas'] },
    { id: 'Evening', label: 'Evening', icon: 'moon', tint: '#D9D2E9', from: ['places', 'shopping', 'bookings', 'ideas'] },
    { id: 'Food', label: 'Food plans', icon: 'food', tint: '#F4CCCC', from: ['food'] },
    { id: 'Hotel', label: 'Sleeping at', icon: 'hotels', tint: '#D5E8C8', from: ['hotels'], single: true },
    { id: 'Transport', label: 'Transport', icon: 'transport', tint: '#C9E7EC', from: ['transport'] },
    { id: 'Bookings', label: 'Bookings / tickets', icon: 'bookings', tint: '#BDD7EE', from: ['bookings'] }
  ];
  function planItems(date, part) {
    return (S.data.sheets['Day plan'] || []).filter(function (r) { return r.v.Date === date && r.v.Part === part; })
      .sort(function (a, b) { return (a.v.Time || '99') < (b.v.Time || '99') ? -1 : (a.v.Time || '99') > (b.v.Time || '99') ? 1 : 0; });
  }
  function isMap(u) { return /(^|\.)google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|maps\.apple\./i.test(u || ''); }
  function linkBtn(label, url) { return /^https?:\/\//i.test(url || '') ? h('a', { class: 'linkbtn', href: url, target: '_blank', rel: 'noopener', text: label }) : null; }
  function tapPart(day, p, items) {               // nothing yet: straight to the form. Otherwise the list (or the one item)
    if (p.single) planForm(day, p, items[0] || null);
    else if (!items.length) planForm(day, p, null);
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
    return small(p.label, val, function () { tapPart(day, p, items); });
  }
  // an opened part: one row per item with hour, name, Map and Web
  function openPart(day, p) {
    var items = planItems(day.v.Date, p.id), back = function () { openPart(day, p); };
    openSheet([h('h2', { class: 'withico' }, [icon(p.icon), p.label + ' · ' + fmtDate(day.v.Date)])].concat(
      items.length ? items.map(function (r) {
        return h('div', { class: 'pitem' }, [
          h('button', { type: 'button', class: 'pmain', onclick: function () { planForm(day, p, r, back); } }, [
            h('span', { class: 'ptime', text: r.v.Time || '' }),
            h('span', { class: 'pname', dir: 'auto' }, [r.v.Name || '(no name)', r.v.Notes ? h('span', { class: 'pnote', dir: 'auto', text: r.v.Notes }) : null])]),
          linkBtn('Map', r.v['Map link']), linkBtn('Web', r.v.Website)]);
      }) : [h('p', { class: 'note', text: 'Nothing here yet.' })],
      [btn([icon('plus'), 'Add to ' + p.label], 'primary block', function () { planForm(day, p, null, back); }), btn('Close', 'block', closeSheet)]), 'tinted');
    overlay.firstChild.style.background = p.tint;
  }
  // what one row of another section offers to a day item
  function offer(t, r) {
    var v = r.v, o = { name: t.title.map(function (x) { return v[x] || ''; }).filter(Boolean).join(t.sep || ' '), map: v['Map link'] || v['Map / booking link'] || '', web: v['Where to book (link)'] || '', time: v.Departs || v.Time || '' };
    if (t.id === 'ideas' && v.Link) { if (isMap(v.Link)) o.map = v.Link; else o.web = v.Link; }
    if (o.map && !isMap(o.map) && !o.web) { o.web = o.map; o.map = ''; }
    o.hint = [v.City, v['District / ward'], v.Type || v.Category].filter(Boolean).join(', ');
    return o;
  }
  // the form for one item. back = where to return to (the opened list), if any
  function planForm(day, p, rec, back) {
    var v = rec ? rec.v : {}, date = day.v.Date, picked = null, cols = def('Day plan').cols, byH = {};
    function done() { if (back) back(); else closeSheet(); }
    cols.forEach(function (c) { byH[c.h] = c; });
    var fName = field('Day plan', byH.Name, v.Name || ''), fTime = field('Day plan', byH.Time, v.Time || ''),
      fMap = field('Day plan', byH['Map link'], v['Map link'] || ''), fWeb = field('Day plan', byH.Website, v.Website || ''), fNotes = field('Day plan', byH.Notes, v.Notes || '');
    fMap.querySelector('label').textContent = 'Google Maps link'; fTime.querySelector('label').textContent = 'Hour';
    function inp(f) { return f.querySelector('[data-h]'); }
    var choices = {}, groups = [];
    p.from.forEach(function (id) {
      var t = byId(id), rows = S.data.sheets[t.sheet] || [];
      if (!rows.length) return;
      groups.push(h('optgroup', { label: t.label }, rows.map(function (r) {
        var o = offer(t, r), key = id + '|' + r.id; choices[key] = { t: t, r: r, o: o };
        return h('option', { value: key, text: (o.name || '(no name)') + (o.hint ? ' · ' + o.hint : '') });
      })));
    });
    var nodes = [h('h2', { class: 'withico' }, [icon(p.icon), fmtDate(date) + ' · ' + p.label])];
    if (groups.length) {
      var sel = h('select', { id: 'pick', onchange: function () {
        var c = choices[this.value]; if (!c) return;
        picked = c; inp(fName).value = c.o.name;
        if (c.o.map) inp(fMap).value = c.o.map;
        if (c.o.web) inp(fWeb).value = c.o.web;
        if (c.o.time && !inp(fTime).value) inp(fTime).value = c.o.time;
      } }, [h('option', { value: '', text: 'Choose from your lists…' })].concat(groups));
      nodes.push(h('div', { class: 'field' }, [h('label', { for: 'pick', text: 'Pick one you already saved' }), sel]));
      nodes.push(h('p', { class: 'note', text: 'Or type your own below.' }));
    } else nodes.push(h('p', { class: 'note', text: 'Nothing saved in ' + p.from.map(function (id) { return byId(id).label; }).join(', ') + ' yet, so type it here.' }));
    nodes = nodes.concat(p.single ? [fName, fMap, fWeb, fNotes] : [fName, fTime, fMap, fWeb, fNotes]);
    nodes.push(btn('Save', 'primary block', function () {
      var now = { 'Name': inp(fName).value.trim(), 'Time': p.single ? '' : inp(fTime).value.trim(), 'Map link': inp(fMap).value.trim(), 'Website': inp(fWeb).value.trim(), 'Notes': inp(fNotes).value.trim() }, out = {};
      if (!now.Name) { toast('Give it a name, or pick one from the list'); return; }
      Object.keys(now).forEach(function (k) { if (now[k] !== (v[k] || '')) out[k] = now[k]; });
      if (picked) out.From = picked.t.label;
      var filled = 0;
      if (p.single) {                             // a hotel holds for the following days too, until a day that has another one
        var all = days(), at = -1, oldName = v.Name || '';
        all.forEach(function (x, i) { if (x.v.Date === date) at = i; });
        for (var i = at + 1; at >= 0 && i < all.length; i++) {
          var it = planItems(all[i].v.Date, p.id)[0], same = { 'Name': now.Name, 'Map link': now['Map link'], 'Website': now.Website };
          if (!it) { same.Date = all[i].v.Date; same.Part = p.id; Object.keys(same).forEach(function (k) { if (same[k] === '') delete same[k]; }); change('Day plan', null, same); filled++; }
          else if (oldName && (it.v.Name || '') === oldName) { change('Day plan', it, same); filled++; }
          else break;
        }
      }
      if (!rec) { out.Date = date; out.Part = p.id; Object.keys(out).forEach(function (k) { if (out[k] === '') delete out[k]; }); change('Day plan', null, out); }
      else if (Object.keys(out).length) change('Day plan', rec, out);
      // a place or restaurant put on a day gets that day as its "Planned day"
      if (picked && col(picked.t.sheet, 'Planned day') && !picked.r.v['Planned day']) change(picked.t.sheet, picked.r, { 'Planned day': date });
      done(); toast(filled ? 'Saved for this day and the ' + filled + ' after it' : 'Saved');
    }));
    nodes.push(btn('Cancel', 'block', done));
    if (rec) nodes.push(btn('Remove from this day', 'danger block', function () { change('Day plan', rec, null, true); done(); toast('Removed'); }));
    openSheet(nodes, 'form');
  }
  function pickDay(list) {
    openSheet([h('h2', { text: 'Choose a day' }), h('div', { class: 'grid4' }, list.map(function (d, i) {
      var p = fmtDate(d.v.Date).split(' ');
      return h('button', { type: 'button', class: 'daybtn' + (i === S.day ? ' on' : ''), onclick: function () { S.day = i; set('jp_day', i); closeSheet(); render(); } }, [h('span', { text: p[0] || '' }), h('b', { text: p[1] || String(i + 1) }), h('span', { text: p[2] || '' })]);
    })), btn('Close', 'block', closeSheet)]);
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
    if (right.length) kids.push(h('div', { class: 'cright' }, right));
    return h('div', { class: 'card' + (done ? ' done' : '') }, kids);
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
      if (sheet === 'Itinerary') {                  // a day with only a start city ends in the same city
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
    var all = [title, text, url].filter(Boolean).join('\n'), m = /https?:\/\/\S+/.exec(url || '') || /https?:\/\/\S+/.exec(all), link = m ? m[0] : '';
    var idea = all.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title && text && idea.indexOf(title + ' ' + title) === 0) idea = idea.slice(title.length + 1);
    if (!idea && link) idea = '(' + host(link) + ')';
    return idea || link ? { idea: idea, link: link } : null;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addIdea(x) {
    var v = { 'Idea': x.idea, 'Added': today() };
    if (x.link) v.Link = x.link;
    if (get('jp_who', '')) v['Added by'] = get('jp_who', '');
    S.tab = 'ideas'; S.view = 'main'; set('jp_tab', 'ideas');
    change('Ideas', null, v); toast('Added to Ideas');
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
    var v = rec.v, name = v.Idea || '', guess = /hotel|ryokan|hostel|guest ?house|מלון/i.test(name) ? 'hotels'
      : /ramen|sushi|caf[eé]|coffee|restaurant|izakaya|bakery|yakitori|udon|soba|tempura|burger|pizza|bar\b|מסעד|קפה/i.test(name) ? 'food' : '';
    function toDay() {                            // an idea goes onto a day: pick the day, then the box
      var list = days();
      openSheet([h('h2', { text: 'Which day?' }), h('p', { dir: 'auto', text: name }), h('div', { class: 'grid4' }, list.map(function (d) {
        var p = fmtDate(d.v.Date).split(' ');
        return h('button', { type: 'button', class: 'daybtn', onclick: function () {
          openSheet([h('h2', { text: fmtDate(d.v.Date) + ' · which part?' }), h('p', { dir: 'auto', text: name })].concat(PARTS.map(function (part) {
            return btn([icon(part.icon), part.label], 'block row', function () {
              var o = { Date: d.v.Date, Part: part.id, Name: /^\(.*\)$/.test(name) ? (v.Link ? host(v.Link) : 'Idea') : name, From: 'Ideas' };
              if (v.Link) o[isMap(v.Link) ? 'Map link' : 'Website'] = v.Link;
              if (v.Notes) o.Notes = v.Notes;
              closeSheet(); change('Day plan', null, o); change('Ideas', rec, null, true); toast('Added to ' + fmtDate(d.v.Date));
            });
          }), [btn('Cancel', 'block', closeSheet)]));
        } }, [h('span', { text: p[0] || '' }), h('b', { text: p[1] || '' }), h('span', { text: p[2] || '' })]);
      })), btn('Cancel', 'block', closeSheet)]);
    }
    function toTab(t) {
      var d = def(t.sheet), preset = {}, linkCol = null, notes = v.Notes || '';
      d.cols.forEach(function (c) { if (!linkCol && c.k === 'link') linkCol = c.h; });
      preset[t.title[0]] = /^\(.*\)$/.test(name) ? '' : name;
      if (v.Link) { if (linkCol) preset[linkCol] = v.Link; else notes = (notes ? notes + '\n' : '') + v.Link; }
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
        var d = def(n);
        (S.data.sheets[n] || []).forEach(function (r) {
          var v = {}; d.cols.forEach(function (c) { if (c.k !== 'auto' && r.v[c.h] && !(d.fixed && d.fixed.indexOf(c.h) >= 0)) v[c.h] = r.v[c.h]; });
          if (n === 'Day plan') return;
          if (d.fixed) {
            var colOf = { Morning: 'Morning', Afternoon: 'Afternoon', Evening: 'Evening', Food: 'Food plans', Transport: 'Transport today', Hotel: 'Sleeping at (hotel)', Bookings: 'Bookings / tickets' };
            PARTS.forEach(function (p) {
              var lines = planItems(r.v.Date, p.id).map(function (x) { return (x.v.Time ? x.v.Time + ' ' : '') + (x.v.Name || ''); });
              if (lines.length) v[colOf[p.id]] = lines.join(p.id === 'Hotel' ? ', ' : '\n');
            });
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
      h('h1', { text: 'Japan Planner' }),
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
  rebuild(); render();
  takeShared();
  if (S.mode === 'sheet' || S.ops.length) sync();
  try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { /* the app works without it */ }); } catch (e) { /* the app works without it */ }
})();
