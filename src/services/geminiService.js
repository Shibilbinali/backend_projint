const path = require('path');
const fs = require('fs');

/**
 * Mask the API key for secure logging
 */
function maskKey(key) {
  if (!key) return 'None';
  if (key.length <= 8) return '****';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * Custom Gemini API client to categorize books and diagnose authentication
 */
async function classifyBookWithGemini(book) {
  const apiKey = process.env.GEMINI_API_KEY;

  // Task 1 & 2 & 3: Validate key configuration
  console.log(`[Gemini Diagnosis] Checking API Key configuration...`);
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    const errorMsg = 'Google Gemini API key is missing. Please configure GEMINI_API_KEY in backend/.env.';
    console.error(`[Gemini Error] ${errorMsg}`);
    throw new Error('MISSING_API_KEY');
  }

  // Task 4: Secure logging of loaded API key
  console.log(`[Gemini Init] Loaded API key: ${maskKey(apiKey)} successfully from environment variables.`);

  // Task 9: Latest Gemini API endpoint (v1beta models/gemini-2.5-flash)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
  const requestUrl = `${endpoint}?key=${apiKey}`;
  const debugUrl = `${endpoint}?key=${maskKey(apiKey)}`;

  // Task 11: Print exact request URL and authentication method
  console.log(`[Gemini Debug] Request URL: ${debugUrl}`);
  console.log(`[Gemini Debug] Authentication Method: API Key via URL parameter`);

  // Prompt configuration requesting structured JSON output
  const prompt = `
Classify the following book into exactly one of these target categories:
Manga, Children's Story Books, Children's Picture Books, Children's Fiction, History, Science & Technology, Geography & Travel, Animals & Nature, Classics.

Book Details:
Title: "${book.title}"
Author: "${book.author}"
Description: "${book.description || 'N/A'}"
Publisher: "${book.publisher || 'N/A'}"

Return ONLY a valid JSON object matching this schema, without markdown formatting or code blocks:
{
  "primaryCategoryName": "CategoryName",
  "secondaryCategoryNames": ["SecCategory1", "SecCategory2"],
  "confidence": 0.0 to 1.0,
  "needsManualReview": true or false,
  "notes": "Short explanation of classification reasoning"
}
  `.trim();

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = responseText;
    }

    // Task 10: Robust error handling based on status codes and message structures
    if (!response.ok) {
      console.error(`[Gemini Error] HTTP ${response.status} Error Response:`, data);
      
      const errorMsg = data.error?.message || '';
      const errorStatus = data.error?.status || '';

      // Check for Invalid API Key
      if (response.status === 400 && (errorMsg.includes('API key not valid') || errorMsg.includes('API_KEY_INVALID'))) {
        throw new Error('INVALID_API_KEY');
      }

      // Check for Expired OAuth token or Invalid Credentials
      if (response.status === 401 || errorStatus === 'UNAUTHENTICATED' || errorMsg.includes('invalid authentication credentials') || errorMsg.includes('invalid_token')) {
        throw new Error('EXPIRED_OAUTH_TOKEN');
      }

      // Check for Unauthorized project access or project permission problems
      if (response.status === 403 || errorStatus === 'PERMISSION_DENIED' || errorMsg.includes('permission') || errorMsg.includes('not enabled')) {
        throw new Error('UNAUTHORIZED_PROJECT_ACCESS');
      }

      throw new Error(`API_ERROR: HTTP ${response.status} - ${errorMsg}`);
    }

    // Parse the result from the text block
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('INVALID_RESPONSE_FORMAT');
    }

    const classification = JSON.parse(text);
    return classification;

  } catch (err) {
    // Re-throw handled errors
    const handledErrors = ['MISSING_API_KEY', 'INVALID_API_KEY', 'EXPIRED_OAUTH_TOKEN', 'UNAUTHORIZED_PROJECT_ACCESS'];
    if (handledErrors.includes(err.message)) {
      throw err;
    }

    // Analyze native connection error or system errors
    console.error(`[Gemini Error] Request failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  classifyBookWithGemini,
  maskKey
};
