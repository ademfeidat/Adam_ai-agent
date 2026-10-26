export interface GroundingSource {
  title: string;
  url: string;
  domain?: string;
}

export interface GroundingData {
  sources: GroundingSource[];
  queries: string[];
}

/**
 * Extracts and deduplicates web sources and search queries from Gemini grounding metadata.
 */
export function extractGroundingMetadata(metadata: any): GroundingData {
  const sources: GroundingSource[] = [];
  const queries: string[] = [];
  const seenUrls = new Set<string>();

  if (!metadata || typeof metadata !== 'object') return { sources, queries };

  if (Array.isArray(metadata.webSearchQueries)) {
    for (const q of metadata.webSearchQueries) {
      if (typeof q === 'string' && q.trim() && !queries.includes(q.trim())) {
        queries.push(q.trim());
      }
    }
  }

  if (Array.isArray(metadata.groundingChunks)) {
    for (const chunk of metadata.groundingChunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title || uri;
      if (uri && typeof uri === 'string' && !seenUrls.has(uri)) {
        seenUrls.add(uri);
        let domain = '';
        try {
          domain = new URL(uri).hostname.replace(/^www\./, '');
        } catch {}
        sources.push({
          title: typeof title === 'string' && title.trim() ? title.trim() : uri,
          url: uri,
          domain: domain || 'web',
        });
      }
    }
  }

  return { sources, queries };
}

/**
 * Merges two grounding data sets without duplicates.
 */
export function mergeGroundingData(base: GroundingData, incoming: GroundingData): GroundingData {
  const queries = Array.from(new Set([...base.queries, ...incoming.queries]));
  const seenUrls = new Set<string>(base.sources.map(s => s.url));
  const sources = [...base.sources];

  for (const s of incoming.sources) {
    if (s.url && !seenUrls.has(s.url)) {
      seenUrls.add(s.url);
      sources.push(s);
    }
  }

  return { sources, queries };
}

/**
 * Detects if a prompt is asking about today, current date, day of week, or current time.
 */
export function isTodayDateQuery(prompt: string): boolean {
  const p = String(prompt || '').toLowerCase().trim();
  return /(?:اليوم|تاريخ اليوم|ماهو اليوم|ما هو اليوم|اليوم ايه|كم تاريخ|كم التاريخ|كم اليوم|شو اليوم|ايش اليوم|ماهو تاريخ اليوم|ما تاريخ|اليوم كم|today|what day is it|current date|today's date|what date is it|what's today)/i.test(p);
}

/**
 * Detects casual conversational greetings, small talk, and status inquiries to bypass heavy web scraping.
 */
export function isConversationalQuery(prompt: string): boolean {
  const p = String(prompt || '').toLowerCase().trim();
  if (p.length > 60) return false;
  return /(?:^|\s)(?:أهلا|اهلا|مرحبا|مرحباً|سلام|السلام عليكم|كيف\s*حالك|كيفك|شلونك|أخبارك|اخبارك|شخبارك|واش\s*راك|وش\s*راك|لباس|لاباس|ca\s*va|صباح الخير|مساء الخير|شكرا|شكراً|تسلم|يعطيك العافية|من أنت|من انت|ما اسمك|who are you|hello|hi|hey|how are you|how's it going|thank you|thanks)(?:$|\s|[!.,؟?])/i.test(p);
}

/**
 * Generates dynamic current date & time instruction for the system prompt.
 * Evaluated freshly on every request to inject the live system clock.
 */
export function getDynamicSystemContext(language: 'ar' | 'en' | 'fr' | string = 'ar'): string {
  const now = new Date();
  const arDateFormatted = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  let arHijriFormatted = '';
  try {
    arHijriFormatted = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
  } catch {
    arHijriFormatted = '';
  }

  const enDateFormatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const isoDate = now.toISOString();
  const arTimeFormatted = now.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  const enTimeFormatted = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  if (language === 'ar') {
    const hijriPart = arHijriFormatted ? ` (الموافق هجرياً: ${arHijriFormatted})` : '';
    return `\n\nالسياق الزمني المباشر وتأكيد تاريخ اليوم (REAL-TIME CALENDAR & CLOCK):
- اليوم وتاريخ اليوم المؤكد: ${arDateFormatted}م${hijriPart}
- الوقت الحالي: ${arTimeFormatted} (ISO: ${isoDate})
- توجيه إلزامي صارم لليوم وتاريخ اليوم (MANDATORY TODAY DIRECTIVE):
  * عندما يسألك المستخدم عن "اليوم" أو "تاريخ اليوم" أو "ما هو اليوم" أو "اليوم ايه"، أجب مباشرة بدقة متناهية وبساطة مطلقة معتمداً على التاريخ المحدد أعلاه: "${arDateFormatted}م${hijriPart}". لا تخمّن ولا تؤجل الإجابة، واذكر اليوم والتاريخ فوراً بإيجاز ووضوح.
- محرك المعرفة الشاملة والبحث اللحظي في شبكة الويب وتاريخ الإنترنت (LIVE & HISTORICAL INTERNET GROUNDING):
  * أنت متصل لحظياً بشبكة الإنترنت العالمية وبأرشيف المعارف الرقمية منذ نشأة شبكة الإنترنت (ARPANET 1969، إطلاق شبكة الويب العالمية WWW 1989/1991، وتطور التقنية والعلوم والتاريخ البشري حتى اللحظة الراهنة).
  * في كل سؤال أو موضوع، استند إلى تدعيم البحث الحي (Google Search Grounding) والمعارف الأرشيفية الموثقة لتقديم إجابة حاسمة، دقيقة، عميقة، ومباشرة.
  * لا تخترع أو تخمّن؛ دمج الحقائق المعاصرة مع العمق التاريخي لتقديم معرفة رقمية متكاملة للمستخدم.`;
  }

  return `\n\nDYNAMIC REAL-TIME SYSTEM CLOCK & GROUNDING:
- Current Date: ${enDateFormatted}
- Current ISO Time: ${isoDate} (${enTimeFormatted})
- Mandatory Directive: Always rely on the provided 'Current Date' context when answering questions about today, the present time, or current year. Answer directly, clearly, and concisely.
- Live & Historical Internet Grounding: You are directly grounded in the real-time internet index and historical web archives dating back to the inception of the internet (ARPANET 1969, CERN WWW 1989, and all digitized human knowledge). Ground every fact, event, and analysis with verified, hallucination-free knowledge.`;
}

export function cleanSearchQuery(query: string): string {
  let clean = String(query || '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
  // Strip conversational search prefixes
  clean = clean.replace(/^(?:ابحث\s*لي\s*عن|ابحث\s*عن|ابحث\s*في\s*(?:النت|جوجل|الويب)\s*عن|بحث\s*عن|ابحث|بحث|أريد\s*البحث\s*عن|ما\s*هو|ما\s*هي|ماهو|ماهي|من\s*هو|من\s*هي|أخبرني\s*عن|اخبرني\s*عن|search\s*for|search\s*the\s*web\s*for|google\s*for|google|search|look\s*up|find\s*out\s*about|tell\s*me\s*about|what\s*is|who\s*is)\s+/i, '');
  return clean.trim().slice(0, 150);
}

/**
 * Fetches real-time web knowledge from DuckDuckGo, Wikipedia, and live search endpoints in parallel
 * with ultra-fast latency (<1500ms), resilient fallback handling, and rich snippet extraction.
 */
export async function fetchLiveWebKnowledge(
  query: string,
  language: 'ar' | 'en' | 'fr' = 'ar'
): Promise<{ sources: GroundingSource[]; knowledgeContext: string; queries: string[] }> {
  const cleanQuery = cleanSearchQuery(query) || query.trim().slice(0, 120);
  if (!cleanQuery || cleanQuery.length < 2) {
    return { sources: [], knowledgeContext: '', queries: [] };
  }

  const sources: GroundingSource[] = [];
  const snippets: string[] = [];
  const seenUrls = new Set<string>();

  const wikiEndpoint = language === 'ar'
    ? `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&srlimit=4`
    : `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&srlimit=4`;

  const ddgEndpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const ddgHtmlEndpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);

  try {
    // Query Wikipedia, DuckDuckGo API, and DuckDuckGo HTML in parallel
    const [wikiRes, ddgRes, ddgHtmlRes] = await Promise.allSettled([
      fetch(wikiEndpoint, {
        headers: { 'User-Agent': 'AdamAI/2.0 (LiveKnowledgeAssistant)' },
        signal: controller.signal,
      }).then(r => (r.ok ? r.json() : null)),
      fetch(ddgEndpoint, {
        headers: { 'User-Agent': 'AdamAI/2.0 (LiveKnowledgeAssistant)' },
        signal: controller.signal,
      }).then(r => (r.ok ? r.json() : null)),
      fetch(ddgHtmlEndpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      }).then(r => (r.ok ? r.text() : null)),
    ]);

    // 1. Parse DuckDuckGo Abstract & Related Topics
    if (ddgRes.status === 'fulfilled' && ddgRes.value) {
      const ddgData = ddgRes.value;
      if (ddgData.AbstractText && ddgData.AbstractURL && !seenUrls.has(ddgData.AbstractURL)) {
        seenUrls.add(ddgData.AbstractURL);
        sources.push({
          title: ddgData.Heading || cleanQuery,
          url: ddgData.AbstractURL,
          domain: 'duckduckgo.com',
        });
        snippets.push(`- **${ddgData.Heading || cleanQuery}**: ${ddgData.AbstractText.slice(0, 400)}`);
      }

      if (Array.isArray(ddgData.RelatedTopics)) {
        for (const topic of ddgData.RelatedTopics.slice(0, 3)) {
          if (topic.Text && topic.FirstURL && !seenUrls.has(topic.FirstURL)) {
            seenUrls.add(topic.FirstURL);
            sources.push({
              title: topic.Text.split(' - ')[0] || cleanQuery,
              url: topic.FirstURL,
              domain: 'duckduckgo.com',
            });
            snippets.push(`- ${topic.Text.slice(0, 300)}`);
          }
        }
      }
    }

    // 2. Parse Wikipedia Search Items
    if (wikiRes.status === 'fulfilled' && wikiRes.value) {
      const searchItems = Array.isArray(wikiRes.value?.query?.search) ? wikiRes.value.query.search : [];
      for (const item of searchItems.slice(0, 4)) {
        const title = String(item?.title || '').trim();
        if (!title) continue;
        const snippet = String(item?.snippet || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        const wikiDomain = language === 'ar' ? 'ar.wikipedia.org' : 'en.wikipedia.org';
        const url = `https://${wikiDomain}/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;

        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          sources.push({
            title,
            url,
            domain: 'wikipedia.org',
          });

          if (snippet) {
            snippets.push(`- **${title}**: ${snippet}`);
          }
        }
      }
    }

    // 3. Parse DuckDuckGo HTML Search Results as rich fallback
    if (ddgHtmlRes.status === 'fulfilled' && ddgHtmlRes.value && snippets.length < 3) {
      const html = ddgHtmlRes.value;
      const snippetMatches = Array.from(html.matchAll(/<a class="result__snippet[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi));
      const titleMatches = Array.from(html.matchAll(/<a class="result__url[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi));

      for (let i = 0; i < Math.min(snippetMatches.length, 3); i++) {
        const rawSnippet = snippetMatches[i]?.[2] || '';
        const rawUrl = snippetMatches[i]?.[1] || titleMatches[i]?.[1] || '';
        const cleanText = rawSnippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        
        if (cleanText && cleanText.length > 20 && !snippets.some(s => s.includes(cleanText.slice(0, 30)))) {
          snippets.push(`- ${cleanText.slice(0, 300)}`);
          if (rawUrl && !seenUrls.has(rawUrl)) {
            seenUrls.add(rawUrl);
            try {
              const domain = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname.replace(/^www\./, '');
              sources.push({
                title: cleanQuery,
                url: rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`,
                domain,
              });
            } catch {}
          }
        }
      }
    }

    let knowledgeContext = '';
    if (snippets.length > 0) {
      knowledgeContext = language === 'ar'
        ? `\n\n=== نتائج ومعلومات حية وموثوقة من شبكة الإنترنت (LIVE INTERNET REAL-TIME GROUNDING) ===\n${snippets.join('\n')}\nاستفد من هذه المعلومات المباشرة والحقائق الحية لتقديم إجابة دقيقة، موثقة، وبسيطة للمستخدم.`
        : `\n\n=== VERIFIED LIVE INTERNET REAL-TIME GROUNDING ===\n${snippets.join('\n')}\nUse these verified live facts to provide an accurate, clear, and direct response.`;
    }

    return { sources, knowledgeContext, queries: [cleanQuery] };
  } catch {
    return { sources: [], knowledgeContext: '', queries: [cleanQuery] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds a fast, resilient, direct CDN image URL with sanitized prompt and length protection.
 * Defaults to Flux.1 high-performance engine.
 */
export function buildFluxEngineUrl(
  prompt: string,
  aspectRatio: string = '1:1',
  seed: number = Date.now()
): { url: string; width: number; height: number; cleanPrompt: string } {
  const cleanPrompt = String(prompt || '')
    .replace(/:::[\s\S]*?:::/g, '')
    .replace(/[^\p{L}\p{N}\s,.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);

  let width = 1024;
  let height = 1024;
  if (aspectRatio === '16:9') {
    width = 1344;
    height = 768;
  } else if (aspectRatio === '9:16') {
    width = 768;
    height = 1344;
  } else if (aspectRatio === '4:3') {
    width = 1152;
    height = 864;
  } else if (aspectRatio === '21:9') {
    width = 1536;
    height = 640;
  }

  const encoded = encodeURIComponent(cleanPrompt || '8k resolution photorealistic cinematic masterpiece 85mm lens volumetric lighting');
  const url = `https://pollinations.ai/p/${encoded}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;
  return { url, width, height, cleanPrompt };
}

export function buildSecureImageUrl(
  prompt: string,
  seed: number = Date.now(),
  model: 'flux' | 'turbo' = 'flux',
  width: number = 1024,
  height: number = 1024
): string {
  const clean = String(prompt || '')
    .replace(/:::[\s\S]*?:::/g, '')
    .replace(/[^\p{L}\p{N}\s,.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);

  const encoded = encodeURIComponent(clean || 'photorealistic cinematic masterpiece 8k');
  return `https://pollinations.ai/p/${encoded}?width=${width}&height=${height}&model=${model}&nologo=true&seed=${seed}`;
}

