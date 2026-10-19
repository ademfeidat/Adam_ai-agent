import React, { Component, ErrorInfo, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AppPreferences, Language, ViewId } from './core/domain';
import { createNewConversation, loadPreferences, normalizePreferences, savePreferences } from './core/storage';
import { AppShell } from './components/AppShell';
import { Chat } from './features/chat/Chat';
import { Settings } from './features/settings/Settings';
import { BackgroundSecuritySentinel } from './components/BackgroundSecuritySentinel';
import { QuickLiquidRefraction } from './components/QuickLiquidRefraction';
import { NetworkSentinel } from './components/NetworkSentinel';
import { Onboarding } from './features/onboarding/Onboarding';
import { InAppBrowserModal } from './components/InAppBrowserModal';
import { AuthModal } from './components/AuthModal';
import { AgenticLogin } from './features/auth/AgenticLogin';
import { openSafeExternalUrl, setupAndroidBackGuard } from './core/utils/mobileWebHandler';
import { GenerationProvider } from './core/generation';

interface EngineErrorBoundaryProps {
  children: ReactNode;
  language?: Language;
}

interface EngineErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class EngineErrorBoundary extends Component<EngineErrorBoundaryProps, EngineErrorBoundaryState> {
  public state: EngineErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): EngineErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[EngineErrorBoundary] Caught engine error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-mono select-none">
          <div className="max-w-md w-full bg-slate-900/90 border border-cyan-500/40 rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs uppercase tracking-widest text-cyan-400 font-bold">ADEM Engine Self-Healing Protection</span>
            </div>
            <h2 className="text-xl font-bold mb-2 text-cyan-200">تم تفعيل التعافي الذاتي للمحرك</h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              حدث خطأ مؤقت في تشغيل أحد محركات النظام. تم منع الانهيار بنجاح عبر بروتوكول التعافي الذاتي والاستقرار اللحظي.
            </p>
            {this.state.error && (
              <div className="bg-slate-950/80 p-3 rounded-xl border border-red-500/20 text-xs text-red-400 mb-6 font-mono overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('adam_cache_lock');
                window.location.reload();
              }}
              className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>إعادة ضبط وتشغيل المحرك (Engine Reboot)</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const DEFAULT_PREFERENCES: AppPreferences = {
  agentName: 'Adam',
  language: 'en',
  theme: 'glass-dark',
  onboardingComplete: true,
};

export default function App() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    const loaded = loadPreferences(DEFAULT_PREFERENCES);
    if (loaded.theme === 'system' || loaded.theme === 'dark') {
      const updated = { ...loaded, theme: 'glass-dark' as const };
      savePreferences(updated);
      return updated;
    }
    return loaded;
  });
  const [activeView, setActiveView] = useState<ViewId>('chat');
  const [chatSessionKey, setChatSessionKey] = useState(1);
  const [selectedSandboxAppId, setSelectedSandboxAppId] = useState<string | undefined>(undefined);
  const [sessionMeta, setSessionMeta] = useState<{ title?: string; count?: number }>({});
  const [loginExperienceOpen, setLoginExperienceOpen] = useState(false);

  const handleOpenSessionDrawer = useCallback(() => {
    window.dispatchEvent(new CustomEvent('adam:open-session-drawer'));
  }, []);

  const handleSessionMetaChange = useCallback((meta: { title: string; count: number }) => {
    setSessionMeta((prev) => {
      if (prev.title === meta.title && prev.count === meta.count) return prev;
      return meta;
    });
  }, []);

  const handleNewChat = () => {
    createNewConversation('', preferences.language);
    setChatSessionKey((prev) => prev + 1);
    setActiveView('chat');
  };

  useEffect(() => {
    if (activeView !== 'chat' && activeView !== 'settings') {
      setActiveView('chat');
    }
  }, [activeView]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', preferences.theme);
    root.setAttribute('dir', preferences.language === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', preferences.language);

    const darkThemes = [
      'dark',
      'midnight',
      'glass-dark',
      'aurora',
      'ocean',
      'cyberpunk',
      'coffee',
      'royal',
      'crimson',
      'matrix',
      'dracula',
      'nord',
      'synthwave',
      'forest',
      'gold',
      'solar',
      'stranger-things',
      'outer-banks',
      'game-of-thrones',
      'tokyo-night',
      'catppuccin-mocha',
      'monokai-pro',
      'gruvbox-dark',
      'sunset-miami',
      'deep-space',
      'emerald-luxury',
      'titanium-dark',
    ];
    if (darkThemes.includes(preferences.theme)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [preferences.theme, preferences.language]);

  const updatePreferences = (next: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const merged = normalizePreferences({ ...prev, ...next });
      savePreferences(merged);
      return merged;
    });
  };

  const handleOnboardingComplete = (next: AppPreferences) => {
    updatePreferences({ ...next, onboardingComplete: true });
  };

  const heroCopy = useMemo(() => {
    return preferences.language === 'ar'
      ? {
          title: `مرحباً، أنا ${preferences.agentName}`,
          subtitle: 'وكيلك الذكي الشخصي — يفهم، يخطط، ينفذ الأدوات، ويتحقق من النتيجة بدقة',
        }
      : {
          title: `Hello, I'm ${preferences.agentName}`,
          subtitle: 'Your autonomous personal agent — plans, executes tools, and verifies results',
        };
  }, [preferences.language, preferences.agentName]);

  useEffect(() => {
    const unguard = setupAndroidBackGuard(() => {
      if (activeView !== 'chat') {
        setActiveView('chat');
        return true;
      }
      return false;
    });

    const handleAppOpenEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ appId: string; externalUrl?: string }>;
      const appId = customEvent.detail?.appId;
      const externalUrl = customEvent.detail?.externalUrl;

      if (externalUrl) {
        openSafeExternalUrl(externalUrl);
        return;
      }

      if (appId) {
        setSelectedSandboxAppId(appId);
        setActiveView('apps');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('adam_open_app' as any, handleAppOpenEvent);
    }

    return () => {
      window.removeEventListener('adam_open_app' as any, handleAppOpenEvent);
      unguard();
    };
  }, [activeView]);

  if (!preferences.onboardingComplete) {
    return <Onboarding initial={preferences} onComplete={handleOnboardingComplete} />;
  }

  return (
    <EngineErrorBoundary language={preferences.language}>
      <GenerationProvider>
      <AppShell
        activeView={activeView}
        language={preferences.language}
        agentName={preferences.agentName}
        onViewChange={setActiveView}
        onNewChat={handleNewChat}
        onToggleLanguage={() =>
          updatePreferences({ language: preferences.language === 'ar' ? 'en' : 'ar' })
        }
        sessionTitle={sessionMeta.title}
        conversationCount={sessionMeta.count}
        onOpenSessionDrawer={handleOpenSessionDrawer}
        onOpenAuth={() => setLoginExperienceOpen(true)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 8, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
            transition={{
              duration: 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="view-transition-wrapper h-full w-full flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {activeView === 'chat' && (
              <Chat
                key={`${preferences.language}-${preferences.agentName}-${chatSessionKey}`}
                language={preferences.language}
                agentName={preferences.agentName}
                copy={heroCopy}
                onNewChat={handleNewChat}
                onToggleLanguage={() =>
                  updatePreferences({ language: preferences.language === 'ar' ? 'en' : 'ar' })
                }
                onOpenSandbox={(appId) => {
                  setSelectedSandboxAppId(appId);
                }}
                onSessionMetaChange={handleSessionMetaChange}
                onNavigateView={(view) => {
                  if (view === 'settings') {
                    setActiveView('settings');
                  }
                }}
              />
            )}

            {activeView === 'settings' && (
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--surface)]">
                <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]/90 backdrop-blur-xl flex items-center justify-between z-10 shrink-0">
                  <span className="text-xs font-bold text-[var(--text)]">
                    {preferences.language === 'ar' ? 'إعدادات المنظومة والمظهر' : 'System Settings & Theme'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveView('chat')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold shadow-xs hover:opacity-90 transition active:scale-95 cursor-pointer"
                  >
                    <span>{preferences.language === 'ar' ? 'العودة للمحادثة' : 'Back to Chat'}</span>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <Settings
                    language={preferences.language}
                    preferences={preferences}
                    onChange={updatePreferences}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <BackgroundSecuritySentinel />
        <QuickLiquidRefraction />
        <NetworkSentinel language={preferences.language} />
        <InAppBrowserModal language={preferences.language} />
        <AuthModal language={preferences.language} />
        {loginExperienceOpen && (
          <AgenticLogin
            language={preferences.language}
            open={loginExperienceOpen}
            onClose={() => setLoginExperienceOpen(false)}
            onOpenFallbackAuth={() => { setLoginExperienceOpen(false); window.dispatchEvent(new CustomEvent('adam:open-auth-modal')); }}
          />
        )}
      </AppShell>
    </GenerationProvider>
    </EngineErrorBoundary>
  );
}
