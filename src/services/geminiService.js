const path = require('path');
const fs = require('fs');

class Semaphore {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.waiting = [];
  }

  async acquire() {
    if (this.count < this.max) {
      this.count++;
      return;
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  release() {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve();
    } else {
      this.count--;
    }
  }
}

// Global semaphore for Gemini API requests (max 5 concurrent requests)
const geminiSemaphore = new Semaphore(5);

const FALLBACK_MODELS = [
  'gemini-3.5-flash-low',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
];

/**
 * Mask the API key for secure logging
 */
function maskKey(key) {
  if (!key) return 'None';
  if (key.length <= 8) return '****';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * Pause execution for ms milliseconds
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function executeGeminiRequest(model, payload, apiKey, attempt = 1) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const requestUrl = `${endpoint}?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = responseText;
    }

    if (!response.ok) {
      const errorMsg = data.error?.message || '';
      const errorStatus = data.error?.status || '';
      const errorReason = data.error?.details?.[0]?.reason || '';

      if (response.status === 400 && (errorMsg.includes('API key not valid') || errorMsg.includes('API_KEY_INVALID'))) {
        throw new Error('INVALID_API_KEY');
      }
      if (response.status === 401 || errorStatus === 'UNAUTHENTICATED' || errorMsg.includes('invalid authentication credentials') || errorMsg.includes('invalid_token')) {
        throw new Error('EXPIRED_OAUTH_TOKEN');
      }
      if (response.status === 403 || errorStatus === 'PERMISSION_DENIED' || errorMsg.includes('permission') || errorMsg.includes('not enabled')) {
        throw new Error('UNAUTHORIZED_PROJECT_ACCESS');
      }

      // Check for Capacity or Rate Limit issues
      if (response.status === 503 || response.status === 429 || errorReason === 'MODEL_CAPACITY_EXHAUSTED' || errorMsg.includes('capacity')) {
        const capacityErr = new Error(`CAPACITY_EXHAUSTED: ${errorMsg}`);
        capacityErr.status = response.status;
        capacityErr.isRetryable = true;
        throw capacityErr;
      }

      throw new Error(`API_ERROR: HTTP ${response.status} - ${errorMsg}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('INVALID_RESPONSE_FORMAT');
    }

    return JSON.parse(text);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('REQUEST_TIMEOUT: Gemini API took too long to respond.');
      timeoutErr.isRetryable = true;
      throw timeoutErr;
    }
    // Network errors (fetch failed)
    if (err.cause || err.message.includes('fetch')) {
      const netErr = new Error(`NETWORK_ERROR: ${err.message}`);
      netErr.isRetryable = true;
      throw netErr;
    }
    throw err;
  }
}

/**
 * Custom Gemini API client to categorize books and diagnose authentication
 */
async function classifyBookWithGemini(book) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    console.error(`[Gemini Error] Google Gemini API key is missing.`);
    throw new Error('MISSING_API_KEY');
  }

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
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  // Queue up until concurrent limit allows execution
  await geminiSemaphore.acquire();

  try {
    const MAX_RETRIES_PER_MODEL = 3;
    
    // Fallback logic
    for (let modelIndex = 0; modelIndex < FALLBACK_MODELS.length; modelIndex++) {
      const currentModel = FALLBACK_MODELS[modelIndex];
      let delayMs = 1000; // start with 1 second backoff

      for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          console.log(`[Gemini Info] Attempting classification with model: ${currentModel} (Attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`);
          const classification = await executeGeminiRequest(currentModel, payload, apiKey, attempt);
          console.log(`[Gemini Success] Successfully categorized using ${currentModel}`);
          return classification;
        } catch (err) {
          if (err.isRetryable) {
            console.warn(`[Gemini Warn] Model ${currentModel} encountered temporary failure: ${err.message}`);
            if (attempt < MAX_RETRIES_PER_MODEL) {
              console.log(`[Gemini Retry] Waiting ${delayMs}ms before retrying ${currentModel}...`);
              await delay(delayMs);
              delayMs *= 2; // Exponential backoff
            } else {
              console.warn(`[Gemini Fallback] Max retries reached for ${currentModel}. Falling back to next model.`);
            }
          } else {
            // Fatal error, propagate upwards immediately
            throw err;
          }
        }
      }
    }

    // If we exhaust all models
    console.error(`[Gemini Error] All fallback models exhausted due to capacity or network issues.`);
    throw new Error('ALL_MODELS_EXHAUSTED');
  } catch (err) {
    const handledErrors = ['MISSING_API_KEY', 'INVALID_API_KEY', 'EXPIRED_OAUTH_TOKEN', 'UNAUTHORIZED_PROJECT_ACCESS', 'ALL_MODELS_EXHAUSTED'];
    if (handledErrors.includes(err.message)) {
      throw err;
    }
    console.error(`[Gemini Error] Request failed: ${err.message}`);
    throw err;
  } finally {
    geminiSemaphore.release();
  }
}

module.exports = {
  classifyBookWithGemini,
  maskKey
};
