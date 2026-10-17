import {
  Film,
  Gamepad2,
  Languages,
  MessageSquare,
  PanelLeft,
  Plus,
  Radio,
  Sparkles,
  ChevronDown,
  Check,
  Globe,
  Settings as SettingsIcon,
  Server,
  Award,
} from 'lucide-react';
import { type ReactNode, useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ChatConversation, Language, ViewId } from '../core/domain';
import { BrandMark } from './BrandMark';
import { Sidebar } from './Sidebar';
import { PatentDossierModal } from './PatentDossierModal';
import { copy } from '../core/i18n';
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

const STUDIO_TABS: {
  id: ViewId;
  icon: typeof MessageSquare;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  badgeAr: string;
  badgeEn: string;
  shortcut: string;
  gradientClass: string;
  iconColor: string;
  borderColor: string;
  glowAura: string;
}[] = [
  {
    id: 'chat',
    icon: MessageSquare,
    labelAr: 'المحادثة الذكية (الوحدة المركزية)',
    labelEn: 'Unified Smart Chat',
    descAr: 'محادثة وتوليد إجابات وأدوات ذكية متقدمة',
    descEn: 'Unified Executive AI Chat & Tools',
    badgeAr: 'المحادثة',
    badgeEn: 'Chat',
    shortcut: 'Alt+1',
    gradientClass: 'from-cyan-500/25 via-blue-500/15 to-transparent',
    iconColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/40',
    glowAura: 'rgba(6, 182, 212, 0.35)',
  },
];


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
  const t = copy(language);
  const isAr = language === 'ar';
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>(() => loadAllConversations());
  const [activeConvId, setActiveConvId] = useState<string>(() => loadConversation().id);
  const [memoryStats, setMemoryStats] = useState(() => getInfiniteMemoryStats());
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isPatentModalOpen, setIsPatentModalOpen] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isToolsMenuOpen) {
      setHoveredTab(activeView);
    }
  }, [isToolsMenuOpen, activeView]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };
    if (isToolsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isToolsMenuOpen]);

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

  // Keyboard shortcut listener: Alt+1/2/3/4 for fast navigation between the 4 tools, Escape to close menu, Alt+B for sidebar, Alt+N for new chat
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

      if (e.key === 'Escape' && isToolsMenuOpen) {
        e.preventDefault();
        setIsToolsMenuOpen(false);
        return;
      }

      if (e.altKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === '1') {
          e.preventDefault();
          onViewChange('chat');
          setIsToolsMenuOpen(false);
        } else if (key === '2') {
          e.preventDefault();
          onViewChange('apps');
          setIsToolsMenuOpen(false);
        } else if (key === '3') {
          e.preventDefault();
          onViewChange('media');
          setIsToolsMenuOpen(false);
        } else if (key === '4') {
          e.preventDefault();
          onViewChange('translate');
          setIsToolsMenuOpen(false);
        } else if (key === 'b') {
          e.preventDefault();
          setIsSidebarOpen((prev) => !prev);
        } else if (key === 'n') {
          e.preventDefault();
          handleStartNewChat();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onViewChange, isToolsMenuOpen]);

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

        {/* Center Section: Responsive Executive Studio Switcher */}
        <div className="flex items-center">
          {/* Desktop Direct Horizontal Segmented Switcher (Visible on md and larger) */}
          <nav aria-label="Studio Navigation" className="hidden md:flex items-center gap-1 p-1 rounded-2xl bg-[var(--surface-2)]/80 border border-[var(--border)] shadow-xs backdrop-blur-xl">
            {STUDIO_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onViewChange(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none active:scale-95 ${
                    isActive
                      ? 'text-[var(--text)] shadow-xs'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]/60'
                  }`}
                  title={`${isAr ? tab.labelAr : tab.labelEn} (${tab.shortcut})`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="desktop-header-tab-glider"
                      className="absolute inset-0 rounded-xl bg-[var(--surface)] border border-[var(--border-strong)] shadow-sm z-0"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className={`relative z-10 ${isActive ? tab.iconColor : 'opacity-70'}`}>
                    <TabIcon size={14} />
                  </span>
                  <span className="relative z-10 text-[11.5px] tracking-tight">
                    {isAr ? tab.labelAr : tab.labelEn}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Mobile / Narrow Screen Morphing Dropdown Deck Button (Visible on < md) */}
          <div className="flex md:hidden relative shrink-0" ref={toolsMenuRef}>
            {(() => {
              const currentTab = STUDIO_TABS.find((t) => t.id === activeView) || STUDIO_TABS[0];
              const CurrentIcon = currentTab.icon;
              return (
                <>
                  <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setIsToolsMenuOpen((prev) => !prev)}
                  aria-expanded={isToolsMenuOpen}
                  className={`group relative flex items-center gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-xs font-bold transition-all duration-300 cursor-pointer shadow-sm border select-none ${
                    isToolsMenuOpen
                      ? 'bg-[var(--surface-hover)] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_22px_var(--accent-glow)] ring-2 ring-[var(--accent)]/25'
                      : 'bg-[var(--surface-2)]/90 hover:bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)]'
                  }`}
                  title={isAr ? 'التبديل بين الأدوات الأربعة' : 'Switch Studio'}
                >
                {/* Active Glowing Dot Indicator */}
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                </span>

                {/* Morphing Mode Icon with AnimatePresence */}
                <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={currentTab.id}
                      initial={{ scale: 0.5, rotate: -25, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ scale: 0.5, rotate: 25, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className={`flex items-center justify-center ${
                        isToolsMenuOpen ? 'text-[var(--accent)]' : currentTab.iconColor
                      }`}
                    >
                      <CurrentIcon size={14} />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Current Active Label */}
                <span className="font-bold text-xs tracking-tight text-[var(--text)]">
                  {isAr ? currentTab.labelAr : currentTab.labelEn}
                </span>

                {/* Dynamic Spring Rotating Chevron */}
                <motion.div
                  animate={{
                    rotate: isToolsMenuOpen ? 180 : 0,
                    scale: isToolsMenuOpen ? 1.15 : 1,
                    color: isToolsMenuOpen ? 'var(--accent)' : 'var(--muted)',
                  }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  className="flex items-center ms-0.5"
                >
                  <ChevronDown size={14} />
                </motion.div>
              </motion.button>

              {/* Modern Animated Floating Command Deck */}
              <AnimatePresence>
                {isToolsMenuOpen && (
                  <>
                    {/* Frosted Backdrop Overlay for Focus & Click-Outside */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
                      onClick={() => setIsToolsMenuOpen(false)}
                    />

                    {/* Floating Modern Dynamic Deck */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.84, y: -16, filter: 'blur(14px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{
                        opacity: 0,
                        scale: 0.88,
                        y: -10,
                        filter: 'blur(10px)',
                        transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 440,
                        damping: 28,
                        mass: 0.7,
                      }}
                      style={{ transformOrigin: 'top center' }}
                      className="fixed sm:absolute top-14 sm:top-full left-1/2 -translate-x-1/2 mt-1 sm:mt-2.5 z-50 w-[calc(100vw-24px)] sm:w-auto sm:min-w-[340px] max-w-[360px] p-2.5 rounded-3xl bg-[var(--surface)]/98 backdrop-blur-3xl border border-[var(--border-strong)] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_35px_rgba(0,242,254,0.14)] overflow-hidden select-none"
                    >
                      {/* Top Specular Neon Light Beam */}
                      <motion.div
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="absolute -top-px left-1/2 -translate-x-1/2 w-4/5 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent blur-[0.5px]"
                      />

                      {/* Header bar */}
                      <div className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] select-none border-b border-[var(--border)]/60 mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={11} className="text-[var(--accent)] animate-pulse" />
                          <span>{isAr ? 'المنظومة التنفيذية · الأدوات الأربعة' : 'Executive OS · 4 Studios'}</span>
                        </div>
                        <span className="text-[9px] font-mono text-[var(--muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded-md border border-[var(--border)]">
                          Esc
                        </span>
                      </div>

                      {/* Staggered Animated List of the 4 Tools */}
                      <motion.div
                        variants={{
                          hidden: { opacity: 0 },
                          show: {
                            opacity: 1,
                            transition: {
                              staggerChildren: 0.045,
                              delayChildren: 0.02,
                            },
                          },
                          exit: {
                            opacity: 0,
                            transition: {
                              staggerChildren: 0.02,
                              staggerDirection: -1,
                            },
                          },
                        }}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className="space-y-1.5"
                        onMouseLeave={() => setHoveredTab(activeView)}
                      >
                        {STUDIO_TABS.map((tab) => {
                          const Icon = tab.icon;
                          const isSelected = activeView === tab.id;
                          const isHovered = (hoveredTab || activeView) === tab.id;

                          return (
                            <motion.button
                              key={tab.id}
                              variants={{
                                hidden: { opacity: 0, y: -10, scale: 0.94, filter: 'blur(4px)' },
                                show: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  filter: 'blur(0px)',
                                  transition: {
                                    type: 'spring',
                                    stiffness: 500,
                                    damping: 28,
                                  },
                                },
                                exit: { opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.1 } },
                              }}
                              type="button"
                              onMouseEnter={() => setHoveredTab(tab.id)}
                              onClick={() => {
                                onViewChange(tab.id);
                                setIsToolsMenuOpen(false);
                              }}
                              whileTap={{ scale: 0.97 }}
                              className="relative w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition-colors cursor-pointer group text-start select-none"
                            >
                              {/* Gliding Spring Hover Pill (Framer Motion layoutId) */}
                              {isHovered && (
                                <motion.div
                                  layoutId="studio-menu-hover-glider"
                                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[var(--surface-hover)] to-[var(--surface-2)] border border-[var(--accent)]/30 shadow-[0_0_18px_var(--accent-glow)] z-0"
                                  initial={false}
                                  transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                                />
                              )}

                              {/* Content */}
                              <div className="relative z-10 flex items-center gap-3 min-w-0">
                                <motion.div
                                  whileHover={{ scale: 1.15, rotate: isAr ? -5 : 5 }}
                                  transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-gradient-to-br ${tab.gradientClass} ${tab.iconColor} ${tab.borderColor} shadow-sm transition-transform`}
                                  style={{
                                    boxShadow: isSelected ? `0 0 16px ${tab.glowAura}` : undefined,
                                  }}
                                >
                                  <Icon size={17} />
                                </motion.div>
                                <div className="flex flex-col min-w-0 text-start">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`font-bold text-xs tracking-tight transition-colors ${
                                        isSelected
                                          ? 'text-[var(--accent)]'
                                          : 'text-[var(--text)] group-hover:text-[var(--accent)]'
                                      }`}
                                    >
                                      {isAr ? tab.labelAr : tab.labelEn}
                                    </span>
                                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)]/60">
                                      {isAr ? tab.badgeAr : tab.badgeEn}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-[var(--muted)] truncate font-normal mt-0.5">
                                    {isAr ? tab.descAr : tab.descEn}
                                  </span>
                                </div>
                              </div>

                              {/* End Item: Active Status or Keyboard Shortcut */}
                              <div className="relative z-10 flex items-center gap-1.5 ms-2 shrink-0">
                                {isSelected ? (
                                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 shadow-xs">
                                    <Check size={12} className="stroke-[3]" />
                                    <span>{isAr ? 'نشط' : 'Active'}</span>
                                  </span>
                                ) : (
                                  <kbd className="hidden sm:inline-block text-[10px] font-mono text-[var(--muted)] group-hover:text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)]">
                                    {tab.shortcut}
                                  </kbd>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </>
          );
        })()}
          </div>
        </div>

        {/* End Section: New Chat, Language, Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
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
