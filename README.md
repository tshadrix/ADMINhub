# Saks Admin Hub

One installable app for the Saks High School principal:

- **Observe**: ATOT walkthroughs, with the 2026–27 Saks master schedule loaded as a teacher dropdown. Picking a teacher shows what that teacher has in the current block, and that course fills in on the observation.
- **Time**: a daily minutes log in the superintendent's seven categories (Communication, Culture, Instructional Leader, Discipline, Student Support, General Supervision, Other), with a monthly Excel export.

Finished walkthroughs add their minutes to the time log automatically as **Instructional Leader**, so he never enters them twice. You can turn this off under More → Time log.

```
index.html              the whole app
manifest.json, sw.js    install + offline
icons/                  Saks logo icons
guide.html              ATOT reference page (unchanged)
robots.txt, .gitignore  keep it out of search; keep docs out of the repo
apps-script/Code.gs     Sheet receiver: Observations tab + Time Log tab
apps-script/MakeForm.gs optional Google Form (unchanged)
```

## Deploy at a new URL (about 10 minutes)

1. On GitHub, create a new repository named `AdminHub`.
2. Upload everything **except** `README.md` and the `apps-script/` folder: `index.html`, `guide.html`, `manifest.json`, `sw.js`, `robots.txt`, `.gitignore`, and the `icons/` folder.
3. **Settings → Pages →** Source `main` / root. The app goes live at `https://tshadrixccboe.github.io/AdminHub/`.
4. On the principal's phone, open that link in Safari → Share → **Add to Home Screen**.
5. In the app: **More → Your name**. This name goes on the monthly report.

**If he also has the old ATOT app installed,** replace `sw.js` in the ATOT repo with the patched one in this package. Both apps live on `tshadrixccboe.github.io`, and the old service worker deletes every offline cache that isn't its own, including the Admin Hub's. The patched version deletes only its own caches.

Admin Hub uses its own storage, separate from the ATOT app. Walkthroughs logged in the old app do not carry over. If he needs them, use **More → Backup** in the old app, then **Restore backup** in the Admin Hub. Restore replaces everything on the device, so do it before he starts logging.

## Daily use: time

The **Time** tab shows one day. He taps a category, enters minutes, and saves. For entering minutes, he can:

- tap +5, +10, +15, +30, +45, or +60
- type the number
- enter a start and end time

Entries can be logged for any date, weekends included. **After hours / event** is checked automatically on weekends and can be checked by hand for games or board meetings.

**Other** requires a short note. Notes are screened for student names and ID numbers, the same way walkthrough notes are, because they go to the superintendent.

The home screen lists recent weekdays with nothing logged, so missed days are easy to catch.

## Monthly Excel

Time → **Month** → **Download Excel** (or **Share or email** on a phone). The workbook has three tabs:

| Tab | What it shows |
|---|---|
| **Summary** | Minutes, hours, and % of time for each category; days logged; after-hours time; walkthrough minutes; and every "Other" note |
| **Daily** | Every day of the month by category, weekends shaded, with totals |
| **Entries** | Each entry as logged |

All totals are live Excel formulas.

## Google Sheet (optional backup)

The setup is the same as before. Paste `apps-script/Code.gs` into the Sheet's Apps Script, deploy it as a web app, and paste the `/exec` URL under **More → Google Sheet**. Walkthroughs go to the **Observations** tab and time entries go to a **Time Log** tab. Editing or deleting an entry on the phone updates the Sheet too.

To keep the time log in a separate Sheet, give that Sheet its own copy of `Code.gs` and put its URL in the **Time log Sheet URL** box. That keeps teacher observation data and his own time data under separate sharing settings.

## Changing things

- **Roster:** `SAKS_ROSTER` near the top of `index.html`. He can also edit names in Staff, and **Reload master schedule** restores missing teachers without overwriting edited names.
- **Category hints:** `TIME_CATS`. The district supplied the category names only, so the one-line hints under each category were written for this app and can be edited.
- **Schedule half:** the master schedule has two sets of five blocks. The app treats the left set as July–December and the right set as January–June. To change this, go to More → Time log → Master schedule.
- After any edit to `index.html`, bump `CACHE` in `sw.js` (for example `adminhub-v2`) so installed copies update.

A locally built tool aligned to ATOT; not affiliated with or endorsed by ALSDE.
