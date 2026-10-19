import {
  PanelLeft,
  Plus,
  Radio,
  Settings as SettingsIcon,
  Award,
} from 'lucide-react';
import { type ReactNode, useEffect, useState, useCallback } from 'react';
import type { ChatConversation, Language, ViewId } from '../core/domain';
import { BrandMark } from './BrandMark';
import { Sidebar } from './Sidebar';
import { PatentDossierModal } from './PatentDossierModal';
import { LiveVoiceModal } from '../features/live/LiveVoiceModal';
import {
  loadAllConversations,
  loadConversation,
  deleteConversation,
  renameConversation,
  createNewConversation,
  setActiveConversationId,
} from '../core/storage';
import { getInfiniteMemoryStats } from '../core/agent/infiniteMemory';

interface AppShellProps {
  activeView: ViewId;
  language: Language;
  agentName: string;
  onViewChange: (view: ViewId) => void;
  onNewChat?: () => void;
  onToggleLanguage?: () => void;
  children: ReactNode;
  sessionTitle?: string;
  conversationCount?: number;
  onOpenSessionDrawer?: () => void;
  onOpenAuth?: () => void;
}

export function AppShell({
  activeView,
  language,
  agentName: _agentName,
  onViewChange,
  onNewChat,
  onToggleLanguage,
  children,
  sessionTitle: _sessionTitle,
  conversationCount: _conversationCount,
  onOpenSessionDrawer: _onOpenSessionDrawer,
  onOpenAuth: _onOpenAuth,
}: AppShellProps) {
  const isAr = language === 'ar';
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>(() => loadAllConversations());
  const [activeConvId, setActiveConvId] = useState<string>(() => loadConversation().id);
  const [memoryStats, setMemoryStats] = useState(() => getInfiniteMemoryStats());
  const [isPatentModalOpen, setIsPatentModalOpen] = useState(false);

  const refreshConversations = useCallback(() => {
    setConversations(loadAllConversations());
    setActiveConvId(loadConversation().id);
    setMemoryStats(getInfiniteMemoryStats());
  }, []);

  // Listen for custom events
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('live') === '1') {
        setIsLiveVoiceOpen(true);
      }
    } catch {}

    const handleOpenLiveVoice = () => setIsLiveVoiceOpen(true);
    const handleOpenSidebar = () => setIsSidebarOpen(true);
    const handleToggleSidebar = () => setIsSidebarOpen((prev) => !prev);
    const handleRefreshConversations = () => refreshConversations();

    window.addEventListener('adam:open-live-voice' as any, handleOpenLiveVoice);
    window.addEventListener('adam:open-session-drawer' as any, handleOpenSidebar);
    window.addEventListener('adam:toggle-sidebar' as any, handleToggleSidebar);
    window.addEventListener('adam:refresh-conversations' as any, handleRefreshConversations);

    return () => {
      window.removeEventListener('adam:open-live-voice' as any, handleOpenLiveVoice);
      window.removeEventListener('adam:open-session-drawer' as any, handleOpenSidebar);
      window.removeEventListener('adam:toggle-sidebar' as any, handleToggleSidebar);
      window.removeEventListener('adam:refresh-conversations' as any, handleRefreshConversations);
    };
  }, [refreshConversations]);

  const handleStartNewChat = () => {
    createNewConversation('', language);
    refreshConversations();
    onViewChange('chat');
    onNewChat?.();
    window.dispatchEvent(new CustomEvent('adam:new-chat-triggered'));
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setActiveConvId(id);
    refreshConversations();
    onViewChange('chat');
    window.dispatchEvent(new CustomEvent('adam:select-conversation', { detail: { id } }));
  };

  const handleDeleteConversation = (id: string) => {
    const { remaining, nextActiveId } = deleteConversation(id);
    setConversations(remaining);
    setActiveConvId(nextActiveId);
    window.dispatchEvent(new CustomEvent('adam:select-conversation', { detail: { id: nextActiveId } }));
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    renameConversation(id, newTitle);
    refreshConversations();
  };

  // Keyboard shortcut listener: Alt+B for sidebar, Alt+N for new chat, Alt+1 for chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          setIsSidebarOpen((prev) => !prev);
        } else if (key === 'n') {
          e.preventDefault();
          handleStartNewChat();
        } else if (key === '1') {
          e.preventDefault();
          onViewChange('chat');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onViewChange]);

  return (
    <div className="app-shell flex flex-col h-screen overflow-hidden">
      {/* Top Organized Shelf Navigation Bar (الرف العلوي المنظم المتجاوب) */}
      <header className="flex items-center justify-between w-full px-2.5 sm:px-4 py-2 bg-[var(--surface)]/95 backdrop-blur-2xl border-b border-[var(--border)] z-30 shrink-0 select-none shadow-sm gap-2">
        {/* Start Section: Side Button (Sidebar Toggle) + Brand Mark */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all border border-[var(--border)] cursor-pointer active:scale-95 shrink-0 shadow-sm"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            title={isAr ? 'القائمة الجانبية والمحادثات (Alt+B)' : 'Sidebar & Conversations (Alt+B)'}
            aria-label="Toggle Sidebar"
          >
            <PanelLeft size={16} className={isAr ? 'rotate-180' : ''} />
          </button>

          <div
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 cursor-pointer group ms-0.5 sm:ms-1"
            onClick={() => onViewChange('chat')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewChange('chat'); }}
            title="ADEM AI"
            aria-label="ADEM AI Home"
          >
            <BrandMark compact />
            <div className="hidden md:flex flex-col text-start leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs tracking-wider text-[var(--text)] font-mono">ADEM</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                  v4.0
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPatentModalOpen(true);
                  }}
                  className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-500/35 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-900/50 transition cursor-pointer text-[9.5px] font-mono tracking-wider shadow-xs"
                  title={isAr ? 'عرض وثيقة براءة الاختراع السيبراني' : 'View Cyber-Patent Dossier'}
                >
                  <Award size={11} className="text-cyan-400" />
                  <span>PAT. #ADEM-2026-X1</span>
                </button>
              </div>
              <span className="text-[9.5px] text-[var(--muted)] font-medium">
                {isAr ? 'هندسة وبرمجة: adem feidat' : 'Engineered by adem feidat'}
              </span>
            </div>
          </div>
        </div>

        {/* Center Section: Unified Single Conversation Mode */}
        <div className="flex items-center">
          <div className="flex items-center gap-2 px-3 py-1 sm:py-1.5 rounded-full bg-[var(--surface-2)]/90 border border-[var(--border)] shadow-xs select-none">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </span>
            <span className="text-xs font-bold text-[var(--text)] tracking-tight">
              {isAr ? "المنظومة التنفيذية الموحدة" : "Unified Executive Agent"}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--accent)] border border-[var(--border)] font-semibold hidden sm:inline-block">
              {isAr ? "محادثة واحدة شاملة" : "All-In-One Chat"}
            </span>
          </div>
        </div>

        {/* End Section: Live Voice, New Chat, Language, Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Live Voice Stream Button */}
          <button
            type="button"
            onClick={() => setIsLiveVoiceOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-cyan-500/50 text-[var(--muted)] hover:text-cyan-400 transition-all cursor-pointer active:scale-95 shadow-2xs"
            title={isAr ? "المحادثة الصوتية الحية المباشرة (Live Voice)" : "Live Voice Conversation"}
            aria-label="Live Voice"
          >
            <Radio size={14} className="text-cyan-400 animate-pulse" />
          </button>

          {/* New Chat Quick Button */}
          <button
            type="button"
            onClick={handleStartNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)] hover:text-[var(--accent)] text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-2xs"
            title={isAr ? 'بدء محادثة جديدة (Alt+N)' : 'Start new chat (Alt+N)'}
            aria-label="New Chat"
          >
            <Plus size={14} className="text-[var(--accent)]" />
            <span className="hidden sm:inline">{isAr ? 'جديدة' : 'New'}</span>
          </button>

          {/* Language Switcher */}
          {onToggleLanguage && (
            <button
              type="button"
              onClick={onToggleLanguage}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)] text-[11px] font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
              title={isAr ? 'Switch to English' : 'التحويل للعربية'}
              aria-label="Toggle Language"
            >
              {isAr ? 'EN' : 'عربي'}
            </button>
          )}

          {/* Settings / Theme Trigger */}
          <button
            type="button"
            onClick={() => onViewChange('settings')}
            className={`flex items-center justify-center w-8 h-8 rounded-xl border transition-all cursor-pointer active:scale-95 shadow-2xs ${
              activeView === 'settings'
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]'
                : 'bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title={isAr ? 'الإعدادات والمظهر' : 'Settings & Themes'}
            aria-label="Settings"
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </header>

      {/* Main Workspace Area with Collapsible Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
          onClose={() => setIsSidebarOpen(false)}
          language={language}
          conversations={conversations}
          activeId={activeConvId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleStartNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onOpenSettings={() => onViewChange('settings')}
          onViewChange={onViewChange}
          onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
          activeView={activeView}
          memoryCount={memoryStats.total}
        />

        <main className="main-content flex-1 flex flex-col h-full overflow-hidden relative min-h-0">{children}</main>
      </div>

      {/* Real-time Voice Stream Modal (gemini-3.8-live) */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        language={language}
      />

      {/* Cyber-Patent Official Dossier Modal */}
      <PatentDossierModal
        isOpen={isPatentModalOpen}
        onClose={() => setIsPatentModalOpen(false)}
        language={language}
      />
    </div>
  );
}
