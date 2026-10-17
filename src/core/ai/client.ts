import type { Message } from '../domain';
import { createAssistantMessage } from '../../features/chat/chatModel';
import { ChatError, type ChatClient, type ChatRequest } from './types';
import { parseStreamLines, type StreamEvent } from './streamParser';
import { classifyChatError, toUserFacingChatError } from './errors';
import { getRetryDelayMs, shouldRetryChatError } from './retry';
/**
 * Detects if the app is running in a Native Android APK, Capacitor, Cordova, or WebView environment
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() || cap?.getPlatform?.() === 'android' || cap?.getPlatform?.() === 'ios') return true;
  const isAndroidApp = Boolean((window as any).AndroidApp || (window as any).Android);
  const origin = window.location.origin || '';
  const isLocalOrigin = origin === 'https://localhost' || origin.startsWith('capacitor://') || origin.startsWith('ionic://') || origin.startsWith('file://');
  const isAndroidWebView = /Android.*(wv|\.0\.0\.0|Version\/[\d.]+\s+Chrome\/)/i.test(navigator.userAgent || '');
  return isAndroidApp || isLocalOrigin || isAndroidWebView;
}

// Live Production Cloud Run Endpoints for Android APK & Web Clients
export const PRODUCTION_API_SERVER = 'https://adam-ai-agent.vercel.app';
// Legacy Cloud Run fallbacks are kept last so a stale/blocked development service can never shadow production.
export const PRIMARY_CLOUD_SERVER = 'https://ais-dev-npzesm6asflyef75cic2a6-263913895850.asia-southeast1.run.app';
export const SECONDARY_CLOUD_SERVER = 'https://ais-pre-npzesm6asflyef75cic2a6-263913895850.asia-southeast1.run.app';

/**
 * Returns prioritized live server endpoints for native APK and web environments
 */
export function getLiveServerEndpoints(): string[] {
  const endpoints: string[] = [];

  // 1. Same-origin relative path if running over HTTP/HTTPS
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    if (/^https?:\/\//i.test(origin) && !origin.startsWith('capacitor:') && !origin.startsWith('file:')) {
      endpoints.push('');
    }
  }

  // 2. Explicit user-configured custom endpoint (Settings / LocalStorage)
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('adam_custom_api_url')?.trim() : '';
  if (customUrl && /^https?:\/\//i.test(customUrl)) {
    endpoints.push(customUrl.replace(/\/$/, ''));
  }

  // 3. Build-time environment endpoint
  const envUrl = (import.meta.env.VITE_ADAM_API_URL ?? '').trim();
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    endpoints.push(envUrl.replace(/\/$/, ''));
  }

  // 4. Live Cloud Run fallbacks for Native APK / WebView
  endpoints.push(PRIMARY_CLOUD_SERVER);
  endpoints.push(SECONDARY_CLOUD_SERVER);
  endpoints.push(PRODUCTION_API_SERVER);

  return Array.from(new Set(endpoints));
}

export function getResolvedApiBase(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || '';
    if (/^https?:\/\//i.test(origin) && !origin.startsWith('capacitor:') && !origin.startsWith('file:')) {
      return '';
    }
  }
  const endpoints = getLiveServerEndpoints();
  return endpoints.find((e) => e.length > 0) || PRIMARY_CLOUD_SERVER;
}

/**
 * Checks if device is strictly connected to the internet
 */
export function checkIsOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine !== false;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The request was cancelled.', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The request was cancelled.', 'AbortError'));
      },
      { once: true }
    );
  });

async function streamRequestOnce(
  url: string,
  request: ChatRequest,
  signal: AbortSignal,
  onDelta: (text: string) => void
) {
  const requestController = new AbortController();
  let startupTimedOut = false;
  const abortFromCaller = () => requestController.abort();
  signal.addEventListener('abort', abortFromCaller, { once: true });

  const startupTimeoutId = setTimeout(() => {
    startupTimedOut = true;
    requestController.abort();
  }, 90_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify(request),
      signal: requestController.signal,
    });
  } catch (error) {
    if (startupTimedOut && !signal.aborted) {
      throw new ChatError('REQUEST_TIMEOUT', 'The AI service took too long to start responding.');
    }
    throw error;
  } finally {
    clearTimeout(startupTimeoutId);
  }

  if (!response.ok) {
    let payload: { code?: string; message?: string } = {};
    try {
      payload = await response.json();
    } catch {}
    const userError = toUserFacingChatError({
      status: response.status,
      code: payload.code,
      message: payload.message,
    });
    signal.removeEventListener('abort', abortFromCaller);
    throw new ChatError(userError.code, userError.message, response.status);
  }

  if (!response.body) {
    signal.removeEventListener('abort', abortFromCaller);
    throw new ChatError('NO_STREAM', 'The AI stream is unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = false;

  const consume = (input: string) => {
    const parsed = parseStreamLines(input);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      const streamEvent: StreamEvent = event;
      if (streamEvent.type === 'delta') {
        text += streamEvent.text;
        onDelta(text);
      } else if (streamEvent.type === 'error') {
        throw new ChatError(streamEvent.code, streamEvent.message);
      } else if (streamEvent.type === 'done') {
        completed = true;
      }
    }
  };

  const readWithTimeout = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ChatError('STREAM_TIMEOUT', 'The AI stream stopped responding.'));
          }, 30_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    while (true) {
      const { value, done } = await readWithTimeout();
      if (done) break;
      consume(buffer + decoder.decode(value, { stream: true }));
      if (completed) break;
    }

    consume(buffer + decoder.decode());
    if (text.trim()) {
      return createAssistantMessage(text) as Message;
    }

    throw new ChatError('INCOMPLETE_STREAM', 'Adam did not receive a usable completion.');
  } finally {
    signal.removeEventListener('abort', abortFromCaller);
    try { reader.releaseLock(); } catch {}
  }
}

async function streamRequest(
  path: string,
  request: ChatRequest,
  signal: AbortSignal,
  onDelta: (text: string) => void
): Promise<Message> {
  const isArabic = request.language === 'ar';
  const userPrompt = request.messages[request.messages.length - 1]?.content || '';

  // 1. STRICT INTERNET REQUIREMENT CHECK (تطبيق يعمل فقط بالإنترنت لضمان صحة المعلومات)
  if (!checkIsOnline()) {
    const offlineMsg = isArabic
      ? `⚠️ **يلزم وجود اتصال بالإنترنت:**\n\nيعمل تطبيق **ADEM** حصرياً بالاتصال المباشر بالإنترنت ومحركات البحث الحيّة لضمان استرجاع معلومات دقيقة ومحدثة وصحيحة 100%.\n\nيرجى التأكد من اتصال هاتفك بشبكة Wi-Fi أو بيانات الهاتف ثم إعادة المحاولة.`
      : `⚠️ **Active Internet Connection Required:**\n\n**ADEM** operates exclusively with a live internet connection and real-time grounding to guarantee 100% verified, accurate, and up-to-date information.\n\nPlease connect to Wi-Fi or cellular data and retry.`;
    throw new ChatError('NO_INTERNET', offlineMsg);
  }

  // 2. Server-only AI transport. API credentials never enter browser storage or Vite client env.

  // 3. Multi-Server Resilient Failover for APK and Web
  const candidateEndpoints = getLiveServerEndpoints();

  let lastError: unknown = null;

  for (const base of candidateEndpoints) {
    const fullUrl = `${base}${path}`;
    for (let retryCount = 0; retryCount < 2; retryCount += 1) {
      try {
        return await streamRequestOnce(fullUrl, request, signal, onDelta);
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
        const kind = classifyChatError(error);
        const canRetry =
          shouldRetryChatError(kind, retryCount) &&
          !(error instanceof ChatError && error.status === undefined && kind === 'unknown');

        if (!canRetry) {
          break;
        }

        await wait(getRetryDelayMs(retryCount), signal);
      }
    }
  }

  // 4. If all live servers were unreachable, require internet connection rather than hallucinating
  const errDetail = lastError instanceof Error ? lastError.message : '';
  const serverErrMsg = isArabic
    ? `⚠️ **تعذر الاتصال بسيرفر الإنترنت الحي:**\n\nتطبيق ADEM يتطلب اتصالاً مباشراً بسيرفر الذكاء الاصطناعي على الإنترنت لجلب معلومات حية ودقيقة.\n\nيرجى التأكد من اتصال الإنترنت ثم الضغط على **إعادة المحاولة**.\n\n*(التفاصيل: ${errDetail || 'Server unreachable'})*`
    : `⚠️ **Unable to connect to the live online AI server:**\n\nADEM requires a live internet connection to retrieve verified, grounded, and accurate real-time data.\n\nPlease check your internet connection and tap **Retry**.\n\n*(Details: ${errDetail || 'Server unreachable'})*`;

  throw new ChatError('SERVER_UNREACHABLE', serverErrMsg);
}

export const httpChatClient: ChatClient = {
  send: (request, signal, onDelta) => streamRequest('/api/chat', request, signal, onDelta),
};

export const httpAgentClient: ChatClient = {
  send: async (request, signal, onDelta) => {
    try {
      return await streamRequest('/api/agent', request, signal, onDelta);
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof ChatError && [400, 409].includes(error.status ?? 0)) throw error;
      return streamRequest('/api/chat', request, signal, onDelta);
    }
  },
};
