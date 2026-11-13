import type { TranslationResult, TranslationHistoryItem } from './languages';

const HISTORY_STORAGE_KEY = 'adam_translation_history';

export function loadTranslationHistory(): TranslationHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTranslationToHistory(item: Omit<TranslationHistoryItem, 'id' | 'timestamp'>): TranslationHistoryItem {
  const history = loadTranslationHistory();
  const newItem: TranslationHistoryItem = {
    ...item,
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    favorite: false,
  };

  // Avoid duplicate identical consecutive translations
  const filtered = history.filter(
    (h) => !(h.sourceText === newItem.sourceText && h.targetLang === newItem.targetLang)
  );

  const updated = [newItem, ...filtered].slice(0, 100);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return newItem;
}

export function toggleFavoriteTranslation(id: string): TranslationHistoryItem[] {
  const history = loadTranslationHistory();
  const updated = history.map((h) => (h.id === id ? { ...h, favorite: !h.favorite } : h));
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function deleteTranslationItem(id: string): TranslationHistoryItem[] {
  const history = loadTranslationHistory();
  const updated = history.filter((h) => h.id !== id);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function clearTranslationHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {}
}

export async function requestTranslation(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  tone?: string;
  includeAnalysis?: boolean;
  signal?: AbortSignal;
}): Promise<TranslationResult> {
  const { text, sourceLang, targetLang, tone = 'general', includeAnalysis = true, signal } = params;

  if (!text.trim()) {
    return { translatedText: '' };
  }

  // 1. Try server endpoint /api/translate
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
        tone,
        includeAnalysis,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.translatedText === 'string') {
        return data as TranslationResult;
      }
    }
  } catch (err: any) {
    if (signal?.aborted) throw err;
    console.warn('[Translator] Server API translation error, falling back to direct chat client:', err);
  }

  // 2. Direct fallback via /api/chat with specialized translation prompt
  try {
    const prompt = `You are a world-class translation engine. Translate the following text from "${sourceLang}" to "${targetLang}" with tone "${tone}".
Output strict JSON with this exact format (no markdown fences, just JSON):
{
  "translatedText": "translated string here",
  "detectedSourceLang": "${sourceLang === 'auto' ? 'detected code' : sourceLang}",
  "transliteration": "phonetic transliteration or null",
  "alternatives": [{"text": "alt phrase", "context": "where it fits"}],
  "grammarNotes": "brief grammar note or null",
  "vocabulary": [{"word": "source word", "translation": "target word", "pos": "noun/verb"}]
}

Text to translate:
"""
${text}
"""`;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        language: 'ar',
      }),
      signal,
    });

    if (res.ok) {
      const textResponse = await res.text();
      // Parse NDJSON or raw text
      const lines = textResponse.split('\n');
      let combined = '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'delta' && parsed.text) combined += parsed.text;
        } catch {
          combined += line;
        }
      }

      // Extract JSON from combined
      const jsonMatch = combined.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        if (parsedResult.translatedText) {
          return parsedResult as TranslationResult;
        }
      }

      if (combined.trim()) {
        return { translatedText: combined.replace(/```json|```/g, '').trim() };
      }
    }
  } catch (e) {
    console.error('[Translator] Fallback failed:', e);
  }

  return {
    translatedText: text,
  };
}
