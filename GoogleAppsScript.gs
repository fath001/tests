/**
 * Google Apps Script for Exporting Questions with Formatted ASCII Tables to Google Sheets.
 * Place this code in your Google Apps Script Web App (script.google.com).
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    var examName = data.examName || "";
    var questionText = data.questionText || "";
    var questionType = data.questionType || "";
    var options = data.options || {};
    var correctAnswer = data.correctAnswer || "";
    var exportedAt = data.exportedAt || new Date().toISOString();

    var optA = options.A || "";
    var optB = options.B || "";
    var optC = options.C || "";
    var optD = options.D || "";

    // Append single row containing full formatted question (with ASCII tables as single multi-line string)
    sheet.appendRow([examName, questionText, optA, optB, optC, optD, correctAnswer, exportedAt]);

    var lastRow = sheet.getLastRow();
    var questionCellRange = sheet.getRange(lastRow, 2); // Column 2 is questionText
    questionCellRange.setWrap(true);
    questionCellRange.setFontFamily("Consolas"); // Ensures ASCII tables align perfectly in monospace font

    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Question exported successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
