const { GoogleAuth } = require('google-auth-library');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const PLAY_INTEGRITY_PACKAGE_NAME = process.env.PLAY_INTEGRITY_PACKAGE_NAME || '';
const PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON = process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON || '';
const ENFORCE_ANDROID_INTEGRITY = process.env.ENFORCE_ANDROID_INTEGRITY !== 'false';
const ENFORCE_IOS_INTEGRITY = process.env.ENFORCE_IOS_INTEGRITY === 'true';
const ALLOW_INTEGRITY_BYPASS = process.env.ALLOW_INTEGRITY_BYPASS === 'true';

const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024;
const FILE_POLL_INTERVAL_MS = 1000;
const FILE_POLL_MAX_ATTEMPTS = 15;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin || ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.includes(origin);
};

const buildCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin || '*' : 'null',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Integrity-Provider, X-Integrity-Token, X-Integrity-Nonce, X-App-Instance, X-App-Platform',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

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

const callGeminiAPI = async (apiKey, model, contents, config = {}) => {
  const endpoint = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents,
    generationConfig: config.generationConfig || {},
    safetySettings: config.safetySettings || [],
  };

  const normalizeSystemInstruction = (instruction) => {
    if (!instruction) return undefined;
    if (typeof instruction === 'string') {
      return { parts: [{ text: instruction }] };
    }
    if (instruction.parts && Array.isArray(instruction.parts)) {
      return { parts: instruction.parts };
    }
    if (instruction.text) {
      return { parts: [{ text: instruction.text }] };
    }
    const { role, ...rest } = instruction || {};
    return rest;
  };

  if (config.systemInstruction) {
    requestBody.systemInstruction = normalizeSystemInstruction(config.systemInstruction);
  }

  if (config.responseMimeType) {
    requestBody.generationConfig.responseMimeType = config.responseMimeType;
  }

  if (config.responseSchema) {
    requestBody.generationConfig.responseSchema = config.responseSchema;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  return await response.json();
};

const verifyPlayIntegrity = async (token) => {
  if (!PLAY_INTEGRITY_PACKAGE_NAME || !PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON) {
    return { ok: false, reason: 'play_integrity_not_configured' };
  }

  let credentials;
  try {
    credentials = JSON.parse(PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    return { ok: false, reason: 'invalid_service_account_json' };
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const bearer = typeof accessToken === 'string' ? accessToken : accessToken?.token;
  if (!bearer) {
    return { ok: false, reason: 'play_integrity_auth_failed' };
  }

  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${PLAY_INTEGRITY_PACKAGE_NAME}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrityToken: token }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    return { ok: false, reason: `play_integrity_http_${response.status}`, detail: errorBody };
  }

  const result = await response.json();
  const payload = result?.tokenPayloadExternal || {};
  const appVerdict = payload?.appIntegrity?.appRecognitionVerdict;

  if (appVerdict !== 'PLAY_RECOGNIZED') {
    return { ok: false, reason: `app_unrecognized_${appVerdict || 'unknown'}` };
  }

  return { ok: true, payload };
};

const verifyIntegrity = async ({ provider, token }) => {
  if (!provider || !token) {
    return { ok: false, reason: 'missing_integrity_headers' };
  }

  if (provider === 'play_integrity') {
    return verifyPlayIntegrity(token);
  }

  if (provider === 'app_attest') {
    if (ENFORCE_IOS_INTEGRITY) {
      return { ok: false, reason: 'app_attest_not_configured' };
    }
    return { ok: true, payload: { warning: 'ios_integrity_not_enforced' } };
  }

  return { ok: false, reason: `unknown_provider_${provider}` };
};

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: buildCorsHeaders(origin),
      body: '',
    };
  }

  if (!isOriginAllowed(origin)) {
    return {
      statusCode: 403,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: 'Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
    };
  }

  const provider = (event.headers['x-integrity-provider'] || '').toLowerCase();
  const token = event.headers['x-integrity-token'];
  const integrityRequired = ENFORCE_ANDROID_INTEGRITY || ENFORCE_IOS_INTEGRITY;

  if (provider === 'play_integrity' && ENFORCE_ANDROID_INTEGRITY) {
    const integrity = await verifyIntegrity({ provider, token });
    if (!integrity.ok) {
      if (ALLOW_INTEGRITY_BYPASS) {
        console.warn('[Gemini Proxy] Integrity failed, bypassing due to ALLOW_INTEGRITY_BYPASS:', integrity.reason);
      } else {
        return {
          statusCode: 403,
          headers: buildCorsHeaders(origin),
          body: JSON.stringify({ error: 'Integrity verification failed', reason: integrity.reason }),
        };
      }
    }
  } else if (provider === 'app_attest' && ENFORCE_IOS_INTEGRITY) {
    const integrity = await verifyIntegrity({ provider, token });
    if (!integrity.ok) {
      if (ALLOW_INTEGRITY_BYPASS) {
        console.warn('[Gemini Proxy] Integrity failed, bypassing due to ALLOW_INTEGRITY_BYPASS:', integrity.reason);
      } else {
        return {
          statusCode: 403,
          headers: buildCorsHeaders(origin),
          body: JSON.stringify({ error: 'Integrity verification failed', reason: integrity.reason }),
        };
      }
    }
  } else if ((!provider || provider === 'none') && integrityRequired && !ALLOW_INTEGRITY_BYPASS) {
    return {
      statusCode: 403,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: 'Integrity verification required' }),
    };
  } else if (!provider && integrityRequired && ALLOW_INTEGRITY_BYPASS) {
    console.warn('[Gemini Proxy] Missing integrity headers, bypassing due to ALLOW_INTEGRITY_BYPASS.');
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { model, contents: rawContents, config, upload } = body;
  if (!model || !rawContents) {
    return {
      statusCode: 400,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: 'Missing model or contents' }),
    };
  }

  let contents = rawContents;

  if (upload) {
    if (typeof upload.dataBase64 !== 'string' || !upload.dataBase64.length) {
      return {
        statusCode: 400,
        headers: buildCorsHeaders(origin),
        body: JSON.stringify({ error: 'Missing upload.dataBase64' }),
      };
    }
    if (typeof upload.mimeType !== 'string' || !upload.mimeType.length) {
      return {
        statusCode: 400,
        headers: buildCorsHeaders(origin),
        body: JSON.stringify({ error: 'Missing upload.mimeType' }),
      };
    }

    const uploadBytes = estimateBytesFromBase64(upload.dataBase64);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      return {
        statusCode: 413,
        headers: buildCorsHeaders(origin),
        body: JSON.stringify({ error: `Upload too large. Maximum ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.` }),
      };
    }

    const uploadResult = await uploadMedia(GEMINI_API_KEY, upload);
    if (!uploadResult?.name) {
      return {
        statusCode: 502,
        headers: buildCorsHeaders(origin),
        body: JSON.stringify({ error: 'Gemini upload did not return a file name' }),
      };
    }

    const file = await waitForFileActive(GEMINI_API_KEY, uploadResult.name);
    const fileUri = uploadResult.uri || file.uri || uploadResult.fileUri || file.name;
    if (!fileUri) {
      return {
        statusCode: 502,
        headers: buildCorsHeaders(origin),
        body: JSON.stringify({ error: 'Gemini upload did not return a file URI' }),
      };
    }

    const uploadMimeType = uploadResult.mimeType || upload.mimeType;
    contents = injectFileData(contents, fileUri, uploadMimeType);
  }

  try {
    const result = await callGeminiAPI(GEMINI_API_KEY, model, contents, config || {});
    return {
      statusCode: 200,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify(result),
    };
  } catch (error) {
    const message = error?.message || 'Gemini API error';
    return {
      statusCode: 502,
      headers: buildCorsHeaders(origin),
      body: JSON.stringify({ error: message }),
    };
  }
};
