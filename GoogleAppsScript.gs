/**
 * Google Apps Script for Exporting Questions with Tables & Formatting to Google Sheets.
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
    var blocks = data.blocks || [];
    var tables = data.tables || [];

    var optA = options.A || "";
    var optB = options.B || "";
    var optC = options.C || "";
    var optD = options.D || "";

    // If structured blocks exist, handle detailed table placement
    if (blocks && blocks.length > 0) {
      for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        if (block.type === "text") {
          var lines = block.text.split("\n");
          for (var l = 0; l < lines.length; l++) {
            if (lines[l].trim()) {
              sheet.appendRow([examName, lines[l].trim(), optA, optB, optC, optD, correctAnswer, exportedAt]);
            }
          }
        } else if (block.type === "table" && block.grid) {
          var startRow = sheet.getLastRow() + 1;
          for (var r = 0; r < block.grid.length; r++) {
            var rowData = block.grid[r];
            var rowValues = [examName];
            for (var c = 0; c < rowData.length; c++) {
              rowValues.push(rowData[c].text || "");
            }
            // Add options on the right if applicable
            if (r === 0) {
              rowValues.push(optA, optB, optC, optD, correctAnswer, exportedAt);
            }
            sheet.appendRow(rowValues);

            var currentRowNum = startRow + r;
            // Format table cells
            for (var c = 0; c < rowData.length; c++) {
              var cellObj = rowData[c];
              var cellRange = sheet.getRange(currentRowNum, c + 2); // column offset after examName
              if (cellObj.isHeader || cellObj.bold) {
                cellRange.setFontWeight("bold");
              }
              if (cellObj.align) {
                cellRange.setHorizontalAlignment(cellObj.align);
              }
              cellRange.setBorder(true, true, true, true, null, null);
              cellRange.setWrap(true);
            }
          }
        }
      }
    } else {
      // Standard append for single-line or tabbed text
      var lines = questionText.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.includes("\t")) {
          var cells = line.split("\t");
          var rowData = [examName].concat(cells);
          if (i === 0) {
            rowData.push(optA, optB, optC, optD, correctAnswer, exportedAt);
          }
          sheet.appendRow(rowData);
        } else if (line.trim()) {
          sheet.appendRow([examName, line.trim(), optA, optB, optC, optD, correctAnswer, exportedAt]);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Question exported successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
