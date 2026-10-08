/**
 * Student Finance: Google Sheets mirror (write-only).
 * Paste into Extensions > Apps Script of the spreadsheet, set TOKEN, deploy as a web app.
 * The app pushes changes here. There is intentionally NO read action, so a leaked URL
 * cannot expose your data (worst case: someone writes junk rows).
 */

const TOKEN = "2V8WEoZH9MpDJadqEDmMzah07fI1CgL1yyCLCwsB";
const CATS = ["breakfast", "lunch", "dinner", "snacks", "misc"];
const HEADERS = [
  "Date",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
  "Misc",
  "Total",
];
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function doGet() {
  return json_({ ok: true, service: "student-finance-mirror", version: 2 });
}

function doPost(e) {
  let lock = null;
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN)
      return json_({ ok: false, error: "unauthorized" });

    lock = LockService.getScriptLock();
    lock.waitLock(20000);

    switch (body.action) {
      case "ping":
        return json_({ ok: true });
      case "syncMonth": {
        if (!Array.isArray(body.rows)) throw new Error("rows must be an array");
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const tab = syncMonth_(ss, body.month, body.rows);
        return json_({ ok: true, tab: tab });
      }
      default:
        return json_({ ok: false, error: "unknown action" });
    }
  } catch (err) {
    return json_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function pad_(n) {
  return n < 10 ? "0" + n : String(n);
}

function tabName_(y, m) {
  return MONTH_NAMES[m - 1] + "-" + y; // e.g. october-2026
}

function dateLabel_(d, m, y) {
  return pad_(d) + "-" + pad_(m) + "-" + String(y).slice(2); // e.g. 08-10-26
}

function amount_(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (!isFinite(n) || n < 0) throw new Error("invalid amount: " + v);
  return Math.round(n * 100) / 100;
}

/**
 * rows: [{ date: 'YYYY-MM-DD', breakfast, lunch, dinner, snacks, misc }] (only days with spending needed).
 * Rewrites every day of the month, so the tab always matches the app. Idempotent.
 */
function syncMonth_(ss, month, rows) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))
    throw new Error("month must be YYYY-MM");
  if (rows.length > 31) throw new Error("too many rows");
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const days = new Date(y, m, 0).getDate();

  const byDate = {};
  rows.forEach(function (r) {
    if (
      !r ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      r.date.slice(0, 7) !== month
    ) {
      throw new Error("row date outside month: " + (r && r.date));
    }
    byDate[r.date] = r;
  });

  const name = tabName_(y, m);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS])
      .setFontWeight("bold");
    sh.getRange("F1").setNote("Misc = non-food stuff");
    sh.setFrozenRows(1);
  }
  sh.getRange("A:A").setNumberFormat("@"); // keep dd-mm-yy as plain text

  const out = [];
  for (let d = 1; d <= days; d++) {
    const r = byDate[month + "-" + pad_(d)] || {};
    const row = [dateLabel_(d, m, y)];
    CATS.forEach(function (c) {
      row.push(amount_(r[c]));
    });
    row.push("=SUM(B" + (d + 1) + ":F" + (d + 1) + ")");
    out.push(row);
  }
  sh.getRange(2, 1, days, HEADERS.length).setValues(out);
  return name;
}
