/**
 * Saks Admin Hub — Google Sheets receiver
 * ------------------------------------------------------------------
 * Receives two kinds of rows from the app:
 *   - walkthroughs  → the "Observations" tab (append, deduped on VisitID)
 *   - time entries  → the "Time Log" tab (insert, update, or delete by EntryID,
 *                     because the principal can edit or remove an entry)
 * ------------------------------------------------------------------
 * Paste this into Extensions → Apps Script on the Sheet you want the
 * observations to land in, save, then Deploy → New deployment →
 * Web app, Execute as "Me", Who has access "Anyone".
 *
 * "Anyone" means anyone who has the long random /exec URL can POST a
 * row. It does NOT give anyone access to read your Sheet. Keep the URL
 * to yourself and your assistant principals. If you ever need to cut
 * off access, create a new deployment — the old URL stops working.
 *
 * For a little more assurance, set SHARED_SECRET below to any phrase
 * and put the same phrase in the app under More → Google Sheet.
 * Leave it as "" to skip that check.
 */

var SHARED_SECRET = "";           // optional; must match the app if set
var SHEET_NAME    = "Observations";
var LOG_NAME      = "SyncLog";
var TIME_NAME     = "Time Log";

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ status: "error", message: "Sheet busy, try again" });
  }
  try {
    if (!e || !e.postData || !e.postData.contents)
      return json({ status: "error", message: "Empty request" });

    var data;
    try { data = JSON.parse(e.postData.contents); }
    catch (err) { return json({ status: "error", message: "Body was not JSON" }); }

    if (SHARED_SECRET && data.secret !== SHARED_SECRET)
      return json({ status: "error", message: "Secret did not match" });

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    /* connection test from the app's Test button */
    if (data.test === true) {
      return json({ status: "ok",
        message: "Connected to \"" + ss.getName() + "\"." });
    }

    if (data.kind === "time") return saveTime_(ss, data);

    if (!data.row || !data.header)
      return json({ status: "error", message: "Missing row or header" });

    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
    }

    /* write or repair the header row */
    if (sh.getLastRow() === 0) {
      sh.appendRow(data.header);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, data.header.length)
        .setFontWeight("bold")
        .setBackground("#f2f2f2")
        .setVerticalAlignment("middle");
      sh.setColumnWidth(1, 150);
    } else {
      var current = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      if (current.length !== data.header.length ||
          current.join("") !== data.header.join("")) {
        /* the app's column set changed — extend rather than destroy */
        sh.getRange(1, 1, 1, data.header.length).setValues([data.header]);
      }
    }

    /* idempotency: the app retries, so never write the same visit twice */
    var idCol = data.header.indexOf("VisitID") + 1;
    if (idCol > 0 && sh.getLastRow() > 1) {
      var ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0] === data.visitId) {
          log_(ss, data.visitId, "duplicate ignored");
          return json({ status: "duplicate", row: i + 2 });
        }
      }
    }

    sh.appendRow(data.row);
    var written = sh.getLastRow();
    log_(ss, data.visitId, "row " + written);
    return json({ status: "ok", row: written });

  } catch (err) {
    return json({ status: "error", message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* A browser opening the URL directly gets a friendly page instead of an error. */
function doGet() {
  return HtmlService.createHtmlOutput(
    "<p style='font:15px system-ui;padding:24px'>Admin Hub receiver is running. " +
    "Paste this URL into the app under More &rarr; Google Sheet.</p>");
}

/* Time entries: one row per EntryID. Re-sending an edited entry overwrites
   its row; a delete removes it. Called inside doPost's lock. */
function saveTime_(ss, data) {
  if (!data.entryId) return json({ status: "error", message: "Missing entryId" });
  var sh = ss.getSheetByName(TIME_NAME);
  if (!sh) {
    if (data.deleted) return json({ status: "ok", message: "nothing to delete" });
    sh = ss.insertSheet(TIME_NAME);
  }
  if (sh.getLastRow() === 0 && data.header) {
    sh.appendRow(data.header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, data.header.length).setFontWeight("bold").setBackground("#f2f2f2");
  }
  var found = 0;
  if (sh.getLastRow() > 1) {
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(data.entryId)) { found = i + 2; break; }
  }
  if (data.deleted) {
    if (found) sh.deleteRow(found);
    log_(ss, data.entryId, found ? "time deleted" : "time delete — not found");
    return json({ status: "ok" });
  }
  if (!data.row) return json({ status: "error", message: "Missing row" });
  if (found) {
    sh.getRange(found, 1, 1, data.row.length).setValues([data.row]);
    log_(ss, data.entryId, "time updated row " + found);
    return json({ status: "ok", row: found });
  }
  sh.appendRow(data.row);
  log_(ss, data.entryId, "time row " + sh.getLastRow());
  return json({ status: "ok", row: sh.getLastRow() });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function log_(ss, visitId, note) {
  try {
    var lg = ss.getSheetByName(LOG_NAME);
    if (!lg) {
      lg = ss.insertSheet(LOG_NAME);
      lg.appendRow(["When", "VisitID", "Result"]);
      lg.setFrozenRows(1);
    }
    lg.appendRow([new Date(), visitId || "", note]);
    /* keep the log from growing without bound */
    if (lg.getLastRow() > 2000) lg.deleteRows(2, 500);
  } catch (err) { /* logging must never break a save */ }
}

/**
 * Optional: run this once from the editor to add a summary tab with
 * live formulas. Safe to re-run; it rebuilds the tab.
 */
function buildSummaryTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(SHEET_NAME);
  if (!src) throw new Error("No " + SHEET_NAME + " sheet yet — send one observation first.");
  var old = ss.getSheetByName("Summary");
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet("Summary", 0);

  sh.getRange("A1").setValue("Walkthrough Summary").setFontSize(14).setFontWeight("bold");
  sh.getRange("A3").setValue("Total observations");
  sh.getRange("B3").setFormula('=COUNTA(' + SHEET_NAME + '!B2:B)');
  sh.getRange("A4").setValue("Teachers observed");
  sh.getRange("B4").setFormula('=COUNTA(UNIQUE(FILTER(' + SHEET_NAME + '!E2:E,' + SHEET_NAME + '!E2:E<>"")))');
  sh.getRange("A5").setValue("Average overall rating");
  sh.getRange("B5").setFormula('=IFERROR(ROUND(AVERAGE(FILTER(' + SHEET_NAME +
    "!" + colA1_(headerIndex_("Overall Avg")) + "2:" + colA1_(headerIndex_("Overall Avg")) +
    "," + SHEET_NAME + "!" + colA1_(headerIndex_("Overall Avg")) + '2:' +
    colA1_(headerIndex_("Overall Avg")) + '<>"")),2),"—")');
  sh.getRange("A7").setValue("Average by dimension").setFontWeight("bold");

  var dims = ["Culture Avg", "Learning Avg", "Essentials Avg", "Agency Avg", "Relations Avg"];
  for (var i = 0; i < dims.length; i++) {
    var c = colA1_(headerIndex_(dims[i]));
    sh.getRange(8 + i, 1).setValue(dims[i].replace(" Avg", ""));
    sh.getRange(8 + i, 2).setFormula('=IFERROR(ROUND(AVERAGE(FILTER(' + SHEET_NAME + '!' + c + '2:' + c +
      ',' + SHEET_NAME + '!' + c + '2:' + c + '<>"")),2),"—")');
  }
  sh.getRange("A15").setValue("Visits per teacher").setFontWeight("bold");
  sh.getRange("A16").setFormula('=QUERY(' + SHEET_NAME +
    '!E2:E,"select Col1, count(Col1) where Col1 is not null group by Col1 order by count(Col1) desc label count(Col1) \'Visits\'",0)');
  sh.setColumnWidth(1, 200);
  sh.getRange("A1:B20").setVerticalAlignment("middle");

  function headerIndex_(name) {
    var hdr = src.getRange(1, 1, 1, src.getLastColumn()).getValues()[0];
    var i = hdr.indexOf(name);
    if (i < 0) throw new Error('Column "' + name + '" not found. Send one observation first.');
    return i + 1;
  }
}

function colA1_(n) {
  var s = "";
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
