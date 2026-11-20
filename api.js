/* Japan Planner - talking to the Google Sheet.
   The sheet has a small script attached (Code.gs). We send it the waiting changes; it writes them into
   the sheet and answers with the whole sheet, so the phone always ends up with the latest data. */
(function (root) {
  'use strict';
  var A = root.Api = {};
  function get(k) { try { return root.localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function set(k, v) { try { if (v) root.localStorage.setItem(k, v); else root.localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
  function err(msg, code) { var e = new Error(msg); e.friendly = true; e.code = code || ''; return e; }

  A.url = function () { return ((root.CONFIG && root.CONFIG.API_URL) || get('jp_url')).trim(); };
  A.urlFixed = function () { return !!(root.CONFIG && root.CONFIG.API_URL); };
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
})(window);
