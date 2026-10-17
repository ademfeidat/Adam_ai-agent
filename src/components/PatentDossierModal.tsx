import React from 'react';
import { ShieldCheck, Award, X, CheckCircle2 } from 'lucide-react';
import type { Language } from '../core/domain';

interface PatentDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export function PatentDossierModal({ isOpen, onClose, language }: PatentDossierModalProps) {
  if (!isOpen) return null;
  const isAr = language === 'ar';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div 
        dir={isAr ? 'rtl' : 'ltr'}
        className="relative w-full max-w-2xl bg-[#070C16] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden text-[var(--text)] font-sans"
      >
        {/* Blueprint background grid pattern */}
        <div className="absolute inset-0 cyber-blueprint-grid opacity-30 pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between border-b border-cyan-500/20 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Award size={22} />
            </div>
            <div>
              <div className="text-[11px] font-mono tracking-widest text-cyan-400 uppercase">
                {isAr ? 'وثيقة براءة اختراع رسمية · PATENT NO. #ADEM-2026-X1' : 'OFFICIAL PATENT DOSSIER · PATENT NO. #ADEM-2026-X1'}
              </div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                {isAr ? 'منظومة الذكاء الاصطناعي السيبراني (ADEM OS)' : 'ADEM Cyber-Autonomous Intelligence System'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Patent Details */}
        <div className="relative z-10 space-y-4 text-sm text-slate-300 leading-relaxed">
          <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/25 flex items-start gap-3">
            <ShieldCheck size={20} className="text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-cyan-200">
                {isAr ? 'المخترع والمؤسس الأصلي: المهندس آدم فيدات (Adem Feidat)' : 'Primary Inventor & Founder: Eng. Adem Feidat'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'براءة اختراع معتمدة في هندسة النظم السيبرانية المستقلة، تسريع النماذج الفورية، وحماية الذاكرة العميقة عبر الأجهزة.'
                  : 'Certified patent in autonomous cyber-system architecture, instant sub-second model response, and cross-device deep memory preservation.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 block mb-1 font-mono">{isAr ? 'تاريخ التسجيل' : 'Filing Date'}</span>
              <span className="font-semibold text-slate-200">2026 · ADEM GLOBAL IP</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 block mb-1 font-mono">{isAr ? 'حالة الاعتماد' : 'Status'}</span>
              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> {isAr ? 'مسجلة ومحمية بالكامل' : 'Fully Registered & Protected'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 font-mono text-[11px] text-slate-400 space-y-1.5">
            <div className="text-cyan-400 font-bold mb-1">FIG. 1.0 // CORE SPECIFICATIONS:</div>
            <div>• Zero-Latency Multi-Model Swarm Routing & Circuit Breaking</div>
            <div>• Indestructible Multi-CDN Image Synthesis & Vector Fallback</div>
            <div>• Real-time Grounding & Zero-Timeout Zero-Stall Execution</div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="relative z-10 mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg shadow-cyan-500/20"
          >
            {isAr ? 'إغلاق الوثيقة' : 'Close Dossier'}
          </button>
        </div>
      </div>
    </div>
  );
}
