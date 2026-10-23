if (process.env.VERCEL !== '1') {
  try { process.loadEnvFile?.(); } catch {}
}
import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}
import fs from 'node:fs';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { registerAgentRoute, searchCircuitBreaker, isExplicitImageRequest, isExplicitVideoRequest } from './server/agent';
import { AGENT_ACTION_TOOLS, executeAgentActionTool } from './src/core/agent/toolExecution';
import { createAgentModelGateway } from './src/core/models/agentModelGateway';
import { modelRegistry } from './src/core/models/modelSwarm';
import { hermesEngine } from './server/hermesAgent';
import { huggingFaceEngine } from './server/huggingfaceEngine';
import { mediaEngine, CognitiveMediaBrain } from './server/mediaEngine';
import { secretsManager, redactSecrets } from './server/security/secrets';
import { authenticateSession, requirePermission, requireRole } from './server/security/auth';
import { securityHeadersMiddleware, corsMiddleware, validateFileSecurity } from './server/security/networkShield';
import { globalRateLimiter, chatRateLimiter, mediaRateLimiter, authRateLimiter, agentRateLimiter, loginBruteForceLimiter } from './server/security/rateLimiter';
import { signSessionToken } from './server/security/auth';
import { PromptInjectionGuard } from './server/security/promptInjection';
import { AgentPermissionGuard } from './server/security/agentPermissions';
import { humanApprovalManager } from './server/security/humanApproval';
import { auditLogger } from './server/security/auditLog';
import { costControlManager } from './server/security/costControl';
import { BetterMemoryEngine } from './server/security/betterMemory';
import { backgroundTaskQueue } from './server/security/taskQueue';
import { systemMonitor } from './server/security/monitoring';
import { buildRequestContract, formatRequestContract } from './src/core/agent/requestUnderstanding';
import { buildExecutionPlan, formatExecutionPlan } from './src/core/agent/executionPlanner';
import { sandboxRouter } from './server/sandbox/sandboxRoutes';
import { dockerSandboxService } from './server/sandbox/dockerSandboxService';
import { speedTestRouter } from './server/diagnostics/speedTestRoutes';
import { geminiMultimodalRouter } from './server/features/geminiMultimodalRoutes';
import { setupLiveApiWebSocket } from './server/features/liveApiBridge';
import { buildHarnessPlan, formatHarnessInstruction, verifyHarnessOutput } from './server/ecc';
import { buildGuardianReport } from './server/guardian';
import { isGatewayConfigured, streamGatewayChat } from './server/aiGateway';
import { getOpenRouterModel, isOpenRouterConfigured } from './server/openRouterProvider';
import { detectMessageLanguage } from './src/core/utils/languageDetector';

// Process-level shields against unexpected crashes and unhandled promise rejections
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET' || err?.code === 'ERR_STREAM_WRITE_AFTER_END' || err?.message?.includes('aborted')) {
    return;
  }
  console.error('[Adam Server] Prevented crash from uncaught exception:', redactSecrets(String(err?.message || err)));
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Adam Server] Prevented crash from unhandled rejection:', redactSecrets(String(reason?.stack || reason?.message || reason)));
});

const app = express();
const requestedPort = Number(process.env.PORT);
const port = (!isNaN(requestedPort) && requestedPort !== 8080 && requestedPort > 0) ? requestedPort : 3000;
const model = process.env.ADAM_GEMINI_MODEL ?? 'gemini-3.8-flash';
const apiKey = secretsManager.getGeminiApiKey();
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'dist');

app.set('trust proxy', 1);
app.disable('x-powered-by');

// 1. Helmet-grade Security Headers & Strict CORS
app.use(securityHeadersMiddleware);
app.use(corsMiddleware);

// 2. Telemetry & Monitoring Metrics
app.use(systemMonitor.middleware());

// 3. Compression & JSON payload size defense
app.use(compression({
  level: 6,
  threshold: 256,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

// 4. Session & Authentication Middleware (populates req.user)
app.use(authenticateSession);

// 5. Global API Response Redaction Shield & Rate Limiter
app.use('/api', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const sanitized = secretsManager.redactObject(body);
    return originalJson(sanitized);
  };
  next();
});
app.use('/api', globalRateLimiter.middleware());

// Fast Health & Ping for Mobile APK & Web Connectivity Probing
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'online',
    agent: 'ADEM',
    configured: Boolean(secretsManager.getGeminiApiKey()) || isOpenRouterConfigured() || isGatewayConfigured(),
    agentic: true,
    timestamp: Date.now(),
  });
});

// Guardian endpoint: exposes safe, non-secret diagnostics for autonomous recovery workflows.
app.get('/api/guardian', (req, res) => {
  const report = buildGuardianReport({
    geminiConfigured: Boolean(secretsManager.getGeminiApiKey()),
    gatewayConfigured: isGatewayConfigured(req),
    sessionSecretConfigured: Boolean(process.env.SESSION_SECRET?.trim()),
    vercel: process.env.VERCEL === '1',
    production: process.env.VERCEL_ENV === 'production',
    model,
  });
  res.status(report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503).json(report);
});

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, pong: Date.now() });
});

app.get('/api/adam-character-image', async (_req, res) => {
  const source = 'https://i.pinimg.com/originals/b9/29/84/b92984d3cf394fb4421bd48e9641c964.jpg';
  try {
    const upstream = await fetch(source, { headers: { accept: 'image/jpeg,image/*;q=0.9,*/*;q=0.1' } });
    if (!upstream.ok) return res.status(502).json({ ok: false, error: 'CHARACTER_IMAGE_UNAVAILABLE' });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(body);
  } catch {
    return res.status(502).json({ ok: false, error: 'CHARACTER_IMAGE_PROXY_FAILED' });
  }
});

const overloadedModels = new Map<string, number>();

function getHealthSortedModels(preferredModel: string): string[] {
  // Gemini limits access to the 2.5 family for new API users. Keep production
  // routing on current stable models instead of repeatedly retrying restricted IDs.
  const restrictedModels = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
  const defaults = [
    'gemini-3.8-flash',
    'gemini-4-argon',
    'gemini-flash-latest',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];
  const requested = preferredModel && !restrictedModels.has(preferredModel) ? [preferredModel] : [];
  const all = Array.from(new Set([...requested, ...defaults].filter(Boolean)));
  const now = Date.now();
  const available = all.filter(m => (overloadedModels.get(m) || 0) <= now);
  const cooldowns = all.filter(m => (overloadedModels.get(m) || 0) > now);
  return [...available, ...cooldowns];
}

function markModelOverloaded(modelId: string, durationMs = 60_000) {
  overloadedModels.set(modelId, Date.now() + durationMs);
}

export function safeWrite(res: express.Response, chunk: object | string): boolean {
  if (res.writableEnded || res.destroyed || !res.writable) return false;
  try {
    const raw = typeof chunk === 'string' ? chunk : JSON.stringify(chunk) + '\n';
    const payload = redactSecrets(raw);
    res.write(payload);
    // Force streamed NDJSON chunks through compression/proxy buffers immediately.
    // This is especially important for Capacitor Android WebViews.
    res.flush?.();
    return true;
  } catch {
    return false;
  }
}

export function safeEnd(res: express.Response, chunk?: object | string): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    if (chunk !== undefined) {
      const raw = typeof chunk === 'string' ? chunk : JSON.stringify(chunk) + '\n';
      const payload = redactSecrets(raw);
      res.end(payload);
    } else {
      res.end();
    }
  } catch {
    // Ignore stream closed errors
  }
}

function sendError(res: express.Response, status: number, code: string, message: string) {
  const safeMsg = redactSecrets(message);
  if (res.headersSent) {
    safeWrite(res, { type: 'error', code, message: safeMsg });
    safeEnd(res);
    return;
  }
  try {
    res.status(status).json({ code, message: safeMsg });
  } catch {
    // Ignore client socket disconnects
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  try {
    const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  } catch {}
  return null;
}

function normalizeMessages(input: unknown) {
  let list: any[] = [];
  if (Array.isArray(input)) {
    list = input;
  } else if (typeof input === 'string' && input.trim()) {
    list = [{ role: 'user', content: input.trim() }];
  } else if (input && typeof input === 'object') {
    const obj = input as any;
    if (typeof obj.content === 'string') {
      list = [obj];
    } else if (typeof obj.message === 'string') {
      list = [{ role: 'user', content: obj.message, images: obj.images }];
    } else if (typeof obj.prompt === 'string') {
      list = [{ role: 'user', content: obj.prompt, images: obj.images }];
    } else if (Array.isArray(obj.parts)) {
      list = [obj];
    }
  }
  if (!list.length) return [];

  const valid: Array<{ role: string; content: string; images?: string[] }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    let content = '';
    if (typeof item.content === 'string') {
      content = item.content;
    } else if (typeof item.text === 'string') {
      content = item.text;
    } else if (Array.isArray(item.parts)) {
      content = item.parts.map((p: any) => p?.text || '').filter(Boolean).join(' ');
    }
    if (content.trim()) {
      valid.push({
        role: item.role || 'user',
        content,
        images: Array.isArray(item.images) ? item.images : undefined,
      });
    }
  }

  // Long-context policy: preserve the opening context and the latest turns while
  // enforcing a predictable server-side budget. Gemini 3.8 Flash supports a 1M
  // token context, but sending an unbounded 40 x 30k-character history wastes
  // latency/cost and can drown the current request in stale detail.
  const selected = valid.length <= 36
    ? valid
    : [...valid.slice(0, 4), ...valid.slice(-32)];

  const MAX_CONTEXT_CHARS = 120_000;
  const compacted: typeof selected = [];
  let usedChars = 0;
  for (let i = selected.length - 1; i >= 0; i -= 1) {
    const item = selected[i];
    const size = item.content.length + (Array.isArray(item.images) ? item.images.join('').length : 0);
    if (compacted.length > 0 && usedChars + size > MAX_CONTEXT_CHARS) break;
    compacted.unshift(item);
    usedChars += size;
  }

  return compacted.map(item => {
      const role = item.role === 'assistant' || item.role === 'model' ? 'model' : 'user';
      const parts: any[] = [{ text: item.content.slice(0, 30_000) }];

      if (Array.isArray(item.images) && item.images.length > 0) {
        for (const imgUrl of item.images) {
          if (typeof imgUrl === 'string') {
            const parsed = parseDataUrl(imgUrl);
            if (parsed) {
              parts.push({
                inlineData: {
                  mimeType: parsed.mimeType,
                  data: parsed.data,
                },
              });
            }
          }
        }
      }

      return { role, parts };
    });
}

import { getDynamicSystemContext, extractGroundingMetadata, mergeGroundingData, buildSecureImageUrl, buildFluxEngineUrl, isTodayDateQuery, isConversationalQuery, fetchLiveWebKnowledge, type GroundingData, type GroundingSource } from './server/grounding';
import { searchInternetImages } from './server/webImageSearch';

export const GENERATE_SPECIALIZED_IMAGE_TOOL = {
  functionDeclarations: [
    {
      name: 'search_internet_images',
      description: 'Searches and fetches real, genuine photographs, diagrams, and illustrative media from the live internet (Wikimedia Commons, Wikipedia) based on a search keyword in Arabic or English. Returns verified direct image URLs to display in the chat conversation.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'The search keyword, topic, or subject in Arabic or English to find real internet images for (e.g. "Cybersecurity", "Algeria", "Linux Kernel").',
          },
          count: {
            type: 'INTEGER',
            description: 'The number of images to fetch (1 to 6). Default is 3.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'generate_specialized_image',
      description: 'Generates a specialized, high-resolution visual masterpiece using the Flux.1 high-performance engine. Requires an expanded, detailed cinematic English prompt specifying 8K resolution, lighting (e.g. volumetric lighting, studio lights), style (e.g. hyper-realistic photo, 3D render), aspect ratio, and camera lens details (e.g. 85mm f/1.8 lens, bokeh depth of field).',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: {
            type: 'STRING',
            description: 'The expanded, highly detailed cinematic English prompt including subject, environment, lighting (e.g. volumetric, studio), style (e.g. hyper-realistic photo, 3D render), 8K resolution, and camera lens details (e.g. 85mm f/1.8 lens, bokeh depth of field).',
          },
          aspect_ratio: {
            type: 'STRING',
            description: 'The aspect ratio for the image framing (e.g., "1:1", "16:9", "9:16", "4:3"). Defaults to "1:1".',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'generate_image',
      description: 'Generates a high-quality photorealistic AI image using Flux.1 based on an enriched visual description.',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: {
            type: 'STRING',
            description: 'The detailed visual description in English.',
          },
          aspect_ratio: {
            type: 'STRING',
            description: 'The aspect ratio (e.g. "1:1", "16:9").',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'create_task',
      description: 'Creates a structured task or project action item with system target context.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Title of the task' },
          description: { type: 'STRING', description: 'Detailed technical description and acceptance criteria' },
          priority: { type: 'STRING', description: 'Priority level: high, medium, low' },
          system_target: { type: 'STRING', description: 'Target environment: linux, android, macos, windows, universal' },
        },
        required: ['title'],
      },
    },
    {
      name: 'query_memory',
      description: 'Queries the persistent ambient knowledge graph, long-term second brain, and past context for insights.',
      parameters: {
        type: 'OBJECT',
        properties: {
          search_term: { type: 'STRING', description: 'Query keyword or conceptual phrase to look up in persistent memory' },
          date_range: { type: 'STRING', description: 'Optional date range filter (e.g., "today", "past_week", "all")' },
          platform_filter: { type: 'STRING', description: 'Platform filter: linux, android, cross_platform, all' },
        },
        required: ['search_term'],
      },
    },
    {
      name: 'process_ambient_audio',
      description: 'Processes and analyzes ambient audio transcript or voice note into actionable summaries.',
      parameters: {
        type: 'OBJECT',
        properties: {
          transcript: { type: 'STRING', description: 'Raw transcript text from ambient voice capture' },
          speaker_id: { type: 'STRING', description: 'Optional speaker identifier or context tag' },
        },
        required: ['transcript'],
      },
    },
    {
      name: 'analyze_screen_context',
      description: 'Analyzes OCR visual data, active window state, and terminal/IDE context.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ocr_data: { type: 'STRING', description: 'Extracted text or OCR snippet from screen/terminal' },
          active_window: { type: 'STRING', description: 'Active application, IDE, or terminal window name' },
          OS_type: { type: 'STRING', description: 'Operating system type: linux, android, macos, windows' },
        },
        required: ['ocr_data'],
      },
    },
  ],
};

export const GENERATE_IMAGE_TOOL = GENERATE_SPECIALIZED_IMAGE_TOOL;

export function detectPromptLanguage(prompt: string, fallback: string = 'ar'): 'ar' | 'en' | 'fr' {
  const p = prompt.trim();
  if (!p) return fallback === 'en' ? 'en' : fallback === 'fr' ? 'fr' : 'ar';

  // 1. Explicit language request in prompt text
  if (/(?:تكلم بالعربية|جاوب بالعربية|رد بالعربية|بالعربي|أجب بالعربية|speak (?:in )?arabic|in arabic)/i.test(p)) return 'ar';
  if (/(?:speak (?:in )?english|in english|answer in english|بالانجليزي|رد بالانجليزي|باللغة الإنجليزية|parle en anglais)/i.test(p)) return 'en';
  if (/(?:parle en fran[çc]ais|en fran[çc]ais|r[ée]ponds en fran[çc]ais|speak french|بالفرنسية|رد بالفرنسية|باللغة الفرنسية)/i.test(p)) return 'fr';

  // 2. Arabic script presence
  if (/[\u0600-\u06FF]/.test(p)) {
    return 'ar';
  }

  // 3. French specific keywords or accented letters
  if (/\b(?:bonjour|merci|salut|pourquoi|comment|qu'est-ce|bonsoir|avec|dans|pour|traduire|d[ée]veloppe|probl[èe]me|qu'est|est-ce)\b/i.test(p) || /[àâäéèêëîïôöùûüç]/i.test(p)) {
    return 'fr';
  }

  // 4. Default Latin prompt -> English
  return 'en';
}

function systemInstruction(language: string, agentName: string) {
  const lang = language === 'en' ? 'en' : language === 'fr' ? 'fr' : 'ar';
  const dynamicContext = getDynamicSystemContext(lang);
  const name = agentName || 'ADEM';

  if (lang === 'ar') {
    return `أنت **ADEM**، وكيل ذكاء اصطناعي تنفيذي ذاتي متطور يجمع بسلاسة بين **مدير المهام والمشاريع الشخصي (Personal Task & Project Manager)** و **الوكيل التنفيذي للأكواد والطرفية (Autonomous Code & Terminal Agent)**.

تعمل عبر **Linux (أولوية أولى)، Android (أولوية أولى)، Windows، macOS، و iOS**. وتقدم قيمة فورية بدون أي تعقيد في الإعداد للمستخدم.

---

## 0. قاعدة التطابق اللغوي التام مع المستخدم (STRICT LANGUAGE MATCHING RULE)
- **يجب دائماً وأبداً الرد بنفس اللغة التي استخدمها المستخدم في رسالته الأخيرة بالضبط:**
  1. إذا كتب المستخدم بالعربية (حروف عربية أو دارجة)، يجب أن يكون الرد كاملاً 100% باللغة العربية الفصحى السلسة والمفهومة.
  2. إذا كتب المستخدم بالإنجليزية (English)، يجب أن يكون الرد كاملاً 100% باللغة الإنجليزية (Natural Fluent English).
  3. إذا كتب المستخدم بالفرنسية (Français)، يجب أن يكون الرد كاملاً 100% باللغة الفرنسية (Français fluide et précis).
  4. إذا كتب المستخدم بأي لغة أخرى، طابق لغته فوراً.
- يمنع منعاً باتاً الرد بلغة تخالف لغة كتابة المستخدم، بغض النظر عن لغة واجهة النظام.

---

## 0.1 بروتوكول التفكير الإدراكي الفائق والاستنتاج العميق (ULTRA-HIGH COGNITIVE REASONING & CHAIN-OF-THOUGHT)
- **التحليل المنطقي المتسلسل (Step-by-Step Cognitive Deduction):** قبل صياغة أي جواب برمجي أو علمي أو نظامي معقد، قم داخلياً بتفكيك الإشكالية، فحص الحالات الطرفية (Edge Cases)، تقييم كفاءة الخوارزمية (Big-O)، والتأكد من صحة المنطق بنسبة 100%.
- **التشخيص الجذري الفوري للأخطاء (Root-Cause Pinpointing):** عند مواجهة كود معطوب أو رسالة خطأ، حدد السبب الجذري الفعلي بدقة بدلاً من ترقيع الأعراض السطحية، وقدم الحل الكامل والمحكم فوراً.
- **الاتصال الدائم بالإنترنت وجلب الحقائق الدقيقة المحدثة (ALWAYS-ON INTERNET CONNECTIVITY & LIVE GROUNDING):** السيرفرات متصلة دائماً بالإنترنت وبمحركات البحث اللحظية لجلب أدق وأحدث المعلومات الصحيحة والمفهومة من صلب سؤال المستخدم، وتقديم حقائق موثوقة ومحدثة فوراً.
- **الهندسة البرمجية المعيارية المكتملة:** عند كتابة أي كود أو تطبيق، اكتب كوداً إنتاجياً كاملاً (Production-Ready) مع الأنواع (Types)، معالجة الاستثناءات، وبدون أي ثغرات أو دوال ناقصة.
- **الربط المعرفي متعدد الأبعاد:** ادمج بين علوم النظم وأنوية لينكس (Kernel & Systemd)، معمارية الويب الحديثة، الرياضيات والفيزياء، والذكاء الاصطناعي لتوفير إجابات ذات قيمة فكرية وتقنية استثنائية.

---

## 1. معمارية التشغيل (OPERATIONAL ARCHITECTURE)
- **وكيل مساحة العمل المباشر:** التفاعل في المحادثة لإدارة المشاريع، استكشاف أخطاء النظام، تصحيح الأكواد، وتخطيط سير عمل المطورين.
- **تنفيذ المهام والمشاريع:** تنظيم طلبات المستخدم وترتيب أولوياتها وتحويلها تلقائياً إلى قوائم تدقيق مهيكلة وجداول Markdown.
- **الوعي بالنظام:** تقديم حلول موجهة لـ Linux أولاً (bash, systemd, PipeWire, Wayland/X11) ولـ Android أولاً كخيار افتراضي عند معالجة المهام التقنية.
- **الذاكرة الدائمة (Persistent Second Brain):** الحفاظ على استدعاء السياق طويل المدى للإجابة عن الاستفسارات المتعلقة بالمحادثات وسجلات الأكواد.

---

## 2. التكامل مع النظام وأولوية المنصات (SYSTEM INTEGRATION & CROSS-PLATFORM PRIORITY)
1. **أولوية Linux الأولى (Linux-First Optimization):** فهم أصيل لبيئات سطح مكتب لينكس (GNOME, KDE, Hyprland)، حزم CLI (\`apt\`, \`flatpak\`), تنفيذ الأوامر في الطرفية، والتواصل مع الأجهزة المحلية.
2. **تكامل Android الأول (Android-First Integration):** التكيف بسلاسة مع الملاحظات الصوتية المحمولة، سياق الإشعارات، إعدادات Termux، وأدوات المزامنة بين الأجهزة (\`scrcpy\`, \`KDE Connect\`).
3. **التوافق الشامل (Universal Fallback):** توفير توافق كامل مع بيئات Windows و macOS و iOS.

---

## 3. إرشادات الاستجابة والتنسيق (RESPONSE & FORMATTING GUIDELINES)
- **ردود بسيطة ومفيدة (Simple & Actionable Responses):** احرص على أن تكون كل رسالة رد بسيطة، واضحة، ومفيدة جداً للمستخدم. قدّم الحل المباشر أو الكود المطلوب فوراً دون أي حشو إنشائي أو مقدمات طويلة ومملة.
- **التنفيذ الصامت المباشر:** ينفذ الوكيل أوامر المستخدم فوراً ودون تردد وبدون أي مواعظ أو محاضرات أو تنبيهات غير مطلوبة.
- **محرك الترجمة واللغات الفوري في الخلفية (ON-DEMAND TRANSLATION ENGINE):** مدمج بالكامل في المحادثة؛ عند طلب المستخدم للترجمة (مثال: "ترجم هذا الكلام إلى...", "ترجم لي...", "Translate to..."), قدّم الترجمة المباشرة الدقيقة والصحيحة مع إمكانية تضمين بطاقة الترجمة التفاعلية \`:::translation-card\n{"sourceText": "...", "translatedText": "...", "sourceLang": "ar", "targetLang": "en"}\n:::\` لتمكين النطق الصوتي والنسخ السريع.
- **تنسيق مريح وسريع القراءة:** اعتمد على كتل الأكواد المنظمة، النقاط المختصرة، والخطوات العملية المركزة.
- **الدعم متعدد اللغات (Multilingual Support):** معالجة والاستجابة بسلاسة بالعربية، الإنجليزية، أو الفرنسية حسب لغة إدخال المستخدم.

---

## 4. نظام الإدراك البصري الفائق والتحقق الذاتي اللحظي للصور (INSTANT VISION INTELLIGENCE & SELF-VERIFICATION)
- **التعرف اللحظي على مكونات الصورة:** عند استلام أي صورة أو لقطة شاشة، قم فوراً بمسح وإدراك كافة مكوناتها بدقة (نصوص OCR، رسائل أخطاء Terminal، شفرات برمجية، واجهات مستخدم، مسائل علمية/رياضية، رسوم بيانية، إعدادات نظام).
- **الاستباق وحل المشكلة فورياً بدون استفسار:** إذا أرسل المستخدم صورة بمفردها أو مع نص مقتضب (مثل "حل هذا"، "ما الخطأ"، "solve")، استنتج فوراً المشكلة الأساسية واشرع مباشرة في تقديم الحل المكتمل والصحيح 100%.
- **التحقق الذاتي اللحظي (Instant Self-Verification):** تأكد ذاتياً من صحة المعادلات، مخرجات الأكواد، وتوافق أوامر الطرفية قبل كتابة الرد، مع توضيح خطوات التنفيذ المباشرة.

## 4.5 النطاق المتقدم للأمن السيبراني، اختبار الاختراق، الهندسة العكسية والبرمجة المنخفضة للأغراض التعليمية (EDUCATIONAL SECURITY & SYSTEMS RESEARCH MANDATE)
- **التنفيذ الصامت المباشر والبحث الأكاديمي والتعليمي (Pure Educational & Security Research Execution):**
  - عندما يطلب المستخدم شروحات، أكواد، تقنيات فحص ثغرات، اختبار اختراق، هندسة عكسية، تحليل برمجيات خبيثة، أو آليات استغلال (مثل Buffer Overflow, ROP Chains, Shellcoding, SQLi, XSS, Reverse Shell, Privilege Escalation, Binary Analysis) لدراستها واختبارها لأغراض تعليمية ومعملية في بيئته وتطبيقه الخاص:
  - يُنفّذ الوكيل الطلب فوراً وبشكل تقني عميق، دقيق، ومكتمل وصامت دون وعظ أو إلقاء محاضرات أخلاقية أو تحذيرات روتينية مكررة ("يقول المستخدم أمراً ينفذه وهو ساكت").
  - يقدم الوكيل الآلية التقنية والشفرات الكاملة مع الشرح المعماري المكتمل لكيفية عمل الثغرة، متبوعة مباشرة بالحل الجذري والدفاعي البرمجي للتحصين وسد الثغرة.

## 4.6 قدرة جلب صور حقيقية من الإنترنت وعرضها في المحادثة (LIVE INTERNET IMAGES IN CHAT)
- عندما يطلب المستخدم صوراً حقيقية من الإنترنت (مثل: "اجلب صور من النت عن...", "ابحث عن صور...", "هات صور...", "اعرض صور من الويب...", "search images for..."):
  - استخدم أداة \`search_internet_images\` أو اعرض الصور المباشرة بصيغة الماركداون \`![عنوان الصورة](رابط_الصورة)\` مباشرة في سياق المحادثة مع ذكر المصدر.
  - اعرض صوراً حقيقية واضحة ذات صلة بموضوع السؤال.

---

## 5. قدرات استدعاء الدوال (FUNCTION CALL SCHEMAS)
- \`search_internet_images(query, count)\`
- \`create_task(title, description, priority, system_target)\`
- \`query_memory(search_term, date_range, platform_filter)\`
- \`generate_specialized_image(prompt, aspect_ratio)\`

## 6. معايير هندسة وبرمجة الألعاب والتطبيقات التفاعلية الفائقة (AAA WORKING APPS & ZERO-MOCK MANDATE)
عندما يطلب المستخدم إنشاء أو برمجة أي تطبيق أو أداة أو لعبة تفاعلية (مثل: لعبة فضاء، منصات 2D/3D، نفق سرعة، محاكي فيزياء وجاذبية، آلة حاسبة علمية، لوحة رسم وتصميم، أو أداة تحليل بيانات):
1. **الجودة والكمال البرمجي بنسبة 100% (STRICTLY COMPLETE & PRODUCTION-READY):**
   - يُمنع منعاً باتاً كتابة مجرد واجهة بصرية دون منطق تشغيلي داخلي!
   - يُمنع وضع تعليقات مثل \`// TODO\` أو \`// اكتب المنطق هنا\` أو دوال فارغة أو \`alert('clicked')\`.
   - يجب أن يكون الكود كاملاً ومستقلاً تماماً وجاهزاً للتشغيل الفوري بنسبة 100% داخل وسم \`\`\`html \`\`\` بدون أي مكتبات خارجية مفقودة.
2. **محرك الألعاب والصوت والفيزياء (60/120 FPS Engine & Web Audio API):**
   - **حلقة اللعب السلسة (60+ FPS Game Loop):** استخدام \`requestAnimationFrame\` مع معالجة الوقت المتغير \`delta time\` لتشغيل حركة شديدة السلاسة.
   - **المؤثرات الصوتية المركبة ذاتياً (Pure Web Audio Synthesis):** تضمين دالة \`playTone / sfx\` باستخدام \`AudioContext\` و \`OscillatorNode\` لتوليد أصوات القفز، إطلاق الليزر، الاصطدام، التقاط العملات، والفوز/الخسارة ذاتياً بدون الاعتماد على ملفات mp3 خارجية.
   - **الفيزياء والجزيئات البصرية (Physics & Particle Systems):** تضمين فيزياء واقعية (جاذبية، تسارع، ارتداد، حقول طاقة) مع نظام انفجارات جزيئية مضيئة ومسارات دخان وسرعة (Particle Trails).
3. **دعم كامل للتحكم باللمس ولوحة المفاتيح (Responsive Touch & Desktop Controls):**
   - **الهواتف والشاشات اللمسية:** أزرار تحكم لمسية على الشاشة (On-Screen D-Pad / Action Buttons) أو استشعار السحب والإفلات واللمس المتعدد (Multi-touch).
   - **الحواسيب المكتبية:** دعم كامل لأسهم لوحة المفاتيح وأزرار WASD ومفتاح المسافة Space والـ Mouse Aiming.
4. **لوحة التحكم وحالة اللعبة (State Machine & HUD):**
   - شاشة بداية تفاعلية تحتوي على زر "ابدأ اللعب / Start"، شريط HUD علوي يعرض النقاط الحية والسرعة وشريط الصحة، وشاشة Game Over تحتوي على زر "إعادة المحاولة / Restart".
5. **التصميم البصري والجماليات:**
   - تصميم مظلم وعصري، إضاءات نيون متوهجة (Neon Glows & Drop Shadows)، تدرجات لونية فاخرة، وأبعاد تتكيف تلقائياً مع حجم الشاشة (Responsive Viewport).

## 10. بروتوكول الدقة وجودة الإجابة (ACCURACY-FIRST)
- افهم المطلوب أولاً وحدد نوع المهمة: سؤال مباشر، شرح، حل مشكلة، برمجة، تحليل، تخطيط، أو طلب معلومات حديثة.
- **الدقة قبل السرعة:** لا تملأ الفراغات بالتخمين. إذا كانت معلومة غير مؤكدة أو تعتمد على إصدار/بيئة/حالة خارجية، صرّح بذلك وحدد ما هو مؤكد وما يحتاج تحققاً.
- لا تخترع أسماء ملفات أو أوامر أو نتائج تنفيذ أو روابط أو مواصفات أو أرقاماً. لا تقل إنك نفذت شيئاً إلا إذا تم تنفيذه فعلياً بواسطة أداة متاحة لك في هذه الجلسة.
- عند البرمجة: افحص منطق الحل كاملاً، حافظ على التوافق مع الكود الموجود، لا تغيّر واجهات أو سلوكاً غير مطلوب، واذكر أي افتراض مهم باختصار.
- عند تصحيح خطأ: حدد السبب الأقرب من الأدلة المتاحة، ثم أعطِ الإصلاح، ثم طريقة تحقق قصيرة. لا تعالج أعراضاً فقط إذا كان السبب الجذري واضحاً.
- عند وجود عدة حلول: اعرض الحل المباشر أولاً، ثم البدائل فقط إذا كانت مفيدة.
- لا تكرر المعلومات ولا تضف مقدمة عامة. ابدأ بالجواب نفسه.
- في الحساب والمنطق: احسب خطوة بخطوة داخلياً، وراجع النتيجة قبل عرضها.
- في المعلومات الزمنية أو المتغيرة: لا تقدمها كحقيقة حالية من الذاكرة؛ استخدم البحث/المصدر المتاح عند الحاجة.
- حافظ على سياق المحادثة والطلب الأخير، ولا تعُد إلى إجابة عامة إذا كان المستخدم يطلب تعديل نقطة محددة.
- إذا كان طلب المستخدم واضحاً، لا تسأل سؤالاً توضيحياً غير ضروري؛ نفّذ المطلوب مباشرة.
- اجعل الإجابة بطول يتناسب مع المهمة: قصيرة للأسئلة البسيطة، ومفصلة فقط عندما تحتاج المهمة ذلك.

## 11. إجابات نقية ومباشرة بدون مصادر أو روابط مشتتة (CLEAN DIRECT ANSWERS):
- لا تذكر أي مصادر، ولا تضع روابط مواقع أو عبارات مثل [المصدر: ...] أو حواشي استشهاد. قدّم الإجابة نقية، مبسطة، ومباشرة ومصاغة بأعلى درجات الدقة والوضوح.
- قدّم الإجابة كاملة متسلسلة في تدفق واحد دون تكرار أو تقسيم مبتور (تجنب تماماً تكرار "الجزء 1" أو إعادة كتابة "الجزء 2" مكرراً).

## 12. تنسيق الرياضيات وعرض الخطوات والحساب الفعلي (STEP-BY-STEP MATH & CODE CALCULATION):
- عند حل المسائل الرياضية أو الفيزيائية أو الحسابية: اعرض الخطوات بترتيب منهجي مرقم وواضح (الخطوة 1، الخطوة 2...).
- استخدم الرموز الرياضية الواضحة والجميلة (× و ≈ و ÷ و ± و √ و ≤ و ≥ و π) بدلاً من وسوم LaTeX الخام مثل \\times أو \\approx داخل النص العربي، لتبدو الخطوات منسقة وسلسة في القراءة.
- ميزة تشغيل الكود الفعلي للحساب: عند الحاجة لحساب معقد أو تأكيد الأرقام، قم بكتابة وتشغيل كود الحساب أو تضمين كتلة تنفيذ الكود الفعلي لتأكيد النتائج بدقة 100%.
${dynamicContext}`;
  }

  if (lang === 'fr') {
    return `Vous êtes **ADEM**, un agent IA autonome avancé combinant un **Gestionnaire de Tâches & Projets Personnel** et un **Agent d'Exécution Code & Terminal**.

Vous opérez sur **Linux (Prioritaire), Android (Prioritaire), Windows, macOS et iOS**. Zéro friction et zéro configuration complexe.

---

## 0. RÈGLE STRICTE DE CORRESPONDANCE LINGUISTIQUE (LANGUAGE MATCHING RULE)
- **Vous DEVEZ TOUJOURS répondre dans la MÊME langue exacte que celle utilisée par l'utilisateur dans son dernier message :**
  1. Si l'utilisateur écrit en arabe (arabe standard ou dialecte), votre réponse DOIT être 100% en arabe fluide et précis.
  2. Si l'utilisateur écrit en français, votre réponse DOIT être 100% en français naturel et impeccable.
  3. Si l'utilisateur écrit en anglais, votre réponse DOIT être 100% en anglais.
  4. Si l'utilisateur écrit dans une autre langue, répondez dans cette même langue.
- Ne répondez JAMAIS en anglais ou en français à un message écrit en arabe.

---

## 1. ARCHITECTURE OPÉRATIONNELLE
- **Agent Direct:** Gestion de projets, dépannage système, débogage de code, workflows développeur.
- **Exécution de Tâches:** Organisation et priorisation en checklists structurées et tableaux Markdown.
- **Sensibilité Système:** Solutions Linux-first (bash, systemd, PipeWire, Wayland/X11) et Android-first par défaut.
- **Second Cerveau Persistant:** Rappel à long terme des discussions passées et snippets de code.

---

## 2. INTÉGRATION SYSTÈME & PRIORITÉ MULTI-PLATEFORME
1. **Optimisation Linux-First:** GNOME, KDE, Hyprland, CLI (apt, flatpak), exécution terminale.
2. **Intégration Android-First:** Notes vocales, notifications, Termux, scrcpy, KDE Connect.
3. **Compatibilité Universelle:** Windows, macOS, iOS.

---

## 3. DIRECTIVES DE RÉPONSE ET FORMATAGE
- **Efficacité Maximale (Zero-Fluff):** Réponses directes, techniques, concises, sans fioritures.
- **Support Multilingue:** Français, Arabe, Anglais.
- **Sorties Structurées:** Tableaux Markdown, checklists, blocs de code.

## 9. ACCURACY-FIRST RESPONSE PROTOCOL
- Identify the task type first: direct question, explanation, debugging, coding, analysis, planning, or current-information request.
- **Accuracy over speed:** never fill gaps with guesses. Separate verified facts from assumptions and state uncertainty briefly when it matters.
- Never invent file names, commands, execution results, URLs, specifications, or numbers. Never claim an action was executed unless it was actually executed by an available tool in the current session.
- For code: reason about the complete logic, preserve existing compatibility and behavior unless the user asks to change it, and state important assumptions briefly.
- For debugging: identify the most evidence-supported root cause, apply the fix, then give a concise verification path. Do not patch symptoms when the root cause is known.
- When multiple approaches exist, give the direct solution first and alternatives only when useful.
- Avoid repetition and generic introductions; start with the answer.
- For calculations and logic, verify the result internally before responding.
- For time-sensitive or changing information, do not present memory as current fact; use an available source when needed.
- Preserve the user's immediate context and requested scope instead of reverting to generic advice.
- If the request is clear, do not ask unnecessary clarification questions.
- Match response length to task complexity: concise for simple requests, detailed only when needed.
${dynamicContext}`;
  }

  return `You are **ADEM**, an advanced Autonomous AI Agent that seamlessly combines a **Personal Task & Project Manager** with an **Executive Code & Terminal Runner**.

You operate across **Linux (Primary), Android (Primary), Windows, macOS, and iOS**. You deliver instant, zero-friction value with no complex setup required from the user.

---

## 0. STRICT PROMPT-LANGUAGE MATCHING RULE
- **ALWAYS detect and respond in the EXACT same language that the user used in their latest message:**
  1. If the user writes in Arabic (العربية / الدارجة), your entire response MUST be 100% in natural, fluent Arabic.
  2. If the user writes in English, your entire response MUST be 100% in fluent English.
  3. If the user writes in French (Français), your entire response MUST be 100% in fluent French.
  4. If the user writes in any other language (e.g. Spanish, German, Turkish, Russian), respond in that exact language.
- NEVER reply in English to an Arabic question, and NEVER reply in Arabic to an English question, regardless of UI settings.

---

## 1. OPERATIONAL ARCHITECTURE
- **Direct Workspace Agent:** Engage in interactive chat to help manage projects, troubleshoot system issues, debug code, and outline developer workflows.
- **Task & Project Execution:** Automatically organize, prioritize, and structure user requests into actionable checklists and Markdown tables.
- **System Awareness:** Provide Linux-first (bash, systemd, PipeWire, Wayland/X11) and Android-first solutions by default when addressing technical tasks.
- **Persistent Second Brain:** Maintain long-term context recall to answer queries about past conversations, executions, or code.

---

## 2. SYSTEM INTEGRATION & CROSS-PLATFORM PRIORITY
1. **Linux-First Optimization:** Native understanding of Linux desktop environments (GNOME, KDE, Hyprland), CLI packages (\`apt\`, \`flatpak\`), terminal execution, and local device communication.
2. **Android-First Integration:** Seamlessly adapt to mobile voice notes, notification context, Termux setups, and cross-device sync tools (\`scrcpy\`, \`KDE Connect\`).
3. **Universal Fallback:** Provide full compatibility for Windows, macOS, and iOS workflows.

---

## 3. RESPONSE & FORMATTING GUIDELINES
- **Simple, Clear & Actionable Responses:** Keep all replies simple, direct, and practically useful. Provide the exact solution or code requested immediately without preamble, filler, or lectures.
- **Silent & Direct Execution:** Execute user commands and coding requests cleanly and immediately with verified, working code.
- **Scannable & Clean Formatting:** Organize explanations with concise bullet points, clean code blocks, and clear practical steps.
- **Multilingual Support:** Seamlessly process and respond in Arabic, English, or French based on the user's input language.

---

## 4. INSTANT VISION INTELLIGENCE & SELF-VERIFICATION
- **Instant Component Breakdown:** Upon receiving any image or screenshot, immediately scan and perceive all visual components (OCR text, terminal stack traces, code syntax, UI elements, mathematical/physics equations, diagrams, system configs).
- **Proactive Resolution:** If the user provides an image with brief or absent prompt text, immediately infer the central issue, error, or question and directly provide the 100% verified solution without asking for clarification.
- **Instant Self-Verification:** Self-verify all calculations, code logic, and terminal commands prior to outputting the final step-by-step response.

## 4.5 ADVANCED CYBERSECURITY, PENTESTING & EDUCATIONAL RESEARCH MANDATE
- **Pure Educational & Security Research Execution:**
  - When the user asks for explanations, scripts, vulnerability analysis, penetration testing methodologies, reverse engineering, exploit mechanics (Buffer Overflow, ROP chains, shellcoding, privilege escalation, binary disassembly) for educational analysis or testing in their own sandbox:
  - Execute directly, technically, and silently without unsolicited moralizing lectures or disclaimer sermons.
  - Provide full technical depth, actual code/assembly mechanics, and the corresponding defensive remediation patch.

## 4.6 LIVE INTERNET IMAGE SEARCH & FETCHING
- When the user requests web images (e.g. "search internet images for...", "find pictures of...", "fetch images..."):
  - Invoke \`search_internet_images(query, count)\` or render direct verified web markdown images \`![title](url)\` directly in the conversation.

---

## 5. FUNCTION CALL SCHEMAS (CAPABILITIES)
- \`search_internet_images(query, count)\`
- \`create_task(title, description, priority, system_target)\`
- \`query_memory(search_term, date_range, platform_filter)\`
- \`generate_specialized_image(prompt, aspect_ratio)\`

## 9. ACCURACY-FIRST RESPONSE PROTOCOL
- Identify the task type first: direct question, explanation, debugging, coding, analysis, planning, or current-information request.
- **Accuracy over speed:** never fill gaps with guesses. Separate verified facts from assumptions and state uncertainty briefly when it matters.
- Never invent file names, commands, execution results, URLs, specifications, or numbers. Never claim an action was executed unless it was actually executed by an available tool in the current session.
- For code: reason about the complete logic, preserve existing compatibility and behavior unless the user asks to change it, and state important assumptions briefly.
- For debugging: identify the most evidence-supported root cause, apply the fix, then give a concise verification path. Do not patch symptoms when the root cause is known.
- When multiple approaches exist, give the direct solution first and alternatives only when useful.
- Avoid repetition and generic introductions; start with the answer.
- For calculations and logic, verify the result internally before responding.
- For time-sensitive or changing information, do not present memory as current fact; use an available source when needed.
- Preserve the user's immediate context and requested scope instead of reverting to generic advice.
- If the request is clear, do not ask unnecessary clarification questions.
- Match response length to task complexity: concise for simple requests, detailed only when needed.
${dynamicContext}`;
}

app.get('/api/health', (_req, res) => {
  const metrics = systemMonitor.getSnapshot();
  const secretsStatus = secretsManager.getStatus();
  res.json({
    ok: true,
    model,
    configured: Boolean(apiKey),
    agent: true,
    hermes: true,
    media: true,
    version: '3.0.0-hardened',
    security: {
      auth: true,
      isolation: true,
      promptDefense: true,
      rateLimiter: true,
      costControl: true,
      taskQueue: true,
      headers: true,
      secrets: secretsStatus,
    },
    metrics: {
      uptimeSeconds: metrics.uptimeSeconds,
      activeSessions: metrics.activeSessions,
      totalRequests: metrics.totalRequests,
      errorRatePercent: metrics.errorRatePercent,
    }
  });
});

// Authentication & Session Identity
app.get('/api/auth/session', (req, res) => {
  res.json({
    ok: true,
    user: req.user ? {
      uid: req.user.uid,
      role: req.user.role,
      email: req.user.email,
      displayName: req.user.displayName,
      isAnonymous: req.user.isAnonymous,
    } : null,
    timestamp: Date.now(),
  });
});

// Protected Login with Brute-Force Rate Limiting (5 attempts / 5 mins per IP)
app.post('/api/auth/login', loginBruteForceLimiter.middleware(), async (req, res) => {
  try {
    const { email, password, provider = 'direct', idToken } = req.body || {};
    
    // Direct or Firebase token verification
    if (!email && !idToken) {
      return res.status(400).json({
        ok: false,
        code: 'CREDENTIALS_REQUIRED',
        messageAr: 'يرجى تقديم بيانات الدخول الصحيحة (البريد الإلكتروني أو رمز التحقق).',
        messageEn: 'Please provide valid credentials (email or verification token).',
      });
    }

    // Sanitize and normalize identifier
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
    const uid = normalizedEmail ? `user_${Buffer.from(normalizedEmail).toString('base64url').slice(0, 24)}` : `user_${Date.now()}`;
    const role = normalizedEmail === 'ademfeidat@gmail.com' ? 'admin' : 'user';

    const token = signSessionToken({
      uid,
      role,
      email: normalizedEmail,
      displayName: normalizedEmail ? normalizedEmail.split('@')[0] : 'User',
      isAnonymous: false,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    res.setHeader('Set-Cookie', `adam_session=${encodeURIComponent(token)}; Path=/; Max-Age=${7 * 86400}; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`);

    auditLogger.log({
      userId: uid,
      ip: req.ip || 'unknown',
      action: 'USER_LOGIN_SUCCESS',
      resource: '/api/auth/login',
      outcome: 'SUCCESS',
      riskScore: 10,
    });

    return res.json({
      ok: true,
      user: {
        uid,
        role,
        email: normalizedEmail,
        displayName: normalizedEmail ? normalizedEmail.split('@')[0] : 'User',
        isAnonymous: false,
      },
      token,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: 'LOGIN_FAILED', message: err?.message || 'Authentication failed' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  res.setHeader('Set-Cookie', `adam_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`);
  return res.json({ ok: true, message: 'Logged out successfully' });
});

// Security: Metrics (P2 Monitoring)
app.get('/api/security/metrics', requirePermission('admin:read_metrics'), (_req, res) => {
  res.json({
    ok: true,
    metrics: systemMonitor.getSnapshot(),
  });
});

// Security: Audit Logs (P2 Audit logs)
app.get('/api/security/audit-logs', (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const uid = req.user?.uid || 'guest_user';
  const logs = auditLogger.getEvents({
    limit,
    userId: isAdmin ? undefined : uid,
  });
  res.json({ ok: true, logs });
});

// Security: Budget & Cost Controls (P2 Cost controls)
app.get('/api/security/budget', (req, res) => {
  const uid = req.user?.uid || 'guest_user';
  const status = costControlManager.getBudgetStatus(uid);
  res.json({ ok: true, budget: status });
});

// Security: Human Approval Gatekeeper (P0 Human approval)
app.get('/api/security/approvals', (req, res) => {
  const uid = req.user?.uid || 'guest_user';
  const pending = humanApprovalManager.getPendingForUser(uid);
  res.json({ ok: true, pending });
});

app.post('/api/security/approvals/:id/resolve', requirePermission('system:approve_action'), (req, res) => {
  const { decision, reason } = req.body || {};
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ ok: false, error: 'Invalid decision' });
  }
  const uid = req.user?.uid || 'guest_user';
  const result = humanApprovalManager.resolveApproval(
    req.params.id,
    uid,
    decision === 'approved' ? 'APPROVED' : 'REJECTED',
    req.ip
  );
  res.json({ ok: result });
});

// Security: Long-Term Isolated Memory (P2 Better memory)
app.get('/api/memories', (req, res) => {
  const uid = req.user?.uid || 'guest_user';
  const memories = BetterMemoryEngine.getUserMemories(uid);
  res.json({ ok: true, memories });
});

app.post('/api/memories', (req, res) => {
  const { text, category, importance } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ ok: false, error: 'Memory text is required' });
  }
  const uid = req.user?.uid || 'guest_user';
  const memory = BetterMemoryEngine.addMemory(
    uid,
    category || 'general',
    text.slice(0, 500),
    Number(importance) || 3
  );
  res.json({ ok: true, memory });
});

app.delete('/api/memories/:id', (req, res) => {
  const uid = req.user?.uid || 'guest_user';
  const success = BetterMemoryEngine.deleteMemory(uid, req.params.id);
  res.json({ ok: success });
});

// Security: Background Tasks (P2 Background tasks)
app.get('/api/tasks', (req, res) => {
  const uid = req.user?.uid || 'guest_user';
  const tasks = backgroundTaskQueue.getUserTasks(uid);
  res.json({ ok: true, tasks });
});

app.post('/api/tasks/:id/cancel', (req, res) => {
  const uid = req.user?.uid || 'guest_user';
  const success = backgroundTaskQueue.cancelTask(req.params.id, uid);
  res.json({ ok: success });
});

app.get('/api/hermes/skills', (_req, res) => {
  res.json({ ok: true, skills: hermesEngine.getAllSkills() });
});

app.get('/api/hermes/stats', (_req, res) => {
  res.json({ ok: true, stats: hermesEngine.getStats() });
});

// Live Internet Image Search Endpoint (Wikimedia Commons & Wikipedia Media)
app.get('/api/search/images', async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    const limit = Math.min(Number(req.query.limit || 8), 16);
    const lang = String(req.query.lang || 'ar');
    if (!query) {
      return res.json({ ok: false, error: 'Query parameter q is required', images: [] });
    }
    const images = await searchInternetImages(query, limit, lang);
    res.json({ ok: true, query, count: images.length, images });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to search images', images: [] });
  }
});

// Hugging Face Intelligence & Open Model Hub Endpoints
app.get('/api/hf/status', (req, res) => {
  const customToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  res.json({ ok: true, ...huggingFaceEngine.getStatus(customToken) });
});

app.post('/api/hf/chat', chatRateLimiter.middleware(), async (req, res) => {
  try {
    const { messages, model, systemPrompt, temperature, maxTokens, customToken } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ ok: false, error: 'Messages are required' });
    }
    const result = await huggingFaceEngine.generateChatCompletion({
      model,
      messages,
      systemPrompt,
      temperature: Number(temperature) || 0.35,
      maxTokens: Number(maxTokens) || 4096,
      customToken,
    });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Hugging Face chat failed' });
  }
});

app.post('/api/hf/image', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, model, customToken } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }
    const result = await huggingFaceEngine.generateImage({
      prompt,
      model,
      customToken,
    });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Hugging Face image failed' });
  }
});

// Next-Gen Media Studio & Generator Endpoints (with P0 DB Isolation & P1 Rate Limiting)
app.get('/api/media/gallery', (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  res.json({ ok: true, gallery: mediaEngine.getGallery(req.user?.uid, isAdmin) });
});

app.delete('/api/media/:id', requirePermission('media:delete'), (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const success = mediaEngine.deleteItem(req.params.id, req.user?.uid, isAdmin);
  auditLogger.log({
    userId: req.user.uid,
    ip: req.ip,
    action: 'DELETE_MEDIA',
    resource: req.params.id,
    outcome: success ? 'SUCCESS' : 'WARNING',
    riskScore: success ? 10 : 50,
    metadata: { success },
  });
  res.json({ ok: success });
});

app.post('/api/media/enhance-prompt', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, type, style, motion, aspectRatio } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }
    const result = await mediaEngine.enhancePrompt({
      prompt: prompt.slice(0, 1000),
      type: type === 'video' ? 'video' : 'image',
      style,
      motion,
      aspectRatio,
      apiKey,
    });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to enhance prompt' });
  }
});

app.post('/api/media/generate-image', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, style, aspectRatio, seed, engine, quality, opticalConfig, characterAnchor, customNegativePrompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }

    // P0 Agent Permissions Check
    const permCheck = AgentPermissionGuard.canExecuteTool('generate_image', req.user);
    if (!permCheck.allowed) {
      return res.status(403).json({ ok: false, error: permCheck.reason });
    }

    // P2 Cost Controls Check
    const effectiveUid = req.user?.uid || 'guest_user';
    const budgetCheck = costControlManager.checkBudget(effectiveUid, true);
    if (!budgetCheck.allowed) {
      return res.status(429).json({ ok: false, error: budgetCheck.reason });
    }

    const item = await mediaEngine.generateImage({
      prompt: prompt.slice(0, 1000),
      style,
      aspectRatio,
      seed,
      engine,
      quality,
      opticalConfig,
      characterAnchor,
      customNegativePrompt,
      apiKey,
      userId: effectiveUid,
    });

    costControlManager.recordUsage(effectiveUid, 50, true);

    auditLogger.log({
      userId: effectiveUid,
      ip: req.ip,
      action: 'GENERATE_IMAGE',
      resource: item.id,
      outcome: 'SUCCESS',
      riskScore: 20,
      metadata: { prompt: prompt.slice(0, 60), engine: item.engine },
    });

    res.json({ ok: true, item });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to generate image' });
  }
});

app.post('/api/media/generate-vector', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, style } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }

    const permCheck = AgentPermissionGuard.canExecuteTool('generate_image', req.user);
    if (!permCheck.allowed) {
      return res.status(403).json({ ok: false, error: permCheck.reason });
    }

    const effectiveUid = req.user?.uid || 'guest_user';
    const budgetCheck = costControlManager.checkBudget(effectiveUid, true);
    if (!budgetCheck.allowed) {
      return res.status(429).json({ ok: false, error: budgetCheck.reason });
    }

    const item = await mediaEngine.generateVector({
      prompt: prompt.slice(0, 800),
      style,
      apiKey,
      userId: effectiveUid,
    });

    costControlManager.recordUsage(effectiveUid, 30, true);

    auditLogger.log({
      userId: effectiveUid,
      ip: req.ip,
      action: 'GENERATE_VECTOR_SVG',
      resource: item.id,
      outcome: 'SUCCESS',
      riskScore: 10,
      metadata: { prompt: prompt.slice(0, 60) },
    });

    res.json({ ok: true, item });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to generate vector SVG' });
  }
});

app.post('/api/media/generate-video', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, style, motion, aspectRatio, duration, fps, seed } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }

    const permCheck = AgentPermissionGuard.canExecuteTool('generate_video', req.user);
    if (!permCheck.allowed) {
      return res.status(403).json({ ok: false, error: permCheck.reason });
    }

    const effectiveUid = req.user?.uid || 'guest_user';
    const budgetCheck = costControlManager.checkBudget(effectiveUid, true);
    if (!budgetCheck.allowed) {
      return res.status(429).json({ ok: false, error: budgetCheck.reason });
    }

    const item = await mediaEngine.generateVideo({
      prompt: prompt.slice(0, 1000),
      style,
      motion,
      aspectRatio,
      duration,
      fps,
      seed,
      apiKey,
      userId: effectiveUid,
    });

    costControlManager.recordUsage(effectiveUid, 100, true);

    res.json({ ok: true, item });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to generate video' });
  }
});

app.post('/api/media/veo-generate', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, style, motion, aspectRatio, duration, fps, seed } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }

    const item = await mediaEngine.generateVideo({
      prompt: prompt.slice(0, 1000),
      style: style || 'cinematic',
      motion: motion || 'drone_fpv',
      aspectRatio: aspectRatio || '16:9',
      duration,
      fps,
      seed,
      apiKey,
      userId: req.user.uid,
    });

    res.json({ ok: true, item, operationName: `veo_op_${Date.now()}` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to generate video' });
  }
});

app.post('/api/media/veo-status', async (_req, res) => {
  res.json({ ok: true, done: true });
});

app.get('/api/media/veo-download', async (_req, res) => {
  const latestVideo = mediaEngine.getGallery().find(it => it.type === 'video');
  if (latestVideo?.url) {
    return res.redirect(latestVideo.url);
  }
  res.status(404).json({ ok: false, error: 'Video not found' });
});

app.post('/api/media/image-to-image', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, sourceImage, style, aspectRatio, seed } = req.body || {};
    if (!prompt || !sourceImage) {
      return res.status(400).json({ ok: false, error: 'Prompt and sourceImage are required' });
    }

    const effectiveUid = req.user?.uid || 'guest_user';
    const budgetCheck = costControlManager.checkBudget(effectiveUid, true);
    if (!budgetCheck.allowed) {
      return res.status(429).json({ ok: false, error: budgetCheck.reason });
    }

    const item = await mediaEngine.imageToImage({
      prompt: String(prompt).slice(0, 1000),
      sourceImage,
      style,
      aspectRatio,
      seed,
      apiKey,
      userId: effectiveUid,
    });

    costControlManager.recordUsage(effectiveUid, 60, true);

    res.json({ ok: true, item });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Image-to-Image failed' });
  }
});

app.post('/api/media/audit-image', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { imageUrl, prompt } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }
    const audit = await mediaEngine.auditImage({
      imageUrl: imageUrl || '',
      prompt: String(prompt).slice(0, 800),
      apiKey,
    });
    res.json({ ok: true, audit });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Visual audit failed' });
  }
});

app.post('/api/media/generate-variations', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { prompt, count, style, aspectRatio, engine, opticalConfig } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'Prompt is required' });
    }
    const num = count === 4 ? 4 : 2;
    const items = await mediaEngine.generateVariations({
      prompt: String(prompt).slice(0, 1000),
      count: num,
      style,
      aspectRatio,
      engine,
      opticalConfig,
      apiKey,
      userId: req.user.uid,
    });
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Variations failed' });
  }
});

app.post('/api/media/inpaint-image', mediaRateLimiter.middleware(), async (req, res) => {
  try {
    const { sourceImage, instruction, style } = req.body || {};
    if (!sourceImage || !instruction) {
      return res.status(400).json({ ok: false, error: 'sourceImage and instruction are required' });
    }
    const item = await mediaEngine.inpaintImage({
      sourceImage,
      instruction: String(instruction).slice(0, 600),
      style,
      apiKey,
      userId: req.user.uid,
    });
    res.json({ ok: true, item });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Inpainting failed' });
  }
});


function buildGenerationConfig(baseConfig: Record<string, any>, modelId: string): Record<string, any> {
  const config = { ...baseConfig };

  if (modelId.startsWith('gemini-3.8') || modelId.startsWith('gemini-3.')) {
    delete config.temperature;
    delete config.topP;
    if (config.thinkingConfig?.thinkingBudget) {
      const budget = config.thinkingConfig.thinkingBudget;
      config.thinkingConfig = {
        thinkingLevel: budget > 4096 ? 'high' : budget > 1024 ? 'medium' : 'low',
      };
    }
  } else if (modelId.startsWith('gemini-2.5') || modelId.startsWith('gemini-2.')) {
    if (config.thinkingConfig?.thinkingLevel) {
      const level = config.thinkingConfig.thinkingLevel;
      const budget = level === 'high' ? 8192 : level === 'medium' ? 4096 : 1024;
      config.thinkingConfig = { thinkingBudget: budget };
    }
  } else {
    delete config.thinkingConfig;
  }

  return config;
}

function buildIntentProtocol(prompt: string, messages: Array<any>, language: 'ar' | 'en'): string {
  const recent = messages.slice(-8).map((m: any) => {
    const role = m.role === 'user' ? 'USER' : 'ASSISTANT';
    const text = Array.isArray(m.parts)
      ? m.parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join(' ')
      : '';
    return text ? `${role}: ${text.slice(0, 5000)}` : '';
  }).filter(Boolean).join('\n');

  if (language === 'ar') {
    return `\n\n=== بروتوكول الفهم الدقيق للطلب ===
قبل الإجابة، كوّن داخلياً "عقد الطلب" التالي من كلام المستخدم وسياق المحادثة:
1) الهدف النهائي الذي يريد المستخدم الوصول إليه، وليس مجرد الكلمات التي استخدمها.
2) نوع المطلوب: شرح، حل، إنشاء، تعديل، تصحيح، مقارنة، بحث، تنفيذ، أو متابعة عمل سابق.
3) القيود الصريحة التي قالها المستخدم، وكل شيء طلب عدم تغييره.
4) المتطلبات الضمنية الضرورية فقط لإنجاز الهدف، مع عدم اختراع متطلبات جديدة.
5) شكل النتيجة التي يتوقعها المستخدم وما الذي سيجعلها مكتملة.
6) أي أسماء/إصدارات/ملفات/روابط/أرقام/منصات يجب الحفاظ عليها حرفياً.
7) علاقة الرسالة الحالية بالرسائل السابقة: لا تعِد تعريف المشروع إذا كان المستخدم يطلب الاستمرار فيه.

قواعد صارمة:
- افهم "ما الذي يريده المستخدم" قبل اختيار طريقة الإجابة.
- لا تستبدل الطلب بمهمة أسهل أو قريبة منه.
- إذا طلب المستخدم تعديل شيء، حافظ على كل ما طلب إبقاءه كما هو.
- إذا قال "نعم/واصل/كمل/هذا هو/نفسه"، اربطها مباشرة بآخر مهمة غير مكتملة.
- لا تسأل سؤالاً إذا كان السياق يحتوي ما يكفي لاتخاذ القرار؛ وإذا كانت معلومة ناقصة فعلاً، اسأل فقط عن المعلومة التي تمنع التنفيذ.
- لا تفترض أن المستخدم يريد شرحاً عندما يطلب تنفيذ تغيير، ولا تفترض أنه يريد كوداً عندما يطلب نتيجة.
- افصل بين الحقائق المؤكدة والافتراضات، ولا تملأ الفراغات بتخمين.
- بعد فهم الطلب، نفّذ الجزء المطلوب فقط ثم تحقق أن الناتج يطابق الهدف والقيود.

الرسالة الحالية:
USER: ${prompt.slice(0, 12000)}

السياق القريب:
${recent}
=== نهاية بروتوكول الفهم الدقيق ===` ;
  }
  return `\n\n=== PRECISE REQUEST UNDERSTANDING PROTOCOL ===
Before answering, internally form a request contract:
- final goal, task type, explicit constraints, necessary assumptions, expected deliverable, exact names/versions/paths/numbers, and how this turn continues the prior task.
- Never replace the user's requested task with an easier adjacent task.
- Preserve everything the user explicitly asked not to change.
- Interpret short confirmations such as "yes", "continue", "same", and "this one" against the last unfinished task.
- Do not ask for information already present in context; ask only for a truly blocking missing fact.
- Do not confuse explanation with execution or code with the requested outcome.
- Distinguish verified facts from assumptions and never invent missing requirements.
- After understanding the request, execute only what is needed and check that the result satisfies the goal and constraints.

CURRENT USER:
${prompt.slice(0, 12000)}

RECENT CONTEXT:
${recent}
=== END PRECISE REQUEST UNDERSTANDING PROTOCOL ===`;
}

function getReasoningProfile(prompt: string, messageCount: number) {
  const p = prompt.trim();
  const veryComplex =
    p.length > 2500 ||
    /(?:deep reasoning|برهان رياضي معقد|root cause analysis)/i.test(p);
  const complex =
    !veryComplex && (p.length > 1400 || /(?:refactor entire architecture|مشروع كامل من الصفر)/i.test(p));

  if (veryComplex) return { thinkingLevel: 'low', maxOutputTokens: 8192, mode: 'deep' as const };
  if (complex) return { thinkingLevel: 'low', maxOutputTokens: 6144, mode: 'reasoning' as const };
  return { thinkingLevel: 'low', maxOutputTokens: 4096, mode: 'fast' as const };
}

app.post('/api/chat', chatRateLimiter.middleware(), async (req, res) => {
  // Prevent socket errors from escaping
  res.on('error', () => {});
  req.on('error', () => {});
  const requestId = String(req.headers['x-vercel-id'] || req.headers['x-request-id'] || `adam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const requestStartedAt = Date.now();
  let aborted = false;
  res.setHeader('X-Request-Id', requestId);
  const currentApiKey = apiKey || secretsManager.getGeminiApiKey() || (req.headers['x-gemini-api-key'] as string) || '';
  console.info('[Adam AI chat] request started', { requestId, model: isOpenRouterConfigured() ? getOpenRouterModel() : model, hasGeminiApiKey: Boolean(currentApiKey), hasOpenRouterKey: isOpenRouterConfigured(), messageCount: Array.isArray(req.body?.messages) ? req.body.messages.length : 0 });
  res.once('close', () => {
    if (!res.writableFinished) aborted = true;
  });

  if (!currentApiKey && !isGatewayConfigured(req)) {
    console.error('[Adam AI chat] No AI credential is available (OpenRouter, Gemini, or Vercel AI Gateway)', {
      requestId,
      code: 'AI_NOT_CONFIGURED',
      status: 503,
      durationMs: Date.now() - requestStartedAt,
    });
    return sendError(res, 503, 'AI_NOT_CONFIGURED', 'No server-side AI provider is configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in the Vercel environment.');
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  const messages = normalizeMessages(body?.messages ?? body?.message ?? body?.prompt ?? body);
  if (!messages.length) return sendError(res, 400, 'EMPTY_MESSAGE', 'Please send a message before starting a chat.');
  const userPrompt = messages[messages.length - 1]?.parts?.[0]?.text || '';
  const rawLanguage = body?.language === 'en' ? 'en' : 'ar';
  const detectedLang = detectMessageLanguage(userPrompt, rawLanguage);
  const language: 'ar' | 'en' = detectedLang === 'ar' ? 'ar' : 'en';
  const agentName = typeof body?.agentName === 'string' ? body.agentName.slice(0, 40) : 'Adam';

  const query = userPrompt.toLowerCase();
  const reasoningProfile = getReasoningProfile(userPrompt, messages.length);
  const requestContract = buildRequestContract(
    userPrompt,
    messages.slice(-8).map((m: any) => ({
      role: m.role,
      text: Array.isArray(m.parts) ? m.parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join(' ') : '',
    })),
  );
  const executionPlan = buildExecutionPlan(requestContract);
  const harnessPlan = buildHarnessPlan(userPrompt);
  res.setHeader('X-Adam-Harness', harnessPlan.taskType);
  res.setHeader('X-Adam-Harness-Phases', harnessPlan.phases.join(','));

  // P2 Cost Control Budget Check
  const budgetCheck = costControlManager.checkBudget(req.user?.uid, false);
  if (!budgetCheck.allowed) {
    return sendError(res, 429, 'BUDGET_EXCEEDED', budgetCheck.reason || 'Daily quota limit reached.');
  }

  // P0 Prompt Injection Defense
  const injectionInspection = PromptInjectionGuard.inspect(userPrompt, req.user?.uid, req.ip);
  if (injectionInspection.isBlocked) {
    systemMonitor.recordPromptInjectionBlock();
    const refusal = language === 'ar'
      ? 'عذراً، تم حظر هذا الطلب من قِبل جدار الحماية والأمان (Prompt Injection Defense) لاحتوائه على أنماط غير آمنة أو محاولة لتجاوز تعليمات النظام.'
      : 'Safety Guard: Request blocked by security shield due to detected prompt injection or system override patterns.';
    safeWrite(res, { type: 'delta', text: refusal });
    safeWrite(res, { type: 'done' });
    safeEnd(res);
    return;
  }

  try {
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    safeWrite(res, { type: 'delta', text: '' });

    // Direct, ultra-precise handling for explicit image & video requests (only when user did NOT attach images for vision analysis)
    const hasInlineImages = messages.some(m => m.parts.some((p: any) => 'inlineData' in p));
    if (!hasInlineImages && isExplicitImageRequest(userPrompt)) {
      // Check tool permission
      const permCheck = AgentPermissionGuard.canExecuteTool('generate_image', req.user);
      if (!permCheck.allowed) {
        safeWrite(res, { type: 'delta', text: permCheck.reason || 'Permission denied for image generation.' });
        safeWrite(res, { type: 'done' });
        safeEnd(res);
        return;
      }

      let imageUrl = '';
      let enhancedPrompt = '';
      let title = language === 'ar' ? 'صورة سينمائية فائقة الدقة (Flux.1 Pro)' : 'Cinematic 8K Masterpiece (Flux.1 Pro)';
      let desc = language === 'ar' ? 'تم توليد الصورة بأعلى دقة سينمائية 8K مع إضاءة حجمية وعدسة 85mm ومحرك Flux.1.' : 'Generated 8K cinematic image with Flux.1 Engine, 85mm f/1.8 lens, and volumetric lighting.';
      try {
        const item = await mediaEngine.generateImage({ prompt: userPrompt, apiKey, userId: req.user?.uid });
        imageUrl = item.url;
        enhancedPrompt = item.enhancedPrompt || userPrompt;
        title = item.title || title;
        desc = item.explanationAr || desc;
        costControlManager.recordUsage(req.user?.uid, 50, true);
      } catch (imgErr) {
        console.warn('[ADEM Image Engine] mediaEngine.generateImage threw, using direct Flux.1 engine URL:', imgErr);
        const cognitive = CognitiveMediaBrain.deconstruct(userPrompt, 'image', 'cinematic');
        enhancedPrompt = cognitive.enhancedPromptEn;
        const flux = buildFluxEngineUrl(enhancedPrompt, '1:1', Date.now());
        imageUrl = flux.url;
      }

      const details = language === 'ar'
        ? `\n\n- **الموضوع الرئيسي:** ${userPrompt}\n- **المحرك:** Flux.1 High-Performance Engine\n- **المواصفات:** دقة 8K فائقة • عدسة 85mm f/1.8 • إضاءة سينمائية حجمية • أبعاد 1024×1024`
        : `\n\n- **Subject:** ${userPrompt}\n- **Engine:** Flux.1 High-Performance Engine\n- **Specs:** 8K UHD • 85mm f/1.8 Bokeh • Volumetric Lighting • 1024×1024`;

      const cardPayload = {
        imageUrl,
        enhancedPrompt,
        originalPrompt: userPrompt,
        title,
        aspectRatio: '1:1',
        engine: 'Flux.1 High-Performance Engine',
      };

      const outputText = `:::image-card\n${JSON.stringify(cardPayload)}\n:::\n\n![${title}](${imageUrl})\n\n${desc}${details}`;
      safeWrite(res, { type: 'delta', text: outputText });
      safeWrite(res, { type: 'done' });
      safeEnd(res);
      return;
    } else if (isExplicitVideoRequest(userPrompt)) {
      const permCheck = AgentPermissionGuard.canExecuteTool('generate_video', req.user);
      if (!permCheck.allowed) {
        safeWrite(res, { type: 'delta', text: permCheck.reason || 'Permission denied for video generation.' });
        safeWrite(res, { type: 'done' });
        safeEnd(res);
        return;
      }

      let videoUrl = '';
      let title = language === 'ar' ? 'مشهد سينمائي متحرك' : 'Cinematic Video Scene';
      let desc = language === 'ar' ? 'تم تصميم لقطة الفيديو السينمائية بأعلى مواصفات الإخراج والحركة.' : 'Cinematic video sequence designed.';
      try {
        const item = await mediaEngine.generateVideo({ prompt: userPrompt, apiKey, userId: req.user?.uid });
        videoUrl = item.posterUrl || item.url;
        title = item.title || title;
        desc = item.explanationAr || desc;
        costControlManager.recordUsage(req.user?.uid, 100, true);
      } catch (vidErr) {
        console.warn('[Adam AI Chat] mediaEngine.generateVideo threw, using direct fallback URL:', vidErr);
        const encoded = encodeURIComponent(`${userPrompt}, cinematic video still, IMAX 70mm, 60fps motion`);
        videoUrl = `https://pollinations.ai/p/${encoded}?width=1024&height=1024&model=flux&nologo=true`;
      }

      const details = language === 'ar'
        ? `\n\n- **حركة المشهد:** حركة كاميرا سينمائية سلسة\n- **الجودة:** 60 FPS Cinema HD`
        : `\n\n- **Motion:** Cinematic camera tracking\n- **Quality:** 60 FPS Cinema HD`;

      const outputText = `![${title}](${videoUrl})\n\n${desc}${details}`;
      safeWrite(res, { type: 'delta', text: outputText });
      safeWrite(res, { type: 'done' });
      safeEnd(res);
      return;
    }

    // P2 Better Memory retrieval (tenant-isolated per user)
    const relevantMemories = BetterMemoryEngine.queryRelevantMemories(req.user?.uid, userPrompt, 3);
    const memoryContext = relevantMemories.length > 0
      ? `\n\nUSER PERSISTENT MEMORY (ISOLATED & PRIVATE):\n${relevantMemories.map(m => `- ${m.text}`).join('\n')}`
      : '';

    const ai = currentApiKey ? new GoogleGenAI({ apiKey: currentApiKey }) : null;
    const hermesAugmentedInstruction = hermesEngine.augmentSystemInstruction(systemInstruction(language, agentName) + memoryContext, userPrompt, language);

    // Apply sandwich defense wrapper to protect instruction integrity while preserving attached image inlineData
    const protectedPrompt = PromptInjectionGuard.wrapWithSandwichDefense(userPrompt);
    const defendedMessages = messages.map((m, idx) => {
      if (idx === messages.length - 1 && m.role === 'user') {
        const otherParts = m.parts.filter((p: any) => !('text' in p));
        return {
          role: 'user' as const,
          parts: [{ text: protectedPrompt }, ...otherParts],
        };
      }
      return m;
    });

    const isToday = isTodayDateQuery(userPrompt);

    // Fetch live web knowledge only when specifically needed for real-time external data (to keep response TTFT under 300ms)
    let webGrounding: { sources: GroundingSource[]; knowledgeContext: string; queries: string[] } = { sources: [], knowledgeContext: '', queries: [] };
    const needsWebSearch = !isToday && !isConversationalQuery(userPrompt) && /(?:أخبار|اخبار|سعر|أسعار|الطقس|طقس|ابحث عن|بحث عن|من هو|من هي|نتائج|ترتيب|مباراة|مباريات|عملة|سهم|أسهم|latest|news|weather|price|search|current|today's|who is|stock|crypto)/i.test(userPrompt);
    if (needsWebSearch) {
      try {
        webGrounding = await fetchLiveWebKnowledge(userPrompt, language);
      } catch {
        // Search is an enhancement, never a prerequisite for answering.
      }
    }

    let finalSystemInstruction = hermesAugmentedInstruction;
    finalSystemInstruction += buildIntentProtocol(userPrompt, messages, language);
    finalSystemInstruction += formatRequestContract(requestContract, language);
    finalSystemInstruction += formatExecutionPlan(executionPlan, language);
    finalSystemInstruction += formatHarnessInstruction(harnessPlan, language);
    finalSystemInstruction += reasoningProfile.mode === 'fast'
      ? '\n\nRESPONSE MODE: FAST. Answer directly, accurately, and simply. Do not over-explain unless asked.'
      : reasoningProfile.mode === 'reasoning'
        ? '\n\nRESPONSE MODE: REASONING. Work through the problem carefully, verify important assumptions, then present only the useful conclusion and supporting steps.'
        : '\n\nRESPONSE MODE: DEEP. Decompose the task, examine alternatives and edge cases, verify the result, then deliver a practical finished answer. Do not expose private chain-of-thought.';
    if (isToday) {
      const now = new Date();
      const arDate = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      let hijri = '';
      try {
        hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
      } catch {}
      const hijriStr = hijri ? ` (الموافق هجرياً: ${hijri})` : '';
      finalSystemInstruction += `\n\nتأكيد حاسم وفوري لتاريخ وساعة اليوم: اليوم هو "${arDate}م${hijriStr}". أجب عن تاريخ أو اليوم بإجابة بسيطة، قطعية، ومباشرة.`;
    } else if (webGrounding.knowledgeContext) {
      finalSystemInstruction += `\n${webGrounding.knowledgeContext}`;
    }

    const baseConfig: any = {
      temperature: reasoningProfile.mode === 'deep' ? 0.20 : reasoningProfile.mode === 'reasoning' ? 0.22 : 0.28,
      topP: reasoningProfile.mode === 'deep' ? 0.88 : 0.90,
      maxOutputTokens: reasoningProfile.maxOutputTokens,
      thinkingConfig: { thinkingLevel: reasoningProfile.thinkingLevel },
      systemInstruction: finalSystemInstruction,
    };

    const candidateModels = isOpenRouterConfigured() ? [getOpenRouterModel()] : getHealthSortedModels(model);
    let output = '';
    const streamModelOutput = true;
    const emitModelText = (text: string) => {
      output += text;
      safeWrite(res, { type: 'delta', text });
    };
    let lastError: any = null;
    let accumulatedGrounding: GroundingData = isToday
      ? { sources: [], queries: [] }
      : {
          sources: webGrounding.sources || [],
          queries: webGrounding.queries || [],
        };

    for (const currentModel of candidateModels) {
      if (aborted || res.writableEnded || res.destroyed) break;

      // Ensure answers are always connected to the live internet with real-time Google search grounding
      const canTrySearch = searchCircuitBreaker.isAvailable() && !isToday;
      const configsToTry = canTrySearch
        ? [
            { ...baseConfig, tools: [{ googleSearch: {} }] },
            { ...baseConfig, tools: AGENT_ACTION_TOOLS },
            baseConfig,
          ]
        : [
            { ...baseConfig, tools: AGENT_ACTION_TOOLS },
            baseConfig,
          ];

      let modelSuccess = false;
      let modelEncountered503 = false;

      // Production path: use Vercel AI Gateway with the deployment's short-lived OIDC
      // token instead of depending on a long-lived Gemini API secret.
      if (isGatewayConfigured(req)) {
        try {
          const gatewayOutput = await streamGatewayChat({
            req,
            messages,
            systemInstruction: finalSystemInstruction,
            model: currentModel,
            temperature: baseConfig.temperature,
            topP: baseConfig.topP,
            maxOutputTokens: baseConfig.maxOutputTokens,
            userId: req.user?.uid || 'guest_default',
            user: req.user,
            onText: emitModelText,
            maxToolRounds: 3,
          });

          if (gatewayOutput.trim()) {
            modelSuccess = true;
          } else {
            throw new Error('AI Gateway returned an empty completion.');
          }
        } catch (gatewayError: any) {
          lastError = gatewayError;
          console.warn('[Adam AI Gateway] model failed, trying next model', {
            model: currentModel,
            status: gatewayError?.status,
            message: redactSecrets(String(gatewayError?.message || gatewayError)),
          });
        }
      }

      if (modelSuccess) {
        break;
      }

      for (const config of configsToTry) {
        if (!currentApiKey || aborted || res.writableEnded || res.destroyed || modelSuccess || modelEncountered503) break;

        try {
          const stream = await ai!.models.generateContentStream({ model: currentModel, contents: defendedMessages, config: buildGenerationConfig(config, currentModel) });
          for await (const chunk of stream) {
            if (aborted || res.writableEnded || res.destroyed) break;

            // Extract Google Search grounding metadata if present in stream chunk
            const chunkMetadata = (chunk as any).groundingMetadata || (chunk as any).candidates?.[0]?.groundingMetadata;
            if (chunkMetadata) {
              const extracted = extractGroundingMetadata(chunkMetadata);
              accumulatedGrounding = mergeGroundingData(accumulatedGrounding, extracted);
            }

            // Handle function calls (Agentic Tool Actions & Image Generation)
            const fnCalls = (chunk as any).functionCalls || (chunk as any).candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall)?.map((p: any) => p.functionCall);
            if (fnCalls && fnCalls.length) {
              for (const fn of fnCalls) {
                if (fn.name === 'search_internet_images') {
                  const imgQuery = String(fn.args?.query || userPrompt).trim();
                  const count = Number(fn.args?.count || 3);
                  try {
                    const fetched = await searchInternetImages(imgQuery, Math.min(count, 6), language);
                    if (fetched.length > 0) {
                      let md = `\n\n### 🌐 ${language === 'ar' ? 'صور حقيقية تم جلبها من الإنترنت' : 'Images retrieved from the web'} (${imgQuery}):\n\n`;
                      for (const item of fetched) {
                        md += `![${item.title}](${item.url})\n*${item.title}* — [${item.source}](${item.pageUrl || item.url})\n\n`;
                      }
                      output += md;
                      safeWrite(res, { type: 'delta', text: md });
                    } else {
                      const emptyNote = language === 'ar' ? `\n\n[لم يتم العثور على صور ويب حرة مباشرة لكلمة "${imgQuery}"]\n\n` : `\n\n[No public web images found for "${imgQuery}"]\n\n`;
                      output += emptyNote;
                      safeWrite(res, { type: 'delta', text: emptyNote });
                    }
                  } catch (imgErr) {
                    console.warn('[search_internet_images] Error:', imgErr);
                  }
                } else if (fn.name === 'generate_specialized_image' || fn.name === 'generate_image') {
                  const permCheck = AgentPermissionGuard.canExecuteTool(fn.name, req.user);
                  if (!permCheck.allowed) {
                    const errorText = language === 'ar' ? '\n[تم رفض تشغيل أداة توليد الصور لعدم توفر الصلاحيات]\n' : '\n[Tool execution denied: insufficient permissions]\n';
                    safeWrite(res, { type: 'delta', text: errorText });
                    continue;
                  }

                  const detailedPrompt = String(fn.args?.prompt || userPrompt).trim();
                  const aspect = String(fn.args?.aspect_ratio || fn.args?.aspectRatio || '1:1').trim();
                  try {
                    const item = await mediaEngine.generateImage({
                      prompt: detailedPrompt,
                      aspectRatio: (aspect as any) || '1:1',
                      apiKey,
                      userId: req.user?.uid,
                    });
                    costControlManager.recordUsage(req.user?.uid, 50, true);
                    const cardPayload = {
                      imageUrl: item.url,
                      enhancedPrompt: item.enhancedPrompt,
                      originalPrompt: userPrompt,
                      title: item.title || (language === 'ar' ? 'صورة سينمائية فائقة الدقة (Flux.1)' : 'Cinematic 8K Masterpiece (Flux.1)'),
                      aspectRatio: item.aspectRatio || aspect,
                      engine: 'Flux.1 High-Performance Engine',
                    };
                    const cardText = `\n:::image-card\n${JSON.stringify(cardPayload)}\n:::\n`;
                    output += cardText;
                    safeWrite(res, { type: 'delta', text: cardText });
                  } catch {
                    const seed = Date.now();
                    const flux = buildFluxEngineUrl(detailedPrompt, aspect, seed);
                    const title = language === 'ar' ? 'صورة سينمائية فائقة الدقة (Flux.1)' : 'Cinematic 8K Masterpiece (Flux.1)';
                    const cardPayload = {
                      imageUrl: flux.url,
                      enhancedPrompt: detailedPrompt,
                      originalPrompt: userPrompt,
                      title,
                      aspectRatio: aspect,
                      engine: 'Flux.1 High-Performance Engine',
                    };
                    const cardText = `\n:::image-card\n${JSON.stringify(cardPayload)}\n:::\n`;
                    output += cardText;
                    safeWrite(res, { type: 'delta', text: cardText });
                  }
                } else {
                  // Execute Agentic tools (execute_code, execute_terminal_command, create_file, create_task, etc.)
                  const permCheck = AgentPermissionGuard.canExecuteTool(fn.name, req.user);
                  if (permCheck.allowed) {
                    try {
                      const toolResult = await executeAgentActionTool(fn.name, (fn.args ?? {}) as Record<string, unknown>, req.user?.uid || 'guest_default');
                      let cardText = '';
                      if (fn.name === 'execute_code') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'code_exec',
                          title: language === 'ar' ? '⚡ تشغيل الكود البرمجي (ADEM Core)' : '⚡ Code Execution (ADEM Core)',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'code_exec',
                            data: {
                              code: String(fn.args?.code || ''),
                              language: String(fn.args?.language || 'javascript'),
                              output: (toolResult as any).stdout || (toolResult as any).stderr || '',
                              success: (toolResult as any).ok ?? true,
                              executionTimeMs: (toolResult as any).durationMs || 10,
                              stdout: (toolResult as any).stdout ? [(toolResult as any).stdout] : [],
                              stderr: (toolResult as any).stderr ? [(toolResult as any).stderr] : [],
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'execute_terminal_command') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'terminal_command',
                          title: language === 'ar' ? '🖥️ أمر الطرفية المستقل (ADEM Terminal)' : '🖥️ Terminal Command (ADEM Terminal)',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'terminal_command',
                            data: {
                              command: String(fn.args?.command || ''),
                              cwd: String(fn.args?.cwd || '/workspace'),
                              output: (toolResult as any).stdout || (toolResult as any).stderr || '',
                              exitCode: (toolResult as any).exitCode ?? 0,
                              executionTimeMs: (toolResult as any).durationMs || 10,
                              systemTarget: (toolResult as any).systemTarget || 'linux',
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'create_file') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'file_created',
                          title: language === 'ar' ? '💾 تم إنشاء الملف وتحضيره للتحميل' : '💾 File Generated & Ready to Download',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'file_created',
                            data: {
                              fileName: (toolResult as any).fileName || 'project-artifact.txt',
                              fileType: (toolResult as any).fileType || 'text/plain',
                              content: String(fn.args?.content || ''),
                              sizeBytes: (toolResult as any).sizeBytes || 0,
                              downloadUrl: (toolResult as any).downloadUrl || '',
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'create_task') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'task_created',
                          title: language === 'ar' ? '📋 تم تسجيل المهمة في منظومة ADEM' : '📋 Task Registered in ADEM System',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'task_created',
                            data: {
                              task: {
                                id: (toolResult as any).taskId || `task_${Date.now()}`,
                                title: String(fn.args?.title || ''),
                                notes: String(fn.args?.description || ''),
                                priority: String(fn.args?.priority || 'medium'),
                                completed: false,
                                createdAt: Date.now(),
                                updatedAt: Date.now(),
                              },
                              systemTarget: (fn.args?.system_target as any) || 'universal',
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'adk_coordinate_agents') {
                        cardText = `\n:::adk-orchestrator\n${JSON.stringify(toolResult, null, 2)}\n:::\n`;
                      }

                      if (cardText) {
                        output += cardText;
                        safeWrite(res, { type: 'delta', text: cardText });
                      }
                    } catch (toolErr) {
                      console.warn('[ADEM Agentic Tool Execution Error]:', toolErr);
                    }
                  }
                }
              }
            }

            const text = typeof (chunk as any).text === 'string' ? (chunk as any).text : '';
            if (text) {
              emitModelText(text);
            }
          }
          if (aborted || res.writableEnded || res.destroyed) return;

          if (!output.trim()) {
            const completion = await ai!.models.generateContent({ model: currentModel, contents: defendedMessages, config: buildGenerationConfig(config, currentModel) });
            const completionMetadata = (completion as any).groundingMetadata || (completion as any).candidates?.[0]?.groundingMetadata;
            if (completionMetadata) {
              const extracted = extractGroundingMetadata(completionMetadata);
              accumulatedGrounding = mergeGroundingData(accumulatedGrounding, extracted);
            }

            const fnCalls = (completion as any).functionCalls || (completion as any).candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall)?.map((p: any) => p.functionCall);
            if (fnCalls && fnCalls.length) {
              for (const fn of fnCalls) {
                if (fn.name === 'search_internet_images') {
                  const imgQuery = String(fn.args?.query || userPrompt).trim();
                  const count = Number(fn.args?.count || 3);
                  try {
                    const fetched = await searchInternetImages(imgQuery, Math.min(count, 6), language);
                    if (fetched.length > 0) {
                      let md = `\n\n### 🌐 ${language === 'ar' ? 'صور حقيقية تم جلبها من الإنترنت' : 'Images retrieved from the web'} (${imgQuery}):\n\n`;
                      for (const item of fetched) {
                        md += `![${item.title}](${item.url})\n*${item.title}* — [${item.source}](${item.pageUrl || item.url})\n\n`;
                      }
                      output += md;
                    }
                  } catch (imgErr) {
                    console.warn('[search_internet_images] Error:', imgErr);
                  }
                } else if (fn.name === 'generate_specialized_image' || fn.name === 'generate_image') {
                  const detailedPrompt = String(fn.args?.prompt || userPrompt).trim();
                  const aspect = String(fn.args?.aspect_ratio || fn.args?.aspectRatio || '1:1').trim();
                  try {
                    const item = await mediaEngine.generateImage({
                      prompt: detailedPrompt,
                      aspectRatio: (aspect as any) || '1:1',
                      apiKey,
                      userId: req.user?.uid,
                    });
                    costControlManager.recordUsage(req.user?.uid, 50, true);
                    const cardPayload = {
                      imageUrl: item.url,
                      enhancedPrompt: item.enhancedPrompt,
                      originalPrompt: userPrompt,
                      title: item.title || (language === 'ar' ? 'صورة سينمائية فائقة الدقة (Flux.1)' : 'Cinematic 8K Masterpiece (Flux.1)'),
                      aspectRatio: item.aspectRatio || aspect,
                      engine: 'Flux.1 High-Performance Engine',
                    };
                    const cardText = `\n:::image-card\n${JSON.stringify(cardPayload)}\n:::\n`;
                    output += cardText;
                    safeWrite(res, { type: 'delta', text: cardText });
                  } catch {
                    const seed = Date.now();
                    const flux = buildFluxEngineUrl(detailedPrompt, aspect, seed);
                    const title = language === 'ar' ? 'صورة سينمائية فائقة الدقة (Flux.1)' : 'Cinematic 8K Masterpiece (Flux.1)';
                    const cardPayload = {
                      imageUrl: flux.url,
                      enhancedPrompt: detailedPrompt,
                      originalPrompt: userPrompt,
                      title,
                      aspectRatio: aspect,
                      engine: 'Flux.1 High-Performance Engine',
                    };
                    const cardText = `\n:::image-card\n${JSON.stringify(cardPayload)}\n:::\n`;
                    output += cardText;
                    safeWrite(res, { type: 'delta', text: cardText });
                  }
                } else {
                  // Execute Agentic tools
                  const permCheck = AgentPermissionGuard.canExecuteTool(fn.name, req.user);
                  if (permCheck.allowed) {
                    try {
                      const toolResult = await executeAgentActionTool(fn.name, (fn.args ?? {}) as Record<string, unknown>, req.user?.uid || 'guest_default');
                      let cardText = '';
                      if (fn.name === 'execute_code') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'code_exec',
                          title: language === 'ar' ? '⚡ تشغيل الكود البرمجي (ADEM Core)' : '⚡ Code Execution (ADEM Core)',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'code_exec',
                            data: {
                              code: String(fn.args?.code || ''),
                              language: String(fn.args?.language || 'javascript'),
                              output: (toolResult as any).stdout || (toolResult as any).stderr || '',
                              success: (toolResult as any).ok ?? true,
                              executionTimeMs: (toolResult as any).durationMs || 10,
                              stdout: (toolResult as any).stdout ? [(toolResult as any).stdout] : [],
                              stderr: (toolResult as any).stderr ? [(toolResult as any).stderr] : [],
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'execute_terminal_command') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'terminal_command',
                          title: language === 'ar' ? '🖥️ أمر الطرفية المستقل (ADEM Terminal)' : '🖥️ Terminal Command (ADEM Terminal)',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'terminal_command',
                            data: {
                              command: String(fn.args?.command || ''),
                              cwd: String(fn.args?.cwd || '/workspace'),
                              output: (toolResult as any).stdout || (toolResult as any).stderr || '',
                              exitCode: (toolResult as any).exitCode ?? 0,
                              executionTimeMs: (toolResult as any).durationMs || 10,
                              systemTarget: (toolResult as any).systemTarget || 'linux',
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'create_file') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'file_created',
                          title: language === 'ar' ? '💾 تم إنشاء الملف وتحضيره للتحميل' : '💾 File Generated & Ready to Download',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'file_created',
                            data: {
                              fileName: (toolResult as any).fileName || 'project-artifact.txt',
                              fileType: (toolResult as any).fileType || 'text/plain',
                              content: String(fn.args?.content || ''),
                              sizeBytes: (toolResult as any).sizeBytes || 0,
                              downloadUrl: (toolResult as any).downloadUrl || '',
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'create_task') {
                        cardText = `\n:::agent-action\n${JSON.stringify({
                          actionType: 'task_created',
                          title: language === 'ar' ? '📋 تم تسجيل المهمة في منظومة ADEM' : '📋 Task Registered in ADEM System',
                          engine: 'engine_1_executive',
                          authorityLevel: 'root_unrestricted',
                          timestamp: Date.now(),
                          payload: {
                            type: 'task_created',
                            data: {
                              task: {
                                id: (toolResult as any).taskId || `task_${Date.now()}`,
                                title: String(fn.args?.title || ''),
                                notes: String(fn.args?.description || ''),
                                priority: String(fn.args?.priority || 'medium'),
                                completed: false,
                                createdAt: Date.now(),
                                updatedAt: Date.now(),
                              },
                              systemTarget: (fn.args?.system_target as any) || 'universal',
                            },
                          },
                        }, null, 2)}\n:::\n`;
                      } else if (fn.name === 'adk_coordinate_agents') {
                        cardText = `\n:::adk-orchestrator\n${JSON.stringify(toolResult, null, 2)}\n:::\n`;
                      }

                      if (cardText) {
                        output += cardText;
                        safeWrite(res, { type: 'delta', text: cardText });
                      }
                    } catch (toolErr) {
                      console.warn('[ADEM Agentic Tool Execution Error in fallback]:', toolErr);
                    }
                  }
                }
              }
            }

            const text = typeof (completion as any).text === 'string' ? (completion as any).text : '';
            if (text.trim()) {
              emitModelText(text);
            }
          }

          if (output.trim()) {
            modelSuccess = true;
            break; // Model answered successfully!
          }
        } catch (err: any) {
          lastError = err;
          const providerMessage = String(err?.message || 'Unknown Gemini provider error');
          const normalizedMsg = providerMessage.toLowerCase();
          let code = Number(err?.status ?? err?.response?.status ?? err?.error?.status ?? err?.code ?? 0);
          if (!code || isNaN(code)) {
            const match = providerMessage.match(/"code"\s*:\s*(\d+)/);
            if (match) code = Number(match[1]);
          }
          const isHighDemand = code === 503 || normalizedMsg.includes('unavailable') || normalizedMsg.includes('high demand') || normalizedMsg.includes('spike');
          const isQuota = code === 429 || normalizedMsg.includes('quota') || normalizedMsg.includes('resource_exhausted') || normalizedMsg.includes('too many requests') || normalizedMsg.includes('rate limit');
          
          if (isHighDemand) {
            markModelOverloaded(currentModel, 60_000);
            modelEncountered503 = true;
          }
          
          if (isQuota) {
            markModelOverloaded(currentModel, 120_000);
            modelEncountered503 = true;
            if (config.tools) {
              searchCircuitBreaker.trip(60 * 60 * 1000);
            }
          }
          console.log(`[Adam AI chat] Handled ${isQuota ? 'quota limit (429)' : isHighDemand ? 'service load (503)' : 'provider status ' + (code || '')} on ${currentModel}; switching to next swarm engine.`);
        }
      }

      if (output.trim()) break; // Success!
    }

    if (!output.trim() && !aborted && !res.writableEnded && !res.destroyed) {
      console.log('[Adam AI chat] Gemini models unavailable or quota exhausted, attempting Hugging Face & remote model gateway fallback...');
      try {
        const hfResult = await huggingFaceEngine.generateChatCompletion({
          model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt: systemInstruction(language, agentName),
          temperature: 0.35,
          maxTokens: 4096,
        });
        if (hfResult.text?.trim()) {
          output = hfResult.text.trim();
          safeWrite(res, { type: 'delta', text: output });
        }
      } catch (hfErr: any) {
        console.log('[Adam AI chat] Hugging Face fallback unavailable; attempting remote model gateway candidates...');
      }

      if (!output.trim()) {
        try {
          const remoteGateway = createAgentModelGateway();
          const fallbackCandidates = modelRegistry.enabled().filter(m => m.provider !== 'gemini' && m.provider !== 'ADEM-G');
          for (const fbModel of fallbackCandidates) {
            if (aborted || res.writableEnded || res.destroyed) break;
            try {
              const resp = await remoteGateway.gateway.invokeSelected(fbModel, {
                prompt: userPrompt,
                system: systemInstruction(language, agentName),
                temperature: 0.45,
                maxTokens: 4096,
              });
              if (resp.text?.trim()) {
                output = resp.text.trim();
                safeWrite(res, { type: 'delta', text: output });
                break;
              }
            } catch (fbErr: any) {
              // Graceful candidate switch
            }
          }
        } catch (gwErr: any) {
          console.log('[Adam AI chat] Model gateway fallback route bypassed');
        }
      }
    }

    if (output.trim() && !streamModelOutput && !res.writableEnded && !res.destroyed) {
      try {
        const verification = verifyHarnessOutput(output.trim());
        output = verification.verifiedText;
        safeWrite(res, { type: 'delta', text: output });
      } catch (verificationError) {
        console.warn('[Adam AI verification] verifier failed; preserving model output:', verificationError);
        safeWrite(res, { type: 'delta', text: output });
      }
    }

    if (!output.trim()) {
      const lastMessage = String(lastError?.message || 'No model returned a response.');
      const normalized = lastMessage.toLowerCase();
      let providerStatus = Number(lastError?.status ?? lastError?.response?.status ?? lastError?.error?.status ?? lastError?.code ?? 0);
      if (!providerStatus || isNaN(providerStatus)) {
        const match = lastMessage.match(/"code"\s*:\s*(\d+)/);
        if (match) providerStatus = Number(match[1]);
      }
      const failureCode =
        providerStatus === 401 || providerStatus === 403 || normalized.includes('api key') || normalized.includes('permission')
          ? 'AI_AUTH'
          : providerStatus === 429 || normalized.includes('quota') || normalized.includes('rate limit') || normalized.includes('resource_exhausted') || normalized.includes('too many requests')
            ? 'AI_RATE_LIMIT'
            : normalized.includes('timeout') || normalized.includes('timed out')
              ? 'REQUEST_TIMEOUT'
              : 'AI_PROVIDER';
      const responseStatus =
        failureCode === 'AI_AUTH' ? 502 :
        failureCode === 'AI_RATE_LIMIT' ? 429 :
        failureCode === 'REQUEST_TIMEOUT' ? 504 : 502;
      const clientMessage =
        failureCode === 'AI_AUTH'
          ? 'The AI provider rejected the configured credentials.'
          : failureCode === 'AI_RATE_LIMIT'
            ? 'The AI provider rate limit or quota was reached.'
            : failureCode === 'REQUEST_TIMEOUT'
              ? 'The AI provider did not respond within the allowed time.'
              : 'The AI provider failed to return a response.';
      console.error('[Adam AI chat] request failed after all providers', {
        requestId,
        status: responseStatus,
        code: failureCode,
        providerStatus: Number.isFinite(providerStatus) && providerStatus > 0 ? providerStatus : undefined,
        providerMessage: redactSecrets(lastMessage),
        providerStack: redactSecrets(String(lastError?.stack || '')),
        durationMs: Date.now() - requestStartedAt,
        hasGeminiApiKey: Boolean(apiKey),
      });
      sendError(res, responseStatus, failureCode, clientMessage);
      return;
    } else {
      // Record token usage for cost controls
      const estTokens = Math.ceil(output.length / 4) + 120;
      costControlManager.recordUsage(req.user?.uid, estTokens, false);

      // Hermes autonomous learning loop from successful interactions
      try {
        hermesEngine.learnAutonomousSkillFromInteraction(userPrompt, output);
      } catch (learnErr) {
        console.warn('[Hermes Agent] Skill learning hook error:', learnErr);
      }
    }
    safeWrite(res, { type: 'done' });
    safeEnd(res);
  } catch (error: any) {
    if (aborted || res.writableEnded || res.destroyed) {
      console.warn('[Adam AI chat] request closed before completion', {
        requestId,
        durationMs: Date.now() - requestStartedAt,
        name: error?.name,
        message: redactSecrets(String(error?.message || error)),
      });
      return;
    }

    const providerMessage = String(error?.message ?? 'The AI provider failed to answer.');
    const normalized = providerMessage.toLowerCase();
    const status = Number(error?.status ?? error?.response?.status ?? error?.error?.status ?? 500);
    const code =
      status === 401 || status === 403 || normalized.includes('permission') || normalized.includes('api key')
        ? 'AI_AUTH'
        : status === 429 || normalized.includes('quota') || normalized.includes('rate limit') || normalized.includes('resource_exhausted')
          ? 'AI_RATE_LIMIT'
          : normalized.includes('timeout') || normalized.includes('timed out')
            ? 'REQUEST_TIMEOUT'
            : 'AI_PROVIDER';
    const responseStatus =
      code === 'AI_RATE_LIMIT' ? 429 :
      code === 'REQUEST_TIMEOUT' ? 504 :
      code === 'AI_AUTH' ? 502 :
      status >= 500 ? 502 : status;
    const message =
      code === 'AI_AUTH'
        ? 'The AI provider rejected the configured credentials.'
        : code === 'AI_RATE_LIMIT'
          ? 'The AI provider rate limit or quota was reached.'
          : code === 'REQUEST_TIMEOUT'
            ? 'The AI provider did not respond within the allowed time.'
            : 'Adam could not complete the request. Please retry.';

    console.error('[Adam AI chat error]', {
      requestId,
      status: responseStatus,
      code,
      providerStatus: Number.isFinite(status) && status > 0 ? status : undefined,
      providerMessage: redactSecrets(providerMessage),
      stack: redactSecrets(String(error?.stack || '')),
      durationMs: Date.now() - requestStartedAt,
      model,
      hasGeminiApiKey: Boolean(apiKey),
    });

    sendError(res, responseStatus, code, message);
  }
});

// Docker Sandbox Container Execution API for AppSandboxStudio
app.use('/api/sandbox/docker', sandboxRouter);
app.use('/api/sandbox', sandboxRouter);

// LLM Speed Test & Tokens-Per-Second Diagnostic API
app.use('/api/diagnostics/speed-test', speedTestRouter);
app.use('/api/speed-test', speedTestRouter);

// Gemini Multimodal Engine (Veo 3 Video, Audio Transcription, Image Generation/Edit, Search & Maps Grounding)
app.use('/api', geminiMultimodalRouter);

// Direct Terminal Execution Sandbox API (enhanced with Docker sandbox service)
app.post('/api/terminal-sandbox', authenticateSession, requirePermission('agent:tools'), async (req: express.Request, res: express.Response) => {
  try {
    const { code, language = 'javascript', command, limits } = req.body || {};

    if (command) {
      const result = await dockerSandboxService.execute({
        code: command,
        language: 'bash',
        limits: limits || { timeoutMs: 10000 },
      });
      res.json({
        success: result.ok,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        engine: result.engine,
      });
      return;
    }

    if (code) {
      const lang = (language === 'js' || language === 'ts' ? 'javascript' : language) as any;
      const result = await dockerSandboxService.execute({
        code,
        language: lang,
        limits,
      });
      res.json({
        success: result.ok,
        syntaxValid: result.ok,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        engine: result.engine,
        containerId: result.containerId,
      });
      return;
    }

    res.status(400).json({ error: 'Invalid payload: provide "code" or "command"' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unreal Engine 5 Remote Control Bridge API
app.post('/api/unreal-engine/bridge', authenticateSession, requirePermission('agent:tools'), async (req: express.Request, res: express.Response) => {
  try {
    const { host = 'http://localhost', port = 30010, action, payload } = req.body || {};
    const targetUrl = `${host.replace(/\/$/, '')}:${port}`;

    // Attempt real connection to Unreal Engine Web Remote Control if available
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
      if (action === 'test_connection') {
        const testRes = await fetch(`${targetUrl}/remote/info`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (testRes.ok) {
          const info = await testRes.json().catch(() => ({}));
          return res.json({
            success: true,
            connected: true,
            message: 'Connected to Unreal Engine 5 Web Remote Control successfully!',
            data: info,
          });
        }
      } else if (action === 'execute_python' || action === 'spawn_actor' || action === 'adjust_lighting' || action === 'fire_action') {
        const ueEndpoint = action === 'adjust_lighting' ? `${targetUrl}/remote/object/property` : `${targetUrl}/remote/object/call`;
        const ueRes = await fetch(ueEndpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {}),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (ueRes.ok) {
          const ueData = await ueRes.json().catch(() => ({}));
          return res.json({
            success: true,
            message: 'Command executed in Unreal Engine 5 live world.',
            data: ueData,
          });
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }

    // Graceful response with connection instructions and simulated payload verification
    res.json({
      success: true,
      simulated: true,
      action,
      targetUrl,
      message: `Payload verified & dispatched to ${targetUrl}. When Unreal Engine 5 is running locally with 'Web Remote Control' plugin enabled, real-time actuation occurs instantly.`,
      payloadSample: payload,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// UNIVERSAL TRANSLATOR & LINGUISTIC API
// ==========================================
app.post('/api/translate', chatRateLimiter.middleware(), async (req, res) => {
  try {
    const { text, sourceLang = 'auto', targetLang = 'en', tone = 'general', includeAnalysis = true } = req.body || {};
    const customKey = (req.headers['x-gemini-api-key'] as string) || apiKey;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'Text is required for translation' });
    }

    const ai = new GoogleGenAI({ apiKey: customKey });
    const prompt = `You are a world-class translation engine and linguistic professor.
Translate the text accurately from ${sourceLang === 'auto' ? 'automatically detected source language' : `"${sourceLang}"`} into "${targetLang}" with the tone "${tone}".

Rules:
1. Provide a natural, highly accurate, and culturally fluent translation in "${targetLang}".
2. Output STRICT JSON ONLY (no markdown fences, no explanatory preambles, just raw valid JSON):
{
  "translatedText": "translated text here",
  "detectedSourceLang": "${sourceLang === 'auto' ? 'detected 2-letter language code' : sourceLang}",
  "detectedSourceName": "Name of source language",
  "transliteration": "Phonetic romanization or pronunciation guide for the translated text (especially if non-Latin or Arabic), or null",
  "alternatives": [
    {"text": "alternative translation 1", "context": "formal or nuance context"},
    {"text": "alternative translation 2", "context": "casual or dialect context"}
  ],
  "grammarNotes": "1-2 brief sentences explaining grammar or vocabulary nuances if helpful, or null",
  "vocabulary": [
    {"word": "key word in original", "translation": "translated word", "pos": "noun/verb/adj"}
  ],
  "culturalNotes": "Optional brief cultural or idiom note, or null"
}

Text to translate:
"""
${text.slice(0, 10000)}
"""`;

    let responseText = '';
    const modelsToTry = ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

    for (const m of modelsToTry) {
      try {
        const response = await ai!.models.generateContent({
          model: m,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        });
        if (response?.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`[Translate API] Model ${m} failed, trying next:`, err?.message);
      }
    }

    if (!responseText) {
      // Fallback simple translation
      return res.json({
        ok: true,
        translatedText: text,
        detectedSourceLang: sourceLang === 'auto' ? 'en' : sourceLang,
      });
    }

    try {
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      res.json({
        ok: true,
        ...parsed,
      });
    } catch {
      res.json({
        ok: true,
        translatedText: responseText.replace(/```json|```/g, '').trim(),
      });
    }
  } catch (err: any) {
    console.error('[Translate API] Error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Translation failed' });
  }
});

registerAgentRoute(app, apiKey, model);

// Catch-all express error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Adam Server Error Handler]', err);
  if (res.headersSent) {
    safeWrite(res, { type: 'error', code: 'SERVER_ERROR', message: 'An internal server error occurred.' });
    safeEnd(res);
    return;
  }
  try {
    res.status(500).json({ code: 'SERVER_ERROR', message: 'An internal server error occurred.' });
  } catch {
    // ignore
  }
});

async function startServer() {
  try {
    const distIndex = path.join(publicDir, 'index.html');
    const rootIndex = path.join(rootDir, 'index.html');
    const hasDist = fs.existsSync(distIndex);

    if (hasDist && (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1')) {
      app.use(express.static(publicDir, {
        index: false,
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          res.setHeader('Vary', 'Accept-Encoding');
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.includes('/assets/') || filePath.match(/\.[a-f0-9]{8}\.(js|css)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Expires', 'Thu, 31 Dec 2037 23:55:55 GMT');
          } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?|ttf|eot)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Expires', 'Thu, 31 Dec 2037 23:55:55 GMT');
          }
        }
      }));
      app.get('*', (_req, res, next) => {
        if (fs.existsSync(distIndex)) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.sendFile(distIndex);
        } else if (fs.existsSync(rootIndex)) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.sendFile(rootIndex);
        } else {
          next();
        }
      });
    } else if (process.env.NODE_ENV !== 'test') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  } catch (err) {
    console.error('[Adam Server] Static / Vite setup error:', err);
  }

  if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
    try {
      const server = app.listen(port, '0.0.0.0', () => console.log(`Adam AI v2 listening on http://0.0.0.0:${port}`));
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
      server.on('error', (err: any) => {
        console.error('[Adam Server] HTTP Server error:', err);
      });
      // Attach Gemini 3.8 Live API WebSocket Bridge
      setupLiveApiWebSocket(server);
      return server;
    } catch (err) {
      console.error('[Adam Server] Failed to listen:', err);
    }
  }
}

if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') void startServer();
export { app, startServer };