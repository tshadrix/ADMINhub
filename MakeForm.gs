/**
 * ATOT Walkthrough — Google Form companion
 * =================================================================
 * Builds a Google Form that mirrors the app, and files every response
 * into the SAME "Observations" sheet in the SAME column layout the app
 * uses. One dataset, two ways in — your reports never split in half.
 *
 * SETUP (about two minutes)
 *   1. Open the Sheet the app already writes to.
 *   2. Extensions → Apps Script. Add a new file alongside Code.gs and
 *      paste this in. (Keep Code.gs — it handles the app's sync.)
 *   3. Run  buildForm()  once. Authorize when prompted.
 *   4. The execution log prints the form's share link. Give that to
 *      anyone who prefers a form to the app.
 *
 * KEEPING THE ROSTER FRESH
 *   buildForm() creates a "Roster" tab. Put one teacher name per row in
 *   column A, then run  syncRosterToForm()  to refresh the dropdown.
 *   Do this at the start of each year, or whenever staff changes.
 *
 * IF YOU EVER CHANGE THE APP'S INDICATORS
 *   Update the ATOT list below to match, then run  rebuildForm().
 *   Rows are written by looking up column names in the existing header,
 *   so column ORDER never has to be kept in sync by hand — only the
 *   indicator text.
 */

var SHEET_NAME   = "Observations";
var ROSTER_NAME  = "Roster";
var FORM_TITLE   = "ATOT Walkthrough — Classroom Observation";
var FORM_BLURB   =
  "Classroom walkthrough capture aligned to the Alabama Teacher Observation Tool. " +
  "Rate only what you actually observed — leave anything you did not see on " +
  "\"Not observed.\" Blank is never counted as a zero.\n\n" +
  "Describe what students did, not who they are. Do not enter student names, " +
  "ID numbers, or anything that identifies an individual learner.\n\n" +
  "A locally built tool aligned to ATOT. Not affiliated with, produced by, or " +
  "endorsed by the Alabama State Department of Education.";

/* The five dimensions and 23 indicators — must match the app's ATOT array. */
var ATOT = [
  { key: "CC", name: "Culture / Climate", short: "Culture",
    desc: "A learning environment in which each learner is cared for, is safe, has a sense of belonging, and feels secure to share thoughts.",
    items: [
      "Fosters an environment that embraces all learners",
      "Treats each learner equitably",
      "Encourages learners to share opinions without fear of negative comments",
      "Creates enthusiasm for the learning at hand" ] },
  { key: "LR", name: "Learning", short: "Learning",
    desc: "Processes established to ensure learners have opportunities to demonstrate understanding of content and apply knowledge and skills.",
    items: [
      "Communicates clear explanations about activities or tasks",
      "Implements lessons stimulating higher-order thinking skills",
      "Delivers lessons relatable to learners or aligned to their interests",
      "Monitors learners' understanding of content / skill acquisition",
      "Adapts instruction and activities to meet individual learner needs",
      "Provides learners purposeful feedback about progress and needs" ] },
  { key: "ES", name: "Essentials", short: "Essentials",
    desc: "Core competencies of an effective teacher: presence and disposition, pedagogical knowledge, content knowledge, and management of the learning environment.",
    items: [
      "Delivers / facilitates the lesson with knowledge and confidence",
      "Communicates and upholds high expectations for learner behaviors",
      "Facilitates use of resources supporting learner needs",
      "Implements instructional strategies actively engaging learners",
      "Manages learning time efficiently and optimally" ] },
  { key: "AG", name: "Agency", short: "Agency",
    desc: "Actions that foster learners' ability to self-direct and self-regulate learning.",
    items: [
      "Empowers learners to be responsible for learning",
      "Gives learners choices about learning activities and tasks",
      "Provides assistance navigating and monitoring learning progress",
      "Encourages learners to persevere with challenging activities and tasks",
      "Builds learners' growth mindset and self-efficacy" ] },
  { key: "RL", name: "Relationships", short: "Relations",
    desc: "Actions that foster healthy, positive connections between the teacher and learners.",
    items: [
      "Promotes respectful and caring interactions toward and between learners",
      "Cultivates learner cooperation, collaboration, and inclusivity",
      "Preserves learners' dignity while attending to individual needs" ] }
];

var SCALE_COLS = ["4 — Very Evident (more than 75%)",
                  "3 — Evident (51–74%)",
                  "2 — Somewhat Evident (25–50%)",
                  "1 — Not Evident (less than 25%)",
                  "Not observed"];
var YESNO_COLS = ["Yes", "No", "Not observed"];

var TEACHER_ACTIONS = [
  "Direct instruction", "Modeling / think-aloud", "Questioning", "Facilitating discussion",
  "Small-group instruction", "Conferring 1:1", "Monitoring / circulating", "Giving feedback",
  "Checking for understanding", "Redirecting behavior", "Managing materials", "At desk / not engaged"];
var STUDENT_ACTIONS = [
  "Listening / watching", "Responding to questions", "Discussing with peers", "Reading",
  "Writing", "Problem solving", "Hands-on / investigating", "Presenting / explaining",
  "Working independently", "Collaborating in groups", "Using technology purposefully",
  "Off task / waiting"];

var CHECKLISTS = [
  { key: "room", name: "Room environment", col: "Room %", items: [
    "Learning target or objective posted and visible",
    "Agenda or lesson flow visible to students",
    "Anchor charts / word wall current and referenced",
    "Current student work displayed with standards evident",
    "Materials accessible to students without teacher help",
    "Seating arrangement supports the day's task",
    "Clear sightlines — teacher can see all students",
    "Traffic paths clear and uncluttered",
    "Classroom library / resources organized and in use",
    "Technology set up and functioning" ] },
  { key: "systems", name: "Systems & routines", col: "Systems %", items: [
    "Entry routine established; class started promptly",
    "Attention signal used and honored",
    "Transitions efficient (under two minutes)",
    "Materials distribution and collection routinized",
    "Behavior expectations posted and referenced",
    "Positive narration / specific praise used",
    "Clear procedure for questions and help-seeking",
    "Students know what to do when finished",
    "Closure or exit routine evident",
    "High time on task throughout the visit" ] },
  { key: "safety", name: "Safety & compliance", col: "Safety %", items: [
    "Emergency procedures posted and current",
    "Exits and egress paths clear",
    "Safety equipment accessible and unobstructed",
    "Required postings present",
    "Substitute folder / plans accessible",
    "Student information secured, not publicly displayed",
    "Lighting and temperature appropriate",
    "Furniture and equipment in safe condition",
    "Cords and technology safely managed",
    "Supervision appropriate for the activity" ] }
];

/* Question titles the response parser looks for. Changing these means
   changing them in BOTH places. */
var Q = {
  observer: "Your name",
  teacher:  "Teacher observed",
  subject:  "Grade / subject observed",
  date:     "Date of visit",
  period:   "Period or block",
  students: "Students present",
  minutes:  "Minutes in the room",
  mode:     "Visit type",
  addChecks:"Add the environment checklists?",
  tActions: "What was the TEACHER doing? Check everything you saw.",
  sActions: "What were STUDENTS doing? Check everything you saw.",
  strength: "Strength to name for the teacher",
  growth:   "Growth area",
  next:     "Next step / follow-up",
  evidence: "Evidence notes"
};

/* =================================================================
   BUILD
   ================================================================= */
function buildForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = PropertiesService.getDocumentProperties().getProperty("atotFormId");
  if (existing) {
    var url;
    try { url = FormApp.openById(existing).getPublishedUrl(); } catch (e) { url = null; }
    if (url) {
      Logger.log("A form already exists:\n" + url +
                 "\n\nRun rebuildForm() if you want to replace it.");
      return url;
    }
  }
  return rebuildForm();
}

function rebuildForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureRosterTab_(ss);

  var form = FormApp.create(FORM_TITLE)
    .setDescription(FORM_BLURB)
    .setCollectEmail(false)
    .setAllowResponseEdits(true)
    .setProgressBar(true)
    .setShowLinkToRespondAgain(true)
    .setConfirmationMessage(
      "Observation recorded. It will appear in the Observations sheet within a few seconds.");

  /* ---- Section 1: visit details ---- */
  form.addTextItem().setTitle(Q.observer).setRequired(true);

  var roster = readRoster_(ss);
  var teacherItem = form.addListItem().setTitle(Q.teacher).setRequired(true);
  teacherItem.setChoiceValues(roster.length ? roster : ["(Add names to the Roster tab)"]);

  form.addTextItem().setTitle(Q.subject)
    .setHelpText("For example: 7th grade ELA");
  form.addDateItem().setTitle(Q.date).setRequired(true);
  form.addTextItem().setTitle(Q.period).setHelpText("Optional");
  form.addTextItem().setTitle(Q.students).setHelpText("Optional — how many were present");
  form.addTextItem().setTitle(Q.minutes).setHelpText("Roughly how long you were in the room");
  form.addMultipleChoiceItem().setTitle(Q.mode)
    .setChoiceValues(["Walkthrough (3–5 minutes)", "Full ATOT (20 minutes)"])
    .setRequired(true);

  /* ---- One grid per dimension ---- */
  for (var i = 0; i < ATOT.length; i++) {
    var d = ATOT[i];
    form.addPageBreakItem().setTitle(d.name).setHelpText(d.desc);
    form.addGridItem()
      .setTitle(d.name)
      .setHelpText("Leave any indicator you did not observe on \"Not observed.\"")
      .setRows(d.items)
      .setColumns(SCALE_COLS);
  }

  /* ---- Actions ---- */
  form.addPageBreakItem().setTitle("What people were doing")
    .setHelpText("A quick read on who is doing the cognitive work.");
  form.addCheckboxItem().setTitle(Q.tActions).setChoiceValues(TEACHER_ACTIONS);
  form.addCheckboxItem().setTitle(Q.sActions).setChoiceValues(STUDENT_ACTIONS);

  /* ---- Optional checklists, behind a yes/no gate ---- */
  var gate = form.addPageBreakItem().setTitle("Environment");
  var gateQ = form.addMultipleChoiceItem().setTitle(Q.addChecks)
    .setHelpText("Skip this on a quick walkthrough — it adds about a minute.")
    .setRequired(true);

  var firstChecklistPage = null, checklistPages = [];
  for (var c = 0; c < CHECKLISTS.length; c++) {
    var cl = CHECKLISTS[c];
    var pb = form.addPageBreakItem().setTitle(cl.name);
    checklistPages.push(pb);
    if (c === 0) firstChecklistPage = pb;
    form.addGridItem()
      .setTitle(cl.name)
      .setHelpText("Mark \"No\" for anything that needs follow-up — those are collected " +
                   "into the Concerns Flagged column.")
      .setRows(cl.items)
      .setColumns(YESNO_COLS);
  }

  /* ---- Feedback ---- */
  var feedbackPage = form.addPageBreakItem().setTitle("Feedback and evidence");
  form.addParagraphTextItem().setTitle(Q.strength);
  form.addParagraphTextItem().setTitle(Q.growth);
  form.addParagraphTextItem().setTitle(Q.next)
    .setHelpText("Small, observable, and dated.");
  form.addParagraphTextItem().setTitle(Q.evidence)
    .setHelpText("What you saw and heard. No student names or identifiers.");

  /* routing: Yes → first checklist page, No → straight to feedback */
  gateQ.setChoices([
    gateQ.createChoice("Yes", firstChecklistPage),
    gateQ.createChoice("No, skip to feedback", feedbackPage)
  ]);
  /* after the last checklist page, continue into feedback naturally */
  checklistPages[checklistPages.length - 1]
    .setGoToPage(FormApp.PageNavigationType.CONTINUE);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  PropertiesService.getDocumentProperties().setProperty("atotFormId", form.getId());
  installTrigger_(ss);

  var msg = "\n=== ATOT Walkthrough form created ===\n\n" +
    "Share this link with your principals:\n" + form.getPublishedUrl() + "\n\n" +
    "Edit it here:\n" + form.getEditUrl() + "\n\n" +
    "Responses will be normalized into the \"" + SHEET_NAME + "\" tab automatically.\n";
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert("Form created", msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* no UI when run headless — the log has it */ }
  return form.getPublishedUrl();
}

function ensureRosterTab_(ss) {
  var sh = ss.getSheetByName(ROSTER_NAME);
  if (sh) return sh;
  sh = ss.insertSheet(ROSTER_NAME);
  sh.getRange("A1").setValue("Teacher name").setFontWeight("bold");
  sh.getRange("A2").setValue("(replace these with your staff, one per row)");
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 240);
  return sh;
}
function readRoster_(ss) {
  var sh = ss.getSheetByName(ROSTER_NAME);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v && v.indexOf("(replace") !== 0; });
}

/** Repopulate the teacher dropdown from the Roster tab. Run after staff changes. */
function syncRosterToForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var id = PropertiesService.getDocumentProperties().getProperty("atotFormId");
  if (!id) throw new Error("No form yet — run buildForm() first.");
  var form = FormApp.openById(id);
  var roster = readRoster_(ss);
  if (!roster.length) throw new Error("The Roster tab is empty. Add names in column A.");
  var items = form.getItems(FormApp.ItemType.LIST);
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === Q.teacher) {
      items[i].asListItem().setChoiceValues(roster);
      Logger.log("Teacher dropdown updated with " + roster.length + " names.");
      return roster.length;
    }
  }
  throw new Error("Could not find the \"" + Q.teacher + "\" question on the form.");
}

function installTrigger_(ss) {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "onAtotFormSubmit")
      ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger("onAtotFormSubmit")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
}

/* =================================================================
   RESPONSE → OBSERVATIONS ROW
   Values are placed by looking up the column NAME in the existing
   header, so the app stays the single source of truth for order.
   ================================================================= */
function onAtotFormSubmit(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var resp = e.response;
    if (!resp) return;
    var values = mapResponse_(resp);
    writeRow_(ss, values);
  } catch (err) {
    logSync_(SpreadsheetApp.getActiveSpreadsheet(), "form", "ERROR " + err);
  }
}

/** Pull a {questionTitle: answer} map out of a FormResponse. */
function answersOf_(resp) {
  var out = {};
  var items = resp.getItemResponses();
  for (var i = 0; i < items.length; i++) {
    var ir = items[i];
    out[ir.getItem().getTitle()] = ir.getResponse();
  }
  return out;
}

/** "3 — Evident (51–74%)" → 3 ; "Not observed" → "" */
function scaleToNumber_(label) {
  if (!label) return "";
  var m = String(label).match(/^([1-4])\b/);
  return m ? Number(m[1]) : "";
}

function mapResponse_(resp) {
  var a = answersOf_(resp);
  var v = {};                                  // columnName -> value

  var mode = a[Q.mode] || "";
  v["Timestamp"] = resp.getTimestamp();
  v["VisitID"]   = "form-" + resp.getId();
  v["Observer"]  = a[Q.observer] || "";
  v["School"]    = "";
  v["Teacher"]   = a[Q.teacher] || "";
  v["Grade/Subject"] = a[Q.subject] || "";
  v["Period"]    = a[Q.period] || "";
  v["Date"]      = a[Q.date] || "";
  v["Mode"]      = /Full/i.test(mode) ? "Full ATOT" : "Walkthrough";
  v["Minutes"]   = a[Q.minutes] || "";
  v["Students"]  = a[Q.students] || "";

  /* indicator scores + dimension averages */
  var allScores = [];
  for (var i = 0; i < ATOT.length; i++) {
    var d = ATOT[i];
    var grid = a[d.name] || [];                // array aligned to setRows order
    var dimScores = [];
    for (var k = 0; k < d.items.length; k++) {
      var n = scaleToNumber_(grid[k]);
      v[d.key + (k + 1)] = n;
      if (n) { dimScores.push(n); allScores.push(n); }
    }
    v[d.short + " Avg"] = dimScores.length ? round1_(avg_(dimScores)) : "";
  }
  v["Overall Avg"] = allScores.length ? round1_(avg_(allScores)) : "";
  v["Indicators Rated"] = allScores.length;

  /* checklists */
  var concerns = [];
  for (var c = 0; c < CHECKLISTS.length; c++) {
    var cl = CHECKLISTS[c];
    var g = a[cl.name] || [];
    var answered = 0, yes = 0;
    for (var j = 0; j < cl.items.length; j++) {
      var ans = g[j];
      if (ans === "Yes") { answered++; yes++; }
      else if (ans === "No") { answered++; concerns.push(cl.items[j]); }
    }
    v[cl.col] = answered ? Math.round(yes / answered * 100) : "";
  }
  v["Concerns Flagged"] = concerns.join("; ");

  /* actions — a form gives presence, not counts, so each checked item is 1 */
  var tA = a[Q.tActions] || [], sA = a[Q.sActions] || [];
  v["Teacher Actions"] = tA.map(function (x) { return x + " (1)"; }).join("; ");
  v["Student Actions"] = sA.map(function (x) { return x + " (1)"; }).join("; ");
  var off = sA.indexOf("Off task / waiting") >= 0 ? 1 : 0;
  v["Student Engagement %"] = sA.length ? Math.round((sA.length - off) / sA.length * 100) : "";

  v["Strengths"]      = a[Q.strength] || "";
  v["Growth Area"]    = a[Q.growth] || "";
  v["Next Steps"]     = a[Q.next] || "";
  v["Evidence Notes"] = a[Q.evidence] || "";
  return v;
}

/** Fallback header, used only if the app has not written one yet. */
function fallbackHeader_() {
  var h = ["Timestamp", "VisitID", "Observer", "School", "Teacher", "Grade/Subject", "Period",
           "Date", "Mode", "Minutes", "Students"];
  for (var i = 0; i < ATOT.length; i++)
    for (var k = 1; k <= ATOT[i].items.length; k++) h.push(ATOT[i].key + k);
  for (var j = 0; j < ATOT.length; j++) h.push(ATOT[j].short + " Avg");
  return h.concat(["Overall Avg", "Indicators Rated", "Room %", "Systems %", "Safety %",
    "Concerns Flagged", "Teacher Actions", "Student Actions", "Student Engagement %",
    "Strengths", "Growth Area", "Next Steps", "Evidence Notes"]);
}

function writeRow_(ss, values) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return; }
  try {
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);
    var header;
    if (sh.getLastRow() === 0) {
      header = fallbackHeader_();
      sh.appendRow(header);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground("#f2f2f2");
    } else {
      header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    }
    /* dedupe on VisitID, same as the app's path */
    var idCol = header.indexOf("VisitID") + 1;
    if (idCol > 0 && sh.getLastRow() > 1) {
      var ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++)
        if (ids[i][0] === values["VisitID"]) { logSync_(ss, values["VisitID"], "duplicate ignored"); return; }
    }
    var row = header.map(function (name) {
      return values.hasOwnProperty(name) ? values[name] : "";
    });
    sh.appendRow(row);
    logSync_(ss, values["VisitID"], "row " + sh.getLastRow() + " (from form)");
  } finally {
    lock.releaseLock();
  }
}

function logSync_(ss, visitId, note) {
  try {
    var lg = ss.getSheetByName("SyncLog");
    if (!lg) {
      lg = ss.insertSheet("SyncLog");
      lg.appendRow(["When", "VisitID", "Result"]);
      lg.setFrozenRows(1);
    }
    lg.appendRow([new Date(), visitId || "", note]);
    if (lg.getLastRow() > 2000) lg.deleteRows(2, 500);
  } catch (e) {}
}

function avg_(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
function round1_(n) { return Math.round(n * 10) / 10; }

/** Convenience: prints the form links again. */
function showFormLinks() {
  var id = PropertiesService.getDocumentProperties().getProperty("atotFormId");
  if (!id) { Logger.log("No form yet — run buildForm()."); return; }
  var f = FormApp.openById(id);
  Logger.log("Share:\n" + f.getPublishedUrl() + "\n\nEdit:\n" + f.getEditUrl());
}

/** Adds a Walkthrough menu to the Sheet for the non-technical path. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("ATOT Walkthrough")
      .addItem("Create the Google Form", "buildForm")
      .addItem("Refresh teacher dropdown from Roster", "syncRosterToForm")
      .addItem("Show form links", "showFormLinks")
      .addSeparator()
      .addItem("Build / rebuild Summary tab", "buildSummaryTab")
      .addToUi();
  } catch (e) {}
}
