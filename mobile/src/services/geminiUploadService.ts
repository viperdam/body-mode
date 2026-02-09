import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import i18n from '../i18n';

type GeminiFile = {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: string;
};

type UploadParams = {
  fileUri: string;
  mimeType: string;
  fileName?: string;
};

const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com';
const FILE_POLL_INTERVAL_MS = 1000;
const FILE_POLL_MAX_ATTEMPTS = 15;
const UPLOAD_TIMEOUT_MS = 120000;
const buildFileUriFromName = (name?: string): string | undefined =>
  name ? `${GEMINI_UPLOAD_BASE}/v1beta/${name}` : undefined;

const getUploadApiKey = (): string => {
  const directKey = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_KEY;
  if (directKey && directKey.length > 10) return directKey;

  const fallbackKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (fallbackKey && fallbackKey.length > 10) return fallbackKey;

  return '';
};

export const isDirectUploadAvailable = (): boolean => {
  return getUploadApiKey().length > 10;
};

// Log API key status at module load for debugging
console.log('[GeminiUpload] Module loaded - API key status:', {
  hasUploadKey: !!(process.env.EXPO_PUBLIC_GEMINI_UPLOAD_KEY && process.env.EXPO_PUBLIC_GEMINI_UPLOAD_KEY.length > 10),
  hasApiKey: !!(process.env.EXPO_PUBLIC_GEMINI_API_KEY && process.env.EXPO_PUBLIC_GEMINI_API_KEY.length > 10),
  directUploadAvailable: isDirectUploadAvailable(),
  uploadKeyPrefix: process.env.EXPO_PUBLIC_GEMINI_UPLOAD_KEY?.substring(0, 8) || 'NOT_SET',
  apiKeyPrefix: process.env.EXPO_PUBLIC_GEMINI_API_KEY?.substring(0, 8) || 'NOT_SET',
});

/**
 * Diagnostic function to check video upload configuration
 * Call this to verify your setup is correct for video uploads
 */
export const diagnoseVideoUploadSetup = (): {
  isReady: boolean;
  issues: string[];
  details: Record<string, any>;
} => {
  const issues: string[] = [];
  const details: Record<string, any> = {};

  // Check API key availability
  const uploadKey = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_KEY;
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  details.hasUploadKey = !!(uploadKey && uploadKey.length > 10);
  details.hasApiKey = !!(apiKey && apiKey.length > 10);
  details.uploadKeyLength = uploadKey?.length || 0;
  details.apiKeyLength = apiKey?.length || 0;
  details.directUploadAvailable = isDirectUploadAvailable();
  details.platform = Platform.OS;

  if (!details.directUploadAvailable) {
    issues.push(
      'No Gemini API key available. Video uploads will fail. ' +
      'Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file and rebuild the app.'
    );
  }

  // Check platform-specific headers
  if (Platform.OS === 'android') {
    const androidPackage = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_ANDROID_PACKAGE;
    const androidCert = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_ANDROID_CERT;
    details.hasAndroidPackage = !!androidPackage;
    details.hasAndroidCert = !!androidCert;

    if (!androidPackage || !androidCert) {
      issues.push(
        'Android platform headers not configured. ' +
        'Set EXPO_PUBLIC_GEMINI_UPLOAD_ANDROID_PACKAGE and EXPO_PUBLIC_GEMINI_UPLOAD_ANDROID_CERT for production builds.'
      );
    }
  }

  if (Platform.OS === 'ios') {
    const iosBundle = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_IOS_BUNDLE;
    details.hasIosBundle = !!iosBundle;

    if (!iosBundle) {
      issues.push(
        'iOS bundle identifier not configured. ' +
        'Set EXPO_PUBLIC_GEMINI_UPLOAD_IOS_BUNDLE for production builds.'
      );
    }
  }

  const isReady = issues.length === 0 || (details.directUploadAvailable && issues.every(i => i.includes('platform headers')));

  console.log('[GeminiUpload] Diagnostic result:', {
    isReady,
    issueCount: issues.length,
    details
  });

  return { isReady, issues, details };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const buildAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (Platform.OS === 'android') {
    const androidPackage = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_ANDROID_PACKAGE;
    const androidCert = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_ANDROID_CERT;
    if (androidPackage) headers['X-Android-Package'] = androidPackage;
    if (androidCert) headers['X-Android-Cert'] = androidCert;
  }

  if (Platform.OS === 'ios') {
    const iosBundle = process.env.EXPO_PUBLIC_GEMINI_UPLOAD_IOS_BUNDLE;
    if (iosBundle) headers['X-Ios-Bundle-Identifier'] = iosBundle;
  }

  return headers;
};

const buildUploadHeaders = (fileName: string | undefined, mimeType: string): Record<string, string> => ({
  ...buildAuthHeaders(),
  'X-Goog-Upload-Protocol': 'raw',
  'X-Goog-Upload-File-Name': fileName || 'upload',
  'Content-Type': mimeType || 'application/octet-stream',
});

const parseJsonBody = (body: string | null | undefined): any | null => {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const waitForFileActive = async (apiKey: string, fileName: string): Promise<GeminiFile> => {
  const endpoint = `${GEMINI_UPLOAD_BASE}/v1beta/${fileName}?key=${apiKey}`;
  let lastState = 'UNKNOWN';

  for (let attempt = 0; attempt < FILE_POLL_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(endpoint, { headers: buildAuthHeaders() });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(i18n.t('errors.video.status_error', { status: response.status, details: errorText }));
    }

    const result = await response.json();
    const file = (result?.file || result) as GeminiFile;
    const state = file?.state || 'ACTIVE';
    lastState = state;

    if (state === 'ACTIVE') {
      return file;
    }

    if (state === 'FAILED') {
      throw new Error(i18n.t('errors.video.processing_failed'));
    }

    await sleep(FILE_POLL_INTERVAL_MS);
  }

  throw new Error(i18n.t('errors.video.processing_timeout', { state: lastState }));
};

export const uploadGeminiFile = async ({ fileUri, mimeType, fileName }: UploadParams): Promise<GeminiFile> => {
  console.log('[GeminiUpload] Starting upload:', { fileUri: fileUri?.substring(0, 50), mimeType, fileName });

  const apiKey = getUploadApiKey();
  if (!apiKey) {
    console.error('[GeminiUpload] No API key available');
    throw new Error(i18n.t('errors.video.upload_key_missing'));
  }
  console.log('[GeminiUpload] API key found (length:', apiKey.length, ')');

  if (!fileUri) {
    console.error('[GeminiUpload] Missing file URI');
    throw new Error(i18n.t('errors.video.upload_missing_uri'));
  }

  // Verify file exists
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    console.error('[GeminiUpload] File does not exist:', fileUri);
    throw new Error(i18n.t('errors.video.not_found'));
  }
  console.log('[GeminiUpload] File verified:', {
    size: typeof fileInfo.size === 'number' ? `${(fileInfo.size / 1024 / 1024).toFixed(2)}MB` : 'unknown',
    uri: fileInfo.uri?.substring(0, 50)
  });

  const endpoint = `${GEMINI_UPLOAD_BASE}/upload/v1beta/files?key=${apiKey.substring(0, 8)}...`;
  const headers = buildUploadHeaders(fileName, mimeType);
  console.log('[GeminiUpload] Uploading to Gemini File API...', { mimeType, fileName });

  try {
    const uploadPromise = FileSystem.uploadAsync(
      `${GEMINI_UPLOAD_BASE}/upload/v1beta/files?key=${apiKey}`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers,
      }
    );

    const uploadResult = await Promise.race([
      uploadPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini upload timed out after 2 minutes.')), UPLOAD_TIMEOUT_MS);
      }),
    ]);

    console.log('[GeminiUpload] Upload response status:', uploadResult.status);

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      console.error('[GeminiUpload] Upload failed:', uploadResult.status, uploadResult.body?.substring(0, 200));
      throw new Error(i18n.t('errors.video.upload_error', { status: uploadResult.status, details: uploadResult.body || 'Unknown error' }));
    }

    const parsed = parseJsonBody(uploadResult.body);
    const file = (parsed?.file || parsed) as GeminiFile;
    console.log('[GeminiUpload] Upload successful, file name:', file?.name);

    if (!file?.name) {
      console.error('[GeminiUpload] No file name in response:', uploadResult.body?.substring(0, 200));
      throw new Error(i18n.t('errors.video.upload_missing_name'));
    }

    console.log('[GeminiUpload] Waiting for file to become ACTIVE...');
    const activeFile = await waitForFileActive(apiKey, file.name);
    console.log('[GeminiUpload] File is ACTIVE:', { name: activeFile?.name, uri: activeFile?.uri?.substring(0, 50) });

    if (!activeFile?.uri && activeFile?.name) {
      return { ...activeFile, uri: buildFileUriFromName(activeFile.name) };
    }
    return activeFile;
  } catch (error) {
    console.error('[GeminiUpload] Upload failed with error:', error);
    throw error;
  }
};
