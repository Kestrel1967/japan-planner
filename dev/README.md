# Developer tools (not used by the app)

- `sheet/` — the Google Sheet script source. `Code.tpl.gs` + `def.json` (tabs, columns, dropdown lists) → `python3 gen.py` → `Code.gs` (copy to repo root).
  Tests run in Node with an in-memory imitation of Google Sheets (`mock3.js`):
  `node test_migrate.js` (old layout → new, automatic Itinerary, hotels, Maps names), `node test_adopt.js`, `node test_backup.js`.
  `node mock4.js 8767` serves the script over HTTP for phone tests (`node mock4.js 8767 old` starts from the v2.7 layout; `/ctl?upgrade=1`, `/ctl?timer=1`, `/ctl?dump=1`).
- `excel/build.py` — builds the Excel template (Japan_Trip_Planner_April_2027.xlsx). Its base64 goes into `template.js` (used by "Download an Excel copy").
- `phone_test.py` — Playwright walk-through of the app at 360×740 / 390×763 against `mock4.js`, app served from a folder whose `config.js` has PREVIEW_API_URL = http://localhost:8767/ (path must contain /preview/).
