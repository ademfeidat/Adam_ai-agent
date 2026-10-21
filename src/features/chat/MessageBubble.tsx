import React, { useState, useEffect } from 'react';
import { Bot, Check, Code2, Copy, Gamepad2, Languages, Play, User, Volume2, VolumeX, Sparkles, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ViewId } from '../../core/domain';
import { ImageCard } from './ImageCard';
import { ImageViewerModal } from './ImageViewerModal';
import { AppLauncherCard, type AppLauncherData } from './AppLauncherCard';
import { AgentActionCard } from './AgentActionCard';
import { extractAgentActions } from '../../core/agent/ademDuoAutonomousAgent';
import { extractAppCode, saveSandboxApp } from '../../core/appSandboxStorage';
import { InteractiveAppCard } from './InteractiveAppCard';
import { MediaStudioCard, type MediaCardPayload } from './MediaStudioCard';
import { CognitiveIqCard, type CognitiveIqCardPayload } from './CognitiveIqCard';
import { GeospatialCard, type GeospatialCardPayload } from './GeospatialCard';
import { InteractiveTaskCard, type TaskCardPayload } from './InteractiveTaskCard';
import { TranslationCard, type TranslationCardPayload } from './TranslationCard';
import { GoogleAdkCard } from './GoogleAdkCard';
import { AdkOrchestratorCard } from './AdkOrchestratorCard';
import type { GoogleAdkCardPayload } from '../../core/adk/adkProtocol';
import type { MultiAgentExecutionPlan } from '../../core/adk-agent/adkTypes';
import { requestTranslation } from '../translation/translationApi';
import { formatMathAndLatex } from '../../core/utils/mathLatexFormatter';

function extractPromptFromUrl(src: string): string {
  try {
    const url = new URL(src);
    if (url.hostname.includes('pollinations.ai')) {
      const parts = url.pathname.split('/p/');
      if (parts.length > 1) return decodeURIComponent(parts[1]);
      const promptParts = url.pathname.split('/prompt/');
      if (promptParts.length > 1) return decodeURIComponent(promptParts[1]);
    }
  } catch {}
  return '';
}

interface MessageBubbleProps {
  message: Message;
  language: 'ar' | 'en';
  userPrompt?: string;
  onOpenSandbox?: (appId: string) => void;
  onNavigateView?: (view: ViewId, extraParam?: string) => void;
}

export function MessageBubble({
  message,
  language,
  userPrompt,
  onOpenSandbox,
  onNavigateView,
}: MessageBubbleProps) {
  const assistant = message.role === 'assistant';
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt?: string } | null>(null);

  // Check if message contains structured image card payload
  const imageCardMatch = message.content.match(/:::image-card\s*([\s\S]*?)\s*:::/i);
  let imageCardData: {
    imageUrl: string;
    enhancedPrompt: string;
    originalPrompt?: string;
    title?: string;
    aspectRatio?: string;
    engine?: string;
  } | null = null;
  if (imageCardMatch) {
    try {
      imageCardData = JSON.parse(imageCardMatch[1]);
    } catch {}
  }

  // Check if message contains structured app-launcher payload
  const appLauncherMatch = message.content.match(/:::app-launcher\s*([\s\S]*?)\s*:::/i);
  let appLauncherData: AppLauncherData | null = null;
  if (appLauncherMatch) {
    try {
      appLauncherData = JSON.parse(appLauncherMatch[1]);
    } catch {}
  }

  // Check if message contains structured autonomous agent actions
  const agentActions = extractAgentActions(message.content);

  // Check if message contains structured media studio card payload
  const mediaMatch = message.content.match(/:::media-card\s*([\s\S]*?)\s*:::/i);
  let mediaData: MediaCardPayload | null = null;
  if (mediaMatch) {
    try {
      mediaData = JSON.parse(mediaMatch[1]);
    } catch {}
  }

  // Check if message contains structured cognitive IQ card payload
  const iqMatch = message.content.match(/:::iq-card\s*([\s\S]*?)\s*:::/i);
  let iqData: CognitiveIqCardPayload | null = null;
  if (iqMatch) {
    try {
      iqData = JSON.parse(iqMatch[1]);
    } catch {}
  }

  // Check if message contains structured geospatial card payload
  const geoMatch = message.content.match(/:::geo-card\s*([\s\S]*?)\s*:::/i);
  let geoData: GeospatialCardPayload | null = null;
  if (geoMatch) {
    try {
      geoData = JSON.parse(geoMatch[1]);
    } catch {}
  }

  // Check if message contains structured interactive task card payload
  const taskMatch = message.content.match(/:::task-card\s*([\s\S]*?)\s*:::/i);
  let taskData: TaskCardPayload | null = null;
  if (taskMatch) {
    try {
      taskData = JSON.parse(taskMatch[1]);
    } catch {}
  }

  // Check if message contains structured translation card payload
  const translationMatch = message.content.match(/:::translation-card\s*([\s\S]*?)\s*:::/i);
  let translationData: TranslationCardPayload | null = null;
  if (translationMatch) {
    try {
      translationData = JSON.parse(translationMatch[1]);
    } catch {}
  }

  // Check if message contains structured Google ADK card payload
  const adkMatch = message.content.match(/:::(?:google-adk-card|adk-card)\s*([\s\S]*?)\s*:::/i);
  let adkData: GoogleAdkCardPayload | null = null;
  if (adkMatch) {
    try {
      adkData = JSON.parse(adkMatch[1]);
    } catch {}
  }

  // Check if message contains structured Google ADK Multi-Agent Orchestration plan
  const adkPlanMatch = message.content.match(/:::(?:adk-orchestrator|adk-plan)\s*([\s\S]*?)\s*:::/i);
  let adkPlanData: MultiAgentExecutionPlan | null = null;
  if (adkPlanMatch) {
    try {
      adkPlanData = JSON.parse(adkPlanMatch[1]);
    } catch {}
  }

  // Check if message contains runnable app/game code
  const appData = assistant ? extractAppCode(message.content) : null;

  // Inline dynamic translation state
  const [inlineTranslation, setInlineTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showInlineTranslation, setShowInlineTranslation] = useState(false);

  // Clean raw image card or grounding or app launcher or agent action or academic card tags from display markdown
  let displayMarkdown = message.content;
  if (imageCardMatch) {
    displayMarkdown = displayMarkdown.replace(/:::image-card\s*[\s\S]*?\s*:::/gi, '').trim();
    displayMarkdown = displayMarkdown
      .replace(/!\[.*?\]\((?:https?:\/\/[^\s\)]+pollinations[^\s\)]*)\)/gi, '')
      .trim();
  }
  // Strip all grounding sources and inline citations completely
  displayMarkdown = displayMarkdown.replace(/:::grounding-sources\s*[\s\S]*?\s*:::/gi, '').trim();
  displayMarkdown = displayMarkdown.replace(/\[(?:المصدر|مصدر|Source|Sources):\s*[^\]]+\](?:\([^)]*\))?/gi, '').trim();
  if (appLauncherMatch) {
    displayMarkdown = displayMarkdown.replace(/:::app-launcher\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (agentActions.length > 0) {
    displayMarkdown = displayMarkdown.replace(/:::agent-action\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  displayMarkdown = displayMarkdown.replace(/:::academic-card\s*[\s\S]*?\s*:::/gi, '').trim();
  if (mediaMatch) {
    displayMarkdown = displayMarkdown.replace(/:::media-card\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (iqMatch) {
    displayMarkdown = displayMarkdown.replace(/:::iq-card\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (geoMatch) {
    displayMarkdown = displayMarkdown.replace(/:::geo-card\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (taskMatch) {
    displayMarkdown = displayMarkdown.replace(/:::task-card\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (translationMatch) {
    displayMarkdown = displayMarkdown.replace(/:::translation-card\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (adkMatch) {
    displayMarkdown = displayMarkdown.replace(/:::(?:google-adk-card|adk-card)\s*[\s\S]*?\s*:::/gi, '').trim();
  }
  if (adkPlanMatch) {
    displayMarkdown = displayMarkdown.replace(/:::(?:adk-orchestrator|adk-plan)\s*[\s\S]*?\s*:::/gi, '').trim();
  }

  // Format mathematical expressions and clean raw LaTeX tags
  displayMarkdown = formatMathAndLatex(displayMarkdown);

  const copy = () => {
    const textToCopy = displayMarkdown || message.content;
    if (!textToCopy) return;
    navigator.clipboard?.writeText(textToCopy);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean text from code blocks, markdown symbols, cards, and metadata
    const cleanText = (displayMarkdown || message.content)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[#*_~>]/g, '')
      .replace(/:::[^:]+:::/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Smart multi-language and multi-dialect detection
    const isArabic = /[\u0600-\u06FF]/.test(cleanText);
    const isFrench = /[àâäéèêëîïôöùûüç]/i.test(cleanText) && !isArabic;
    const isSpanish = /[áéíóúüñ¿¡]/i.test(cleanText) && !isArabic;
    const isGerman = /[äöüß]/i.test(cleanText) && !isArabic;
    const isItalian = /[àèéìíîòóùú]/i.test(cleanText) && !isArabic && !isFrench && !isSpanish;
    const isJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cleanText);
    const isChinese = /[\u4e00-\u9fff]/.test(cleanText) && !isJapanese;
    const isKorean = /[\uac00-\ud7af\u1100-\u11ff]/.test(cleanText);
    const isRussian = /[\u0400-\u04FF]/.test(cleanText);
    const isTurkish = /[ğüşöçıİĞÜŞÖÇ]/.test(cleanText) && !isArabic;
    const isHindi = /[\u0900-\u097F]/.test(cleanText);
    const isPersian = /[\u067E\u0686\u0698\u06AF]/.test(cleanText);
    const isUrdu = /[\u0679\u0688\u0691\u06BA\u06D2]/.test(cleanText);

    let targetLang = 'en-US';
    if (isPersian) targetLang = 'fa-IR';
    else if (isUrdu) targetLang = 'ur-PK';
    else if (isArabic) targetLang = 'ar-SA';
    else if (isFrench) targetLang = 'fr-FR';
    else if (isSpanish) targetLang = 'es-ES';
    else if (isGerman) targetLang = 'de-DE';
    else if (isItalian) targetLang = 'it-IT';
    else if (isJapanese) targetLang = 'ja-JP';
    else if (isChinese) targetLang = 'zh-CN';
    else if (isKorean) targetLang = 'ko-KR';
    else if (isRussian) targetLang = 'ru-RU';
    else if (isTurkish) targetLang = 'tr-TR';
    else if (isHindi) targetLang = 'hi-IN';
    else if (language === 'ar') targetLang = 'ar-SA';

    utterance.lang = targetLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const exactVoice = voices.find(v => v.lang.toLowerCase() === targetLang.toLowerCase());
    const matchingVoice = exactVoice || voices.find(v => v.lang.toLowerCase().startsWith(targetLang.slice(0, 2).toLowerCase()));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleLaunchSandbox = () => {
    if (!appData) return;
    const title =
      userPrompt
        ? userPrompt.slice(0, 40)
        : language === 'ar'
        ? 'لعبة / تطبيق تفاعلي جديد'
        : 'New Interactive App / Game';

    const saved = saveSandboxApp({
      title,
      prompt: userPrompt || '',
      code: appData.code,
      category: appData.isGameOrApp ? 'game' : 'app',
    });

    if (onOpenSandbox) {
      onOpenSandbox(saved.id);
    }
  };

  const isRtl = language === 'ar';
  // Slide in from user side for user message, or from assistant side for assistant message
  const slideX = assistant ? (isRtl ? 16 : -16) : (isRtl ? -16 : 16);

  return (
    <motion.article
      initial={{
        opacity: 0,
        y: 12,
        x: slideX,
        scale: 0.985,
      }}
      animate={{
        opacity: 1,
        y: 0,
        x: 0,
        scale: 1,
      }}
      transition={{
        duration: 0.28,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={assistant ? 'message-row w-full' : 'message-row message-row--user w-full'}
    >
      <div className={assistant ? 'message-avatar' : 'message-avatar message-avatar--user'} title={assistant ? 'ADEM AI' : (language === 'ar' ? 'أنت' : 'You')}>
        {assistant ? <Bot size={17} /> : <User size={17} />}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="font-bold text-[var(--text)] tracking-tight">
            {assistant ? 'ADEM' : (language === 'ar' ? 'أنت' : 'You')}
          </span>
          <span aria-hidden="true" className="text-[var(--muted)]/50">·</span>
          <span className="text-[11px] text-[var(--muted)] font-normal select-none font-mono">
            {new Date(message.createdAt).toLocaleTimeString(language === 'ar' ? 'ar-DZ' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* User Attached Images Gallery */}
        {message.images && message.images.length > 0 && (
          <div className="my-2 flex flex-wrap gap-2">
            {message.images.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  setSelectedImage({
                    url: imgUrl,
                    alt: language === 'ar' ? `صورة مرفقة ${idx + 1}` : `Attached Image ${idx + 1}`,
                  })
                }
                className="group relative block overflow-hidden rounded-xl border border-[var(--border)] hover:border-[var(--accent)] bg-[var(--surface-2)] shadow-sm transition-all duration-200 hover:scale-[1.01] cursor-pointer"
                title={language === 'ar' ? 'انقر لعرض الصورة' : 'Click to view image'}
              >
                <img
                  src={imgUrl}
                  alt={language === 'ar' ? `صورة مرفقة ${idx + 1}` : `Attached Image ${idx + 1}`}
                  className="max-h-52 max-w-xs object-cover rounded-xl"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        {/* Dedicated Google ADK Multi-Agent Orchestration Plan */}
        {adkPlanData && (
          <AdkOrchestratorCard
            plan={adkPlanData}
            language={language}
          />
        )}

        {/* Dedicated Image Card if Structured Function Call Payload exists */}
        {imageCardData && (
          <ImageCard
            imageUrl={imageCardData.imageUrl}
            enhancedPrompt={imageCardData.enhancedPrompt}
            originalPrompt={imageCardData.originalPrompt}
            title={imageCardData.title}
            aspectRatio={imageCardData.aspectRatio}
            engine={imageCardData.engine}
            language={language}
          />
        )}

        {/* Dedicated App Launcher Card when app command is triggered */}
        {appLauncherData && (
          <AppLauncherCard
            data={appLauncherData}
            language={language}
            onNavigateView={onNavigateView}
            onOpenSandbox={onOpenSandbox}
          />
        )}

        {/* Dedicated Autonomous Agent Action Cards (Code execution, Terminal runner, Files, Tasks) */}
        {agentActions.map((action, idx) => (
          <AgentActionCard
            key={idx}
            action={action}
            language={language}
            onNavigateView={onNavigateView}
            onOpenSandbox={onOpenSandbox}
          />
        ))}

        {/* Dedicated Interactive Live App / Game Runner */}
        {assistant && appData && (
          <InteractiveAppCard
            code={appData.code}
            category={appData.isGameOrApp ? 'game' : 'app'}
            language={language}
            onOpenSandbox={handleLaunchSandbox}
            onNavigateView={onNavigateView}
          />
        )}

        {/* Dedicated Media Studio Card (Palettes, SVG Vectors, Prompts, 3D specs) */}
        {mediaData && (
          <MediaStudioCard
            payload={mediaData}
            language={language}
            onNavigateView={onNavigateView}
          />
        )}

        {/* Dedicated Cognitive IQ & Logic Reasoning Card */}
        {iqData && (
          <CognitiveIqCard
            payload={iqData}
            language={language}
            onNavigateView={onNavigateView}
          />
        )}

        {/* Dedicated Geospatial Intelligence & Navigation Card */}
        {geoData && (
          <GeospatialCard
            payload={geoData}
            language={language}
          />
        )}

        {/* Dedicated Interactive Task Matrix Card */}
        {taskData && (
          <InteractiveTaskCard
            payload={taskData}
            language={language}
            onNavigateView={onNavigateView}
          />
        )}

        {/* Dedicated Universal Translation Card */}
        {translationData && (
          <TranslationCard
            data={translationData}
            language={language}
          />
        )}

        {/* Dedicated Google ADK Hardware & Robotics Card */}
        {adkData && (
          <GoogleAdkCard
            data={adkData}
            language={language}
          />
        )}

        {/* Clean, Modern User Message Speech Bubble */}
        {!assistant && (
          <div className="flex justify-end rtl:justify-start w-full">
            <div className="max-w-[90%] sm:max-w-[80%] rounded-2xl sm:rounded-3xl rounded-br-sm rtl:rounded-bl-sm rtl:rounded-br-2xl sm:rtl:rounded-br-3xl bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] border border-[var(--border)] px-4 py-3 sm:px-5 sm:py-3.5 shadow-xs text-start text-[14.5px] sm:text-[15.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap select-text transition-colors">
              {message.content}
            </div>
          </div>
        )}

        {/* Clean, Ultra-Modern Assistant Answer Screen */}
        {assistant && (
          <div className="w-full text-start">
            <div className="rounded-2xl sm:rounded-3xl patent-drafting-card p-4 sm:p-5 sm:px-6 shadow-xs transition-all">
              {displayMarkdown ? (
                <div className="message-content text-[15px] sm:text-[16px] leading-[1.8] text-[var(--text)] antialiased select-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node: _node, children, ...props }) => (
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text)] mt-4 mb-2.5 tracking-tight flex items-center gap-2" {...props}>
                          {children}
                        </h1>
                      ),
                      h2: ({ node: _node, children, ...props }) => (
                        <h2 className="text-lg sm:text-xl font-bold text-[var(--text)] mt-4 mb-2 tracking-tight border-b border-[var(--border)] pb-1.5" {...props}>
                          {children}
                        </h2>
                      ),
                      h3: ({ node: _node, children, ...props }) => (
                        <h3 className="text-base sm:text-lg font-bold text-[var(--text)] mt-3.5 mb-1.5" {...props}>
                          {children}
                        </h3>
                      ),
                      h4: ({ node: _node, children, ...props }) => (
                        <h4 className="text-sm sm:text-base font-semibold text-[var(--text)] mt-2.5 mb-1" {...props}>
                          {children}
                        </h4>
                      ),
                      p: ({ node: _node, children, ...props }) => (
                        <p className="mb-3.5 last:mb-0 leading-[1.8] text-[var(--text)]" {...props}>
                          {children}
                        </p>
                      ),
                      ul: ({ node: _node, children, ...props }) => (
                        <ul className="my-3 space-y-1.5 list-disc ps-6 marker:text-[var(--accent)] text-[var(--text)]" {...props}>
                          {children}
                        </ul>
                      ),
                      ol: ({ node: _node, children, ...props }) => (
                        <ol className="my-3 space-y-1.5 list-decimal ps-6 marker:text-[var(--accent)] marker:font-semibold text-[var(--text)]" {...props}>
                          {children}
                        </ol>
                      ),
                      li: ({ node: _node, children, ...props }) => (
                        <li className="leading-[1.75] text-[var(--text)] ps-1" {...props}>
                          {children}
                        </li>
                      ),
                      blockquote: ({ node: _node, children, ...props }) => (
                        <blockquote className="my-3.5 ps-4 py-2 border-s-3 border-[var(--accent)] bg-[var(--accent-subtle)]/40 text-[var(--text)] rounded-e-xl text-sm italic" {...props}>
                          {children}
                        </blockquote>
                      ),
                      table: ({ node: _node, children, ...props }) => (
                        <div className="my-4 overflow-x-auto rounded-xl border border-[var(--border)]">
                          <table className="w-full text-xs sm:text-sm text-start" {...props}>
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ node: _node, children, ...props }) => (
                        <thead className="bg-[var(--surface-2)] text-[var(--text)] font-semibold border-b border-[var(--border)]" {...props}>
                          {children}
                        </thead>
                      ),
                      th: ({ node: _node, children, ...props }) => (
                        <th className="px-3.5 py-2.5 text-start font-semibold text-[var(--muted)] text-xs" {...props}>
                          {children}
                        </th>
                      ),
                      td: ({ node: _node, children, ...props }) => (
                        <td className="px-3.5 py-2 text-start border-b border-[var(--border)] last:border-0 text-[var(--text)]" {...props}>
                          {children}
                        </td>
                      ),
                      tr: ({ node: _node, children, ...props }) => (
                        <tr className="hover:bg-[var(--surface-hover)] transition-colors border-b border-[var(--border)] last:border-0" {...props}>
                          {children}
                        </tr>
                      ),
                      hr: ({ node: _node, ...props }) => (
                        <hr className="my-4 border-t border-[var(--border)]" {...props} />
                      ),
                      strong: ({ node: _node, children, ...props }) => (
                        <strong className="font-bold text-[var(--text)]" {...props}>
                          {children}
                        </strong>
                      ),
                      em: ({ node: _node, children, ...props }) => (
                        <em className="italic text-[var(--text)]" {...props}>
                          {children}
                        </em>
                      ),
                      code: ({ node: _node, inline, className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeString = String(children).replace(/\n$/, '');

                        if (!inline && match) {
                          return (
                            <div className="my-3.5 rounded-xl overflow-hidden border border-[var(--border-strong)] bg-[#0b101b] dark:bg-[#070c14] shadow-md text-start" dir="ltr">
                              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400">
                                <span className="font-mono text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5 uppercase">
                                  <Code2 size={13} />
                                  {match[1]}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(codeString);
                                    setCopiedCodeIndex(Date.now());
                                    setTimeout(() => setCopiedCodeIndex(null), 2000);
                                  }}
                                  className="hover:text-slate-100 flex items-center gap-1 text-[11px] font-sans px-2.5 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  {copiedCodeIndex ? (
                                    <>
                                      <Check size={12} className="text-emerald-400" />
                                      <span className="text-emerald-400">{language === 'ar' ? 'تم النسخ' : 'Copied'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span>{language === 'ar' ? 'نسخ الكود' : 'Copy'}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="p-4 text-xs sm:text-[13px] text-slate-200 font-mono overflow-x-auto leading-relaxed select-text">
                                <code>{children}</code>
                              </pre>
                            </div>
                          );
                        }

                        return (
                          <code className="px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[var(--accent)] font-mono text-[0.88em] font-medium" {...props}>
                            {children}
                          </code>
                        );
                      },
                      a: ({ node: _node, href, children, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] hover:underline underline-offset-4 font-medium transition-colors"
                          {...props}
                        >
                          {children}
                        </a>
                      ),
                      img: ({ node: _node, src, alt }) => {
                        if (!src) return null;
                        const isVideoUrl =
                          /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(src) ||
                          src.includes('video') ||
                          src.includes('mp4');
                        if (isVideoUrl) {
                          return (
                            <div className="my-3 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-xl group relative">
                              <video
                                src={src}
                                controls
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full max-h-[480px] object-cover rounded-2xl"
                              />
                              <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-xs text-slate-300 font-medium flex items-center justify-between">
                                <span className="truncate max-w-[70%]">
                                  {alt || (language === 'ar' ? 'مشهد فيديو سينمائي' : 'Cinematic video')}
                                </span>
                                <a
                                  href={src}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 underline text-[11px]"
                                >
                                  {language === 'ar' ? 'فتح الفيديو' : 'Open video'}
                                </a>
                              </div>
                            </div>
                          );
                        }

                        const decodedPrompt = extractPromptFromUrl(src) || alt || '';
                        return (
                          <ImageCard
                            imageUrl={src}
                            enhancedPrompt={decodedPrompt}
                            title={alt || (language === 'ar' ? 'صورة فائقة الدقة' : 'High-Res Image')}
                            language={language}
                          />
                        );
                      },
                    }}
                  >
                    {displayMarkdown}
                  </ReactMarkdown>
                </div>
              ) : !imageCardData && !agentActions.length && !mediaData && !iqData && !geoData && !taskData && !translationData && !adkData && !adkPlanData && !appData ? (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)] py-1 select-none">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" />
                  </span>
                  <span className="text-xs text-[var(--muted)] font-medium ms-1">
                    {language === 'ar' ? 'ADEM يكتب الرد…' : 'ADEM is formulating response…'}
                  </span>
                </div>
              ) : null}

              {/* Inline Live Translation Container */}
              {showInlineTranslation && (
                <div className="mt-3.5 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text)] animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[var(--border)] text-[11px] font-bold text-[var(--accent)]">
                    <span className="flex items-center gap-1.5">
                      <Languages size={13} />
                      <span>{language === 'ar' ? 'الترجمة الفورية المباشرة:' : 'Instant Translation:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowInlineTranslation(false)}
                      className="hover:text-[var(--text)] text-[var(--muted)] text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {isTranslating ? (
                    <div className="flex items-center gap-2 text-[var(--muted)] py-1.5">
                      <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
                      <span>{language === 'ar' ? 'جاري الترجمة...' : 'Translating message...'}</span>
                    </div>
                  ) : (
                    <div className="leading-relaxed select-text whitespace-pre-wrap font-normal text-sm">
                      {inlineTranslation}
                    </div>
                  )}
                </div>
              )}

              {/* Modern Minimalist Action Bar - Only when content is present */}
              {displayMarkdown && displayMarkdown.trim().length > 0 && (
                <div className="flex items-center justify-between pt-3 mt-4 border-t border-[var(--border)]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="message-action"
                      onClick={copy}
                      title={language === 'ar' ? 'نسخ الإجابة كاملة' : 'Copy entire answer'}
                    >
                      {copiedMessage ? (
                        <>
                          <Check size={13} className="text-emerald-400" />
                          <span className="text-[11px] text-emerald-400">{language === 'ar' ? 'تم النسخ' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span className="text-[11px]">{language === 'ar' ? 'نسخ' : 'Copy'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className={`message-action ${isSpeaking ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' : ''}`}
                      onClick={toggleSpeak}
                      title={isSpeaking ? (language === 'ar' ? 'إيقاف القراءة الصوتية' : 'Stop speaking') : (language === 'ar' ? 'قراءة صوتية ذكية' : 'Read aloud')}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX size={13} className="text-amber-400 animate-pulse" />
                          <span className="text-[11px] text-amber-400">{language === 'ar' ? 'إيقاف' : 'Stop'}</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={13} />
                          <span className="text-[11px]">{language === 'ar' ? 'قراءة' : 'Speak'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className={`message-action ${showInlineTranslation ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : ''}`}
                      onClick={async () => {
                        if (showInlineTranslation) {
                          setShowInlineTranslation(false);
                          return;
                        }
                        setShowInlineTranslation(true);
                        if (!inlineTranslation) {
                          setIsTranslating(true);
                          try {
                            const cleanText = (displayMarkdown || message.content).replace(/```[\s\S]*?```/g, '').trim();
                            const targetLang = language === 'ar' ? 'en' : 'ar';
                            const res = await requestTranslation({
                              text: cleanText.slice(0, 3000),
                              sourceLang: 'auto',
                              targetLang,
                              tone: 'general',
                            });
                            setInlineTranslation(res.translatedText);
                          } catch {
                            setInlineTranslation(language === 'ar' ? 'تعذرت الترجمة مؤقتاً' : 'Translation failed temporarily');
                          } finally {
                            setIsTranslating(false);
                          }
                        }
                      }}
                      title={language === 'ar' ? 'ترجمة فورية للرسالة' : 'Instant translate'}
                    >
                      <Languages size={13} />
                      <span className="text-[11px]">{language === 'ar' ? 'ترجمة' : 'Translate'}</span>
                    </button>
                  </div>

                  <div className="text-[11px] text-[var(--muted)] font-normal select-none">
                    {displayMarkdown && `${displayMarkdown.split(/\s+/).filter(Boolean).length} ${language === 'ar' ? 'كلمة' : 'words'}`}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ImageViewerModal
        imageUrl={selectedImage?.url || null}
        altText={selectedImage?.alt}
        onClose={() => setSelectedImage(null)}
        language={language}
      />
    </motion.article>
  );
}

