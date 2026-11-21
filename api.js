/* Japan Planner - talking to the Google Sheet.
   The sheet has a small script attached (Code.gs). We send it the waiting changes; it writes them into
   the sheet and answers with the whole sheet, so the phone always ends up with the latest data. */
(function (root) {
  'use strict';
  var A = root.Api = {};
  // the preview copy of the app (…/preview/) keeps its own data on the phone and talks to the test sheet
  var PREVIEW = /\/preview\//.test(root.location.pathname);
  root.JP_PREVIEW = PREVIEW;
  function key_(k) { return PREVIEW ? k.replace(/^jp_/, 'jpv_') : k; }
  function get(k) { try { return root.localStorage.getItem(key_(k)) || ''; } catch (e) { return ''; } }
  function set(k, v) { try { if (v) root.localStorage.setItem(key_(k), v); else root.localStorage.removeItem(key_(k)); } catch (e) { /* storage blocked */ } }
  function fixed() { var c = root.CONFIG || {}; return ((PREVIEW ? c.PREVIEW_API_URL : c.API_URL) || '').trim(); }
  function err(msg, code) { var e = new Error(msg); e.friendly = true; e.code = code || ''; return e; }

  A.url = function () { return (fixed() || get('jp_url')).trim(); };
  A.urlFixed = function () { return !!fixed(); };
  A.key = function () { return get('jp_key'); };
  A.save = function (url, key) { if (!A.urlFixed()) set('jp_url', (url || '').trim()); set('jp_key', (key || '').trim()); };
  A.forget = function () { set('jp_url', ''); set('jp_key', ''); };
  A.goodUrl = function (u) { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test((u || '').trim()) || /^http:\/\/localhost[:/]/.test(u || ''); };

  // action: 'pull' or 'push' (with ops). -> {data, skipped}
  A.call = function (action, ops) {
    if (!A.url()) return Promise.reject(err('The app is not connected to the Google Sheet yet.', 'key'));
    var ctl = root.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 45000) : 0;
    // "text/plain" keeps this a simple request, which Google's script service accepts from any page
    return fetch(A.url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ key: A.key(), action: action, ops: ops || [] }) })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw err('The Google Sheet service answered with an error (' + r.status + ').', 'server'); return r.text(); },
        function () { clearTimeout(timer); throw err('No internet connection.', 'offline'); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw err('The Google Sheet service gave an unexpected answer. Check the web app address, and that it is deployed for "Anyone".', 'server'); }
        if (j.error === 'key') throw err('The passcode is not right.', 'key');
        if (j.error) throw err('The Google Sheet could not save: ' + (j.message || j.error), 'server');
        if (!j.data || !j.data.sheets) throw err('The Google Sheet service gave an incomplete answer.', 'server');
        return j;
      });
  };
  // the place name behind a short Google Maps link (the sheet's script opens the link); '' when it cannot be read
  A.resolve = function (link) {
    if (!A.url()) return Promise.resolve('');
    var ctl = root.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;
    return fetch(A.url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ key: A.key(), action: 'resolve', url: link }) })
      .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : {}; })
      .then(function (j) { return (j && typeof j.name === 'string') ? j.name : ''; }, function () { clearTimeout(timer); return ''; });
  };
})(window);
