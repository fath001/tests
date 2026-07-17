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

    // Append single row containing full formatted question
    sheet.appendRow([examName, questionText, optA, optB, optC, optD, correctAnswer, exportedAt]);

    var lastRow = sheet.getLastRow();
    var questionCellRange = sheet.getRange(lastRow, 2); // Column 2 is questionText

    // Format cell properties for perfect ASCII table display
    questionCellRange.setFontFamily("Courier New");
    questionCellRange.setWrap(true);
    questionCellRange.setVerticalAlignment("top");
    questionCellRange.setHorizontalAlignment("left");

    // Apply bold style to the header row of ASCII tables if present
    if (questionText.indexOf("+") !== -1 && questionText.indexOf("|") !== -1) {
      var lines = questionText.split("\n");
      var builder = SpreadsheetApp.newRichTextValue().setText(questionText);
      var currentIndex = 0;
      var isFirstHeaderLine = false;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf("+") === 0) {
          if (!isFirstHeaderLine) {
            isFirstHeaderLine = true; // Next line is the header row
          } else {
            isFirstHeaderLine = false; // Divider after header row
          }
        } else if (isFirstHeaderLine && line.indexOf("|") === 0) {
          builder.setTextStyle(currentIndex, currentIndex + line.length, SpreadsheetApp.newTextStyle().setBold(true).build());
          isFirstHeaderLine = false;
        }
        currentIndex += line.length + 1; // +1 for \n
      }

      var richText = builder.build();
      questionCellRange.setRichTextValue(richText);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Question exported successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
