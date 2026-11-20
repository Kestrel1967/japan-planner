# Japan Planner (phone app + Google Sheet)

A small web app for both phones. It opens from a link, is added to the Home Screen, and saves into one
shared Google Sheet. No app store, no sign-in on the phones - just a passcode typed once.

- **The Google Sheet is the true copy.** One tab per topic, readable and editable by hand.
- **The phones** keep a copy to show quickly and send changes as you save.
- **Excel:** Settings > "Download an Excel copy" gives the original planner file filled with everything
  (except the Ideas inbox, which exists only in the Google Sheet).

## One-time setup (on a computer, about 15 minutes, only one person)

### 1. Make the Google Sheet
1. Signed in to your Google account, open https://sheets.new and name the file (for example "Japan Trip 2027").
2. Menu Extensions > Apps Script. Delete the sample code, paste **everything from `Code.gs`**, click Save.
3. In the toolbar choose the function **setup** and click **Run**.
   Google asks for permission: Review permissions > your account > "Google hasn't verified this app" >
   Advanced > "Go to ... (unsafe)" > Allow. This warning is normal for a script you made yourself;
   the script can only touch this one spreadsheet.
4. Go back to the Sheet. The tabs are there. Open the tab **_App** and note the **passcode**.

### 2. Switch the script on
1. In Apps Script: Deploy > New deployment > gear icon > **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**. Deploy.
3. Copy the **Web app URL** (it ends with `/exec`).
4. Check: open that URL in a browser. It should say "Japan Planner data service is running."

### 3. Put the app online (GitHub Pages, free)
1. Create a free account at github.com. New repository, name `japan-planner`, **Public**.
2. "uploading an existing file": drag in **all files from this folder** (not the folder itself), Commit.
3. Open `config.js` in the repository, click the pencil, paste the Web app URL between the quotes, Commit.
   Do **not** put the passcode there.
4. Settings > Pages > Source: "Deploy from a branch", Branch `main`, folder `/ (root)`, Save.
5. After a minute the app is at `https://YOUR-NAME.github.io/japan-planner/`.

## On each phone
1. Open the app address. iPhone: in **Safari**, Share > Add to Home Screen. Galaxy: in Chrome, menu > Add to Home screen.
2. Open it from the Home Screen icon > Connect to our trip sheet > type the passcode.

## Saving ideas from other apps (Maps, Instagram, Facebook, a browser...)
Everything shared lands in the **Ideas** tab. Open an idea and tap **Move to a section…** to file it under
Food, Places, Hotels and so on, with the name and link already filled in.

- **Galaxy:** in any app tap Share and choose **Japan** (appears after the app was added to the Home screen
  from Chrome; it can take a few minutes the first time).
- **Either phone:** copy a link, then in the Ideas tab tap **Paste a link or text**.
- **iPhone Share menu (one-time Shortcut, about 5 minutes on the iPhone):**
  1. Open the **Shortcuts** app > **+** (new shortcut). Tap the name at the top > Rename > `Japan idea`.
  2. Tap the **(i)** at the bottom > switch on **Show in Share Sheet** > Done.
  3. Search for the action **Get Contents of URL** and add it.
     - URL: paste your Web app address (the one ending with `/exec`).
     - Tap the arrow to show more. Method: **POST**. Request Body: **JSON**.
     - Add new field > **Text**: key `key`, value = the passcode.
     - Add new field > **Text**: key `share`, value = tap and choose the variable **Shortcut Input**.
     - Optional: Add new field > **Text**: key `who`, value = her name exactly as written in the Lists tab.
  4. Optional: add the action **Show Notification** with the text `Saved to Japan ideas`.
  5. Done. In any app: Share > **Japan idea**. The item appears in the Ideas tab at the next sync.
  If the shortcut asks "Allow to connect to script.google.com?", choose Always Allow.

## Using it
- **Days:** each day has boxes for Morning, Afternoon, Evening, Food, Transport and Hotel. Tap **+** to add an item:
  pick one you already saved in another section from the dropdown, or type your own name, hour, Google Maps link and website.
  In the Google Sheet these items live in the **Day plan** tab (one row per item).
- The pill at the top right shows "Saved", "Saving…" or "N waiting". Waiting changes are kept on the
  phone and sent automatically when there is internet again.
- If you both change different fields of the same item, both changes are kept. Same field: the later one wins.
- You see the other phone's changes when you open the app, tap the pill, or after a couple of minutes.

## Editing the Google Sheet by hand
- Fine: typing in cells, adding rows at the bottom, sorting, adding dropdown options in the **Lists** tab
  (type your cities there).
- Dates are written as `2027-04-15`, times as `14:30`.
- Do not rename tabs or column titles, and leave the hidden `_id` column alone.

## Security
- Anyone who has the app address **and** the passcode can read and change the trip data. Share the passcode
  privately. To change it, type a new one in `_App` cell B1; both phones will ask again.
- The script runs under your Google account but can only reach this one spreadsheet.
- Do not store passport or card numbers in it.

## Changing the script later
After editing `Code.gs`: Deploy > Manage deployments > pencil > Version: New version > Deploy (the URL stays the same).
Running `setup` again is safe; it never deletes data.

## Files
`index.html` page · `style.css` looks · `app.js` screens · `api.js` talks to the Google Sheet · `schema.js` tabs and columns ·
`config.js` the web app address · `xl.js` + `fflate.js` (MIT) + `template.js` build the Excel copy · `sw.js` offline start ·
icons and `manifest.webmanifest` for the Home Screen · `Code.gs` goes into the Google Sheet (not used by the page itself).
