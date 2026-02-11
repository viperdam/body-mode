/**
 * Netlify Serverless Function: Gemini API Proxy
 *
 * PURPOSE: Securely proxy requests to Google Gemini API
 * - API key stored server-side only (never exposed to client)
 * - Validates requests to prevent abuse
 * - Handles errors gracefully
 * - Supports all Gemini API endpoints
 *
 * USAGE FROM MOBILE APP:
 * POST https://your-app.netlify.app/.netlify/functions/gemini-proxy
 *
 * REQUEST BODY:
 * {
 *   "model": "gemini-1.5-flash",
 *   "contents": { parts: [{ text: "prompt here" }] },
 *   "config": { temperature: 0.7, ... }
 * }
 *
 * RESPONSE:
 * {
 *   "text": "AI generated response",
 *   "candidates": [...],
 *   ...
 * }
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ALLOWED_MODELS = [
  // User's preferred models
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-robotics-er-1.5-preview',
  // Also support current Google models
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-001',
];
const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024;
const FILE_POLL_INTERVAL_MS = 1000;
const FILE_POLL_MAX_ATTEMPTS = 15;

const estimateBytesFromBase64 = (dataBase64) => {
  if (!dataBase64 || typeof dataBase64 !== 'string') return 0;
  const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((dataBase64.length * 3) / 4) - padding);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadMedia = async (apiKey, upload) => {
  const { dataBase64, mimeType, fileName } = upload;
  const buffer = Buffer.from(dataBase64, 'base64');
  const endpoint = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

  console.log(`[Gemini Proxy] Uploading media (${buffer.length} bytes, ${mimeType})`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'raw',
      'X-Goog-Upload-File-Name': fileName || 'upload',
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini Proxy] Upload error ${response.status}:`, errorText);
    throw new Error(`Gemini upload error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.file || result;
};

const waitForFileActive = async (apiKey, fileName) => {
  const endpoint = `${GEMINI_API_BASE}/${fileName}?key=${apiKey}`;
  let lastState = 'UNKNOWN';

  for (let attempt = 0; attempt < FILE_POLL_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(endpoint);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini file status error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const file = result.file || result;
    const state = file.state || 'ACTIVE';
    lastState = state;

    if (state === 'ACTIVE') {
      return file;
    }

    if (state === 'FAILED') {
      throw new Error('Gemini file processing failed');
    }

    await sleep(FILE_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for file to become ACTIVE (last state: ${lastState})`);
};

const injectFileData = (contents, fileUri, mimeType) => {
  const filePart = { fileData: { fileUri, mimeType } };

  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [filePart, { text: contents }] }];
  }

  if (Array.isArray(contents)) {
    if (!contents.length) {
      return [{ role: 'user', parts: [filePart] }];
    }

    const [first, ...rest] = contents;
    const parts = Array.isArray(first?.parts) ? [filePart, ...first.parts] : [filePart];
    return [{ ...first, parts }, ...rest];
  }

  if (contents && Array.isArray(contents.parts)) {
    return { ...contents, parts: [filePart, ...contents.parts] };
  }

  throw new Error('Invalid contents format for media upload');
};

/**
 * Validate request to prevent abuse
 */
function validateRequest(body) {
  // Check required fields
  if (!body.contents) {
    return { valid: false, error: 'Missing required field: contents' };
  }

  // Check model (optional - will use default if not provided)
  if (body.model && !ALLOWED_MODELS.includes(body.model)) {
    return { valid: false, error: `Invalid model. Allowed: ${ALLOWED_MODELS.join(', ')}` };
  }

  if (body.upload) {
    if (typeof body.upload.dataBase64 !== 'string' || !body.upload.dataBase64.length) {
      return { valid: false, error: 'Missing required field: upload.dataBase64' };
    }
    if (typeof body.upload.mimeType !== 'string' || !body.upload.mimeType.length) {
      return { valid: false, error: 'Missing required field: upload.mimeType' };
    }

    const uploadBytes = estimateBytesFromBase64(body.upload.dataBase64);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      return { valid: false, error: `Upload too large. Maximum ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.` };
    }
  }

  // Basic size check to prevent massive requests
  // Increased to 1GB to support large media files
  const requestSize = JSON.stringify(body).length;
  if (requestSize > 1000000000) { // 1GB limit
    return { valid: false, error: 'Request too large. Maximum 1GB.' };
  }

  return { valid: true };
}

/**
 * Call Gemini API
 */
async function callGeminiAPI(apiKey, model, contents, config = {}) {
  const endpoint = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents,
    generationConfig: config.generationConfig || {},
    safetySettings: config.safetySettings || [],
  };

  const normalizeSystemInstruction = (instruction) => {
    if (!instruction) return undefined;
    // Gemini API expects system_instruction as { parts: [{ text: "..." }] }
    // WITHOUT a 'role' field (unlike regular contents)
    if (typeof instruction === 'string') {
      return {
        parts: [{ text: instruction }],
      };
    }
    if (instruction.parts && Array.isArray(instruction.parts)) {
      // Remove role if present
      return { parts: instruction.parts };
    }
    if (instruction.text) {
      return {
        parts: [{ text: instruction.text }],
      };
    }
    // Fallback: try to use as-is but strip role if present
    const { role, ...rest } = instruction;
    return rest;
  };

  // Add system instruction if provided
  if (config.systemInstruction) {
    const normalized = normalizeSystemInstruction(config.systemInstruction);
    console.log('[Gemini Proxy v2.0] Normalized systemInstruction:', JSON.stringify(normalized));
    requestBody.systemInstruction = normalized;
  }

  // Add response format if provided
  if (config.responseMimeType) {
    requestBody.generationConfig.responseMimeType = config.responseMimeType;
  }

  if (config.responseSchema) {
    requestBody.generationConfig.responseSchema = config.responseSchema;
  }

  // Pass thinking config (allows disabling/limiting thinking tokens for speed)
  if (config.thinkingConfig) {
    requestBody.generationConfig.thinkingConfig = config.thinkingConfig;
  }

  console.log(`[Gemini Proxy] Calling ${model} with ${JSON.stringify(contents).length} bytes`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini Proxy] API Error ${response.status}:`, errorText);

    // Return detailed error for debugging
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Main handler function
 */
export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allow from mobile app
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  try {
    // Get API key from environment variable (SERVER-SIDE ONLY)
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('[Gemini Proxy] GEMINI_API_KEY not set in environment variables');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Server configuration error. API key not configured.'
        }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: validation.error }),
      };
    }

    // Extract parameters
    const model = body.model || 'gemini-3-flash-preview'; // Default model
    let contents = body.contents;
    const config = body.config || {};

    if (body.upload) {
      const uploadResult = await uploadMedia(apiKey, body.upload);
      if (!uploadResult?.name) {
        throw new Error('Gemini upload did not return a file name');
      }

      const file = await waitForFileActive(apiKey, uploadResult.name);
      const fileUri = uploadResult.uri || file.uri || uploadResult.fileUri || file.name;
      if (!fileUri) {
        throw new Error('Gemini upload did not return a file URI');
      }

      const uploadMimeType = uploadResult.mimeType || body.upload.mimeType;
      contents = injectFileData(contents, fileUri, uploadMimeType);
    }

    // Call Gemini API
    const result = await callGeminiAPI(apiKey, model, contents, config);

    // Return successful response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('[Gemini Proxy] Error:', error);

    // Determine status code based on error
    let statusCode = 500;
    let errorMessage = error.message || 'Internal server error';

    // Handle quota errors (429)
    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
      statusCode = 429;
      errorMessage = 'API quota exceeded. Please try again later.';
    }

    // Handle network errors
    if (errorMessage.includes('fetch failed') || errorMessage.includes('network')) {
      statusCode = 503;
      errorMessage = 'Unable to reach Gemini API. Please try again.';
    }

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
    };
  }
};
