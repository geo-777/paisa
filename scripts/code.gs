/**
 * Student Finance: Google Sheets mirror (write-only).
 * Paste into Extensions > Apps Script of the spreadsheet, set TOKEN, deploy as a web app.
 * The app pushes changes here. There is intentionally NO read action, so a leaked URL
 * cannot expose your data (worst case: someone writes junk rows).
 */

const TOKEN = "eDRjC5xxxq_F2sUoWB9dnmGK7bM9ZDgxeSwi2yivwsY";
const LOG = "Log";
const CATS = ["Breakfast", "Lunch", "Dinner", "Snacks", "Misc"];
const LOG_HEADER = ["id", "date", "category", "amount", "note", "created_at"];

function doGet() {
  return json_({ ok: true, service: "student-finance-mirror" });
}

function doPost(e) {
  let lock = null;
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN)
      return json_({ ok: false, error: "unauthorized" });

    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (body.action) {
      case "ping":
        return json_({ ok: true });
      case "upsert":
        upsertMany_(ss, [body.entry]);
        return json_({ ok: true });
      case "delete":
        return json_({ ok: true, deleted: deleteById_(ss, body.id) });
      case "backfill":
        if (!Array.isArray(body.entries))
          throw new Error("entries must be an array");
        if (body.entries.length > 500)
          throw new Error("max 500 entries per request");
        upsertMany_(ss, body.entries);
        return json_({ ok: true, count: body.entries.length });
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

function logSheet_(ss) {
  let sh = ss.getSheetByName(LOG);
  if (sh) return sh;
  sh = ss.insertSheet(LOG);
  sh.getRange("A:C").setNumberFormat("@"); // plain text: keeps dates as text, blocks formula injection
  sh.getRange("E:F").setNumberFormat("@");
  sh.getRange(1, 1, 1, LOG_HEADER.length)
    .setValues([LOG_HEADER])
    .setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}

function toRow_(en) {
  if (!en || typeof en.id !== "string" || !en.id)
    throw new Error("entry.id required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(en.date))
    throw new Error("entry.date must be YYYY-MM-DD");
  const cat = String(en.category || "");
  const category = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
  if (CATS.indexOf(category) === -1)
    throw new Error("invalid category: " + cat);
  const amount = Number(en.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error("invalid amount");
  return [
    en.id,
    en.date,
    category,
    amount,
    String(en.note || ""),
    String(en.createdAt || ""),
  ];
}

function upsertMany_(ss, entries) {
  const sh = logSheet_(ss);
  const last = sh.getLastRow();
  const data =
    last > 1 ? sh.getRange(2, 1, last - 1, LOG_HEADER.length).getValues() : [];
  const idx = {};
  data.forEach(function (r, i) {
    idx[r[0]] = i;
  });

  const months = {};
  entries.forEach(function (en) {
    const row = toRow_(en);
    months[en.date.slice(0, 7)] = true;
    if (idx[en.id] !== undefined) {
      data[idx[en.id]] = row;
    } else {
      idx[en.id] = data.length;
      data.push(row);
    }
  });

  if (data.length)
    sh.getRange(2, 1, data.length, LOG_HEADER.length).setValues(data);
  Object.keys(months).forEach(function (m) {
    ensureMonth_(ss, m);
  });
}

function deleteById_(ss, id) {
  const sh = logSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false; // already gone: delete is idempotent
}

/** Creates the 'YYYY-MM' tab once: Date | Breakfast | Lunch | Dinner | Snacks | Misc | Total */
function ensureMonth_(ss, ym) {
  if (ss.getSheetByName(ym)) return;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const days = new Date(y, m, 0).getDate();

  const sh = ss.insertSheet(ym);
  sh.getRange("A:A").setNumberFormat("@"); // dates stored as 'YYYY-MM-DD' text, matches Log!B

  const rows = [["Date"].concat(CATS, ["Total"])];
  const cols = ["B", "C", "D", "E", "F"];
  for (let d = 1; d <= days; d++) {
    const r = d + 1;
    const date = ym + "-" + (d < 10 ? "0" + d : d);
    const row = [date];
    cols.forEach(function (c) {
      row.push(
        "=SUMIFS(Log!$D:$D,Log!$B:$B,$A" + r + ",Log!$C:$C," + c + "$1)",
      );
    });
    row.push("=SUM(B" + r + ":F" + r + ")");
    rows.push(row);
  }
  sh.getRange(1, 1, rows.length, 7).setValues(rows);
  sh.getRange(1, 1, 1, 7).setFontWeight("bold");
  sh.getRange("F1").setNote("Misc = non-food stuff");
  sh.setFrozenRows(1);
}
