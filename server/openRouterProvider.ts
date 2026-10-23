/**
 * Independent OpenRouter provider adapter.
 *
 * This module is server-only. OPENROUTER_API_KEY is never read by browser code
 * and is never returned by diagnostics or API responses.
 */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
};

export type OpenRouterCompletionArgs = {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() || '';
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getOpenRouterApiKey());
}

export function getOpenRouterModel(): string {
  // Use a strong, tool-capable default, but let the operator choose the model
  // independently of the app code and of the Gemini model configuration.
  return process.env.ADAM_OPENROUTER_MODEL?.trim() || 'anthropic/claude-sonnet-4.6';
}

export function getOpenRouterFallbackModels(): string[] {
  return (process.env.ADAM_OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model, index, all) => model !== getOpenRouterModel() && all.indexOf(model) === index)
    .slice(0, 4);
}

export function getOpenRouterModelChain(): string[] {
  return [getOpenRouterModel(), ...getOpenRouterFallbackModels()];
}

export async function completeOpenRouterChat(args: OpenRouterCompletionArgs): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error('OpenRouter is not configured on the server.');

  const controller = new AbortController();
  const timeoutMs = Math.max(5_000, Math.min(args.timeoutMs ?? 45_000, 120_000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const messages: OpenRouterMessage[] = [];
  if (args.system?.trim()) messages.push({ role: 'system', content: args.system });
  messages.push({ role: 'user', content: args.prompt });

  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://adam-ai-agent.vercel.app',
        'X-OpenRouter-Title': 'Adam AI Agent',
      },
      body: JSON.stringify({
        models: getOpenRouterModelChain(),
        messages,
        temperature: args.temperature ?? 0.35,
        max_tokens: Math.min(Math.max(args.maxTokens ?? 4096, 256), 32768),
        stream: false,
        provider: { allow_fallbacks: true },
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(`OpenRouter returned HTTP ${response.status}: ${raw.slice(0, 900)}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    let data: any;
    try { data = JSON.parse(raw); } catch { throw new Error('OpenRouter returned invalid JSON.'); }
    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part: any) => typeof part === 'string' ? part : part?.text || '').join('')
      : typeof content === 'string' ? content : '';

    if (!text.trim()) throw new Error('OpenRouter returned an empty completion.');
    return text.trim();
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error(`OpenRouter request timed out after ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
