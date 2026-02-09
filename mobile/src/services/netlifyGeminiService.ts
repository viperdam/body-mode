/**
 * Netlify Gemini Service - Secure API Wrapper
 *
 * This service replaces direct Gemini API calls with calls to our Netlify serverless function.
 * Benefits:
 * - API key never exposed in mobile app
 * - API key stored securely on server
 * - Same interface as original geminiService
 * - Easy to switch between development and production
 */

import { getIntegrityHeaders } from './integrityService';
import i18n from '../i18n';

export type GeminiUploadPayload = {
  dataBase64: string;
  mimeType: string;
  fileName?: string;
};

// CONFIGURATION: Update this after deploying to Netlify
const NETLIFY_FUNCTION_URL = __DEV__
  ? 'http://localhost:8888/.netlify/functions/gemini-proxy' // Local development
  : 'https://bodymode.netlify.app/.netlify/functions/gemini-proxy'; // Production

/**
 * Call Netlify serverless function to proxy Gemini API request
 *
 * @param model - Gemini model to use (e.g., 'gemini-1.5-flash')
 * @param contents - Request contents (text, images, etc.)
 * @param config - Generation config (temperature, systemInstruction, etc.)
 * @param timeout - Request timeout in milliseconds (default: 45s)
 * @returns Gemini API response
 */
const normalizeSystemInstruction = (instruction: any) => {
  if (!instruction) return undefined;
  if (typeof instruction === 'string') {
    return { role: 'system', parts: [{ text: instruction }] };
  }
  if (Array.isArray(instruction.parts)) {
    return instruction;
  }
  if (instruction.text) {
    return { role: instruction.role || 'system', parts: [{ text: instruction.text }] };
  }
  return instruction;
};

const callNetlifyGeminiRequest = async (
  body: { model: string; contents: any; config: any; upload?: GeminiUploadPayload },
  timeout: number
): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`[Netlify Gemini] Calling function: ${body.model}`);

    const integrityHeaders = await getIntegrityHeaders();

    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...integrityHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      if (errorText) {
        try {
          const parsed = JSON.parse(errorText);
          errorMessage = parsed.error || parsed.message || errorText;
        } catch {
          errorMessage = errorText;
        }
      }

      const error: any = new Error(errorMessage);
      error.status = response.status;
      error.code = response.status;
      error.name = 'NetlifyGeminiError';
      throw error;
    }

    const result = await response.json();

    // Extract text from response (matches @google/genai format)
    if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
      result.text = result.candidates[0].content.parts[0].text;
    }

    return result;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Handle timeout
    if (error.name === 'AbortError') {
      throw new Error(i18n.t('errors.llm.timeout'));
    }

    // Handle network errors
    if (error.message.includes('fetch failed') || error.message.includes('Network request failed')) {
      throw new Error(i18n.t('errors.llm.network'));
    }

    // Re-throw other errors
    throw error;
  }
};

/**
 * Call Netlify serverless function to proxy Gemini API request
 *
 * @param model - Gemini model to use (e.g., 'gemini-1.5-flash')
 * @param contents - Request contents (text, images, etc.)
 * @param config - Generation config (temperature, systemInstruction, etc.)
 * @param timeout - Request timeout in milliseconds (default: 45s)
 * @returns Gemini API response
 */
export async function callNetlifyGemini(
  model: string,
  contents: any,
  config: any = {},
  timeout: number = 45000
): Promise<any> {
  const safeConfig = {
    ...config,
    systemInstruction: normalizeSystemInstruction(config.systemInstruction),
  };

  return callNetlifyGeminiRequest(
    {
      model,
      contents,
      config: safeConfig,
    },
    timeout
  );
}

export async function callNetlifyGeminiWithUpload(
  model: string,
  contents: any,
  upload: GeminiUploadPayload,
  config: any = {},
  timeout: number = 90000
): Promise<any> {
  const safeConfig = {
    ...config,
    systemInstruction: normalizeSystemInstruction(config.systemInstruction),
  };

  return callNetlifyGeminiRequest(
    {
      model,
      contents,
      config: safeConfig,
      upload,
    },
    timeout
  );
}

/**
 * Check if Netlify function is accessible (health check)
 */
export async function isNetlifyFunctionAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Try to reach the function (will return 405 for GET, but that confirms it's there)
    const response = await fetch(NETLIFY_FUNCTION_URL, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // 405 (Method Not Allowed) means function is running but we used wrong method
    // This is expected and confirms the function is available
    return response.status === 405 || response.status === 200;

  } catch (error) {
    console.warn('[Netlify Gemini] Function not available:', error);
    return false;
  }
}

/**
 * Get Netlify function URL (for debugging)
 */
export function getNetlifyFunctionUrl(): string {
  return NETLIFY_FUNCTION_URL;
}

/**
 * Update production URL after deployment
 * Call this from your app initialization if you want to configure dynamically
 */
export function setNetlifyFunctionUrl(url: string): void {
  // This would modify a mutable variable if we wanted dynamic config
  console.log(`[Netlify Gemini] Production URL should be updated in code to: ${url}`);
}
