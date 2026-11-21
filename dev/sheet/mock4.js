// v2.8 test server: the new script on an in-memory sheet, port given as argument. Optional "old" = start from the v2.7 layout.
const http = require('http'), { SS, load, redirects } = require('./mock3');
const port = +process.argv[2] || 8767, old = process.argv[3] === 'old';
const ss = new SS();
let ctx;
if (old) { ctx = load(ss, __dirname + '/Code_v27.gs'); ctx.setup(); } else { ctx = load(ss, __dirname + '/Code.gs'); ctx.setup(); }
redirects['https://maps.app.goo.gl/ich'] = 'https://www.google.com/maps/place/Ichiran+Shibuya/@35.66,139.7,17z';
const key = ss.getSheetByName('_App').getRange('B1').getDisplayValue(); console.log('KEY', key);
http.createServer((req, res) => {
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.url.startsWith('/ctl')) { const q = new URL(req.url, 'http://x').searchParams;
    if (q.get('upgrade')) { ctx = load(ss, __dirname + '/Code.gs'); ctx.setup(); }
    if (q.get('timer')) ctx.timer();
    if (q.get('dump')) { res.writeHead(200, H); return res.end(JSON.stringify(ss.sheets.map(s => ({ name: s.name, cells: s.cells.filter(r => r.some(x => x !== '')) })))); }
    res.writeHead(200, H); return res.end('ok'); }
  if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    if (req.method !== 'POST') { res.writeHead(200, H); return res.end(ctx.doGet().text); }
    const out = ctx.doPost({ postData: { contents: body } }).text;
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, H)); res.end(out);
  });
}).listen(port, () => console.log('mock sheet on ' + port));
