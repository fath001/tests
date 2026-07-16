export const exportQuestionToGoogleSheet = async (req, res) => {
  try {
    const sheetUrl = process.env.GOOGLE_SHEETS_WEB_APP_URL;

    if (!sheetUrl) {
      return res.status(500).json({
        message: "GOOGLE_SHEETS_WEB_APP_URL is not configured on the backend",
      });
    }

    const response = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...req.body,
        exportedAt: new Date().toISOString(),
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        message: "Google Sheets export failed",
        details: responseText,
      });
    }

    res.json({
      message: "Question exported to Google Sheet",
      details: responseText,
    });
  } catch (error) {
    res.status(500).json({
      message: "Google Sheets export failed",
      details: error.message,
    });
  }
};
