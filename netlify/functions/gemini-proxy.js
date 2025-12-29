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
  'gemini-3-pro-preview',
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
exports.handler = async (event) => {
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
    const model = body.model || 'gemini-3-pro-preview'; // Default model
    const contents = body.contents;
    const config = body.config || {};

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
