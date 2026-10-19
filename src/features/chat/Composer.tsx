import {
  Camera,
  Globe,
  Loader2,
  Mic,
  MicOff,
  FileText,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Unlock,
  UploadCloud,
  X,
  Code,
  Film,
  Gamepad2,
  Languages,
  Terminal,
} from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { copy } from '../../core/i18n';
import { processImageFile, formatFileSize, type ProcessedImage } from '../../core/utils/imageUtils';
import { useGeneration } from '../../core/generation';
import { LiveProgressCard } from '../../components/LiveProgressCard';
import { WebImageSearchModal, type WebImageItem } from './WebImageSearchModal';

export interface DialectOption {
  code: string;
  label: string;
  flag: string;
  nativeName: string;
}

export const GLOBAL_DIALECTS: DialectOption[] = [
  { code: 'ar-DZ', label: 'الجزائرية (الدارجة)', flag: '🇩🇿', nativeName: 'Djazairia' },
  { code: 'ar-SA', label: 'العربية الفصحى / السعودية', flag: '🇸🇦', nativeName: 'Fusha / Saudi' },
  { code: 'ar-EG', label: 'اللهجة المصرية', flag: '🇪🇬', nativeName: 'Masriya' },
  { code: 'ar-MA', label: 'المغربية (الدارجة)', flag: '🇲🇦', nativeName: 'Darija Maghribia' },
  { code: 'ar-TN', label: 'اللهجة التونسية', flag: '🇹🇳', nativeName: 'Tounsia' },
  { code: 'ar-SY', label: 'الشامية (سوريا/لبنان)', flag: '🇸🇾', nativeName: 'Shamiya' },
  { code: 'ar-PS', label: 'اللهجة الفلسطينية / الأردنية', flag: '🇵🇸', nativeName: 'Filastiniya / Urduniya' },
  { code: 'ar-IQ', label: 'اللهجة العراقية', flag: '🇮🇶', nativeName: 'Iraqiya' },
  { code: 'ar-SD', label: 'اللهجة السودانية', flag: '🇸🇩', nativeName: 'Sudaniya' },
  { code: 'ar-AE', label: 'اللهجة الإماراتية والخليجية', flag: '🇦🇪', nativeName: 'Emirati / Gulf' },
  { code: 'ar-KW', label: 'اللهجة الكويتية', flag: '🇰🇼', nativeName: 'Kuwaitiya' },
  { code: 'ar-YE', label: 'اللهجة اليمنية', flag: '🇾🇪', nativeName: 'Yamaniya' },
  { code: 'ar-OM', label: 'اللهجة العمانية', flag: '🇴🇲', nativeName: 'Omaniya' },
  { code: 'ar-LY', label: 'اللهجة الليبية', flag: '🇱🇾', nativeName: 'Libiya' },
  { code: 'en-US', label: 'English (United States)', flag: '🇺🇸', nativeName: 'English (US)' },
  { code: 'en-GB', label: 'English (United Kingdom)', flag: '🇬🇧', nativeName: 'English (UK)' },
  { code: 'en-AU', label: 'English (Australia)', flag: '🇦🇺', nativeName: 'English (AU)' },
  { code: 'en-CA', label: 'English (Canada)', flag: '🇨🇦', nativeName: 'English (CA)' },
  { code: 'fr-FR', label: 'Français (France)', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'fr-CA', label: 'Français (Québec / Canada)', flag: '🇨🇦', nativeName: 'Québécois' },
  { code: 'es-ES', label: 'Español (España)', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'es-MX', label: 'Español (México / LatAm)', flag: '🇲🇽', nativeName: 'Latinoamérica' },
  { code: 'de-DE', label: 'Deutsch (Deutschland)', flag: '🇩🇪', nativeName: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano (Italia)', flag: '🇮🇹', nativeName: 'Italiano' },
  { code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷', nativeName: 'Português BR' },
  { code: 'pt-PT', label: 'Português (Portugal)', flag: '🇵🇹', nativeName: 'Português PT' },
  { code: 'tr-TR', label: 'Türkçe (Türkiye)', flag: '🇹🇷', nativeName: 'Türkçe' },
  { code: 'ru-RU', label: 'Русский (Russian)', flag: '🇷🇺', nativeName: 'Русский' },
  { code: 'zh-CN', label: '中文 (Mandarin Simplified)', flag: '🇨🇳', nativeName: '中文 (简体)' },
  { code: 'ja-JP', label: '日本語 (Japanese)', flag: '🇯🇵', nativeName: '日本語' },
  { code: 'ko-KR', label: '한국어 (Korean)', flag: '🇰🇷', nativeName: '한국어' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)', flag: '🇮🇳', nativeName: 'हिन्दी' },
  { code: 'id-ID', label: 'Bahasa Indonesia', flag: '🇮🇩', nativeName: 'Indonesia' },
  { code: 'fa-IR', label: 'فارسی (Persian)', flag: '🇮🇷', nativeName: 'فارسی' },
  { code: 'ur-PK', label: 'اردو (Urdu)', flag: '🇵🇰', nativeName: 'اردو' },
];

export function Composer({
  language,
  busy,
  onSend,
  onStop,
}: {
  language: 'ar' | 'en';
  busy: boolean;
  onSend: (text: string, images?: string[]) => void;
  onStop: () => void;
}) {
  const { isGenerating, cancelGeneration, forceUnlock } = useGeneration();
  const isLocked = busy || isGenerating;
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; name: string; sizeBytes: number; type: string; content: string }[]>([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [isWebImageModalOpen, setIsWebImageModalOpen] = useState(false);
  const isAr = language === 'ar';
  const [voiceDialect, setVoiceDialect] = useState<string>(() => {
    return localStorage.getItem('adam_voice_dialect') || (isAr ? 'ar-DZ' : 'en-US');
  });

  // Audio Recording & Transcription (gemini-3.5-transcribe)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micPermissionNotice, setMicPermissionNotice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const t = copy(language);

  // Auto-expand textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 38), 160);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [draft]);

  // Listen for external image trigger events
  useEffect(() => {
    const handleTrigger = (e: CustomEvent<{ promptPrefix?: string; imageUrls?: string[]; skipFileInput?: boolean }>) => {
      if (e.detail?.promptPrefix) {
        setDraft((prev) => (prev ? `${e.detail.promptPrefix} ${prev}` : e.detail.promptPrefix));
      }
      if (e.detail?.imageUrls && e.detail.imageUrls.length > 0) {
        const newImgs: ProcessedImage[] = e.detail.imageUrls.map((url, idx) => ({
          id: `img-${Date.now()}-${idx}`,
          dataUrl: url,
          name: `screen_capture_${idx + 1}.png`,
          sizeBytes: Math.round(url.length * 0.75),
          mimeType: 'image/png',
        }));
        setImages((prev) => [...prev, ...newImgs]);
      } else if (!e.detail?.skipFileInput) {
        fileInputRef.current?.click();
      }
    };

    window.addEventListener('adam_trigger_image_upload' as any, handleTrigger);
    return () => {
      window.removeEventListener('adam_trigger_image_upload' as any, handleTrigger);
    };
  }, []);

  // Auto-resize textarea height smoothly
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 24), 160)}px`;
    }
  }, [draft]);

  const handleFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    const validImageFiles = fileList.filter((file) =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name)
    );
    const documentFiles = fileList.filter((file) =>
      !file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name)
    );

    if (validImageFiles.length > 0) {
      setProcessingImages(true);
      try {
        const processed = await Promise.all(
          validImageFiles.map((file) => processImageFile(file))
        );
        setImages((prev) => [...prev, ...processed].slice(0, 8));
      } catch (err) {
        console.error('Failed to process image attachment:', err);
      } finally {
        setProcessingImages(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }

    if (documentFiles.length > 0) {
      setProcessingFiles(true);
      try {
        const newDocs = await Promise.all(
          documentFiles.map((file) => {
            return new Promise<{ id: string; name: string; sizeBytes: number; type: string; content: string }>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const textContent = (e.target?.result as string) || '';
                resolve({
                  id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: file.name,
                  sizeBytes: file.size,
                  type: file.type || 'text/plain',
                  content: textContent.slice(0, 50000),
                });
              };
              reader.onerror = () => {
                resolve({
                  id: `doc-${Date.now()}`,
                  name: file.name,
                  sizeBytes: file.size,
                  type: file.type || 'text/plain',
                  content: '[Error reading file]',
                });
              };
              if (file.type.includes('pdf') || file.name.endsWith('.pdf')) {
                reader.readAsDataURL(file);
              } else {
                reader.readAsText(file);
              }
            });
          })
        );
        setAttachedFiles((prev) => [...prev, ...newDocs].slice(0, 6));
      } catch (err) {
        console.error('Failed to process document attachment:', err);
      } finally {
        setProcessingFiles(false);
        if (documentInputRef.current) {
          documentInputRef.current.value = '';
        }
      }
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removeDocument = (id: string) => {
    setAttachedFiles((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToHandle: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile();
      if (file) filesToHandle.push(file);
    }

    if (filesToHandle.length > 0) {
      e.preventDefault();
      handleFiles(filesToHandle);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if ((!text && images.length === 0 && attachedFiles.length === 0) || isLocked) return;

    const filesContext = attachedFiles
      .map(
        (f) =>
          `[Attached Document / File: ${f.name} (${Math.round(f.sizeBytes / 1024)} KB)]\n\`\`\`\n${f.content}\n\`\`\``
      )
      .join('\n\n');

    const defaultPrompt = isAr
      ? 'قم بدراسة وتحليل الملفات والمستندات المرفقة واستخراج كافة التفاصيل والاجابة عن الاسئلة المتعلقة بها بدقة واحترافية.'
      : 'Study and analyze the attached documents/files and provide complete accurate answers.';

    const basePrompt = text || (attachedFiles.length > 0 || images.length > 0 ? defaultPrompt : '');
    const finalPrompt = filesContext ? `${filesContext}\n\n${basePrompt}` : basePrompt;
    const imageUrls = images.map((img) => img.dataUrl);

    onSend(finalPrompt, imageUrls.length > 0 ? imageUrls : undefined);
    setDraft('');
    setImages([]);
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const sendAudioToTranscribeApi = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        if (!base64Data) {
          setIsTranscribing(false);
          return;
        }

        const res = await fetch('/api/audio/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Data,
            mimeType: audioBlob.type || 'audio/webm',
          }),
        });

        const data = await res.json();
        if (data.ok && data.transcript) {
          setDraft((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
        } else {
          console.warn('Transcription returned no text or error:', data);
        }
        setIsTranscribing(false);
      };
    } catch (e) {
      console.error('Audio transcription error:', e);
      setIsTranscribing(false);
    }
  };

  const startAudioRecording = async () => {
    setMicPermissionNotice(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MEDIA_DEVICES_UNAVAILABLE');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      audioChunksRef.current = [];
      let options: MediaRecorderOptions = {};
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
        else if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
        else if (MediaRecorder.isTypeSupported('audio/mp4')) options = { mimeType: 'audio/mp4' };
        else if (MediaRecorder.isTypeSupported('audio/aac')) options = { mimeType: 'audio/aac' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(timerIntervalRef.current);
        setRecordSeconds(0);
        setIsRecordingAudio(false);
        sendAudioToTranscribeApi(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecordingAudio(true);
      setRecordSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone stream error:', err);
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      if (isDenied) {
        setMicPermissionNotice(
          isAr
            ? 'المتصفح حظر إذن الميكروفون. اضغط على رمز القفل 🔒 أعلى شريط العنوان ➔ الأذونات ➔ السماح بالميكروفون (Allow).'
            : 'Microphone permission blocked. Tap lock 🔒 in address bar > Permissions > Allow Microphone.'
        );
      } else {
        fallbackBrowserSpeech();
      }
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleVoiceRecording = () => {
    if (isRecordingAudio) {
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  };

  const fallbackBrowserSpeech = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setDraft((prev) =>
        prev
          ? `${prev} (${isAr ? 'الإملاء الصوتي غير مدعوم في هذا المتصفح' : 'Speech recognition not supported'})`
          : isAr
          ? 'الإملاء الصوتي غير مدعوم في هذا المتصفح'
          : 'Speech recognition not supported'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceDialect || (isAr ? 'ar-DZ' : 'en-US');
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => setListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      sendAudioToTranscribeApi(file);
    }
    if (e.target) e.target.value = '';
  };



  return (
    <div
      className={`composer-wrap relative transition-all duration-200 ${
        isDragging ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-subtle)] rounded-3xl' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Visual Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-[var(--surface)]/95 border-2 border-dashed border-[var(--accent)] backdrop-blur-md pointer-events-none animate-fadeIn">
          <div className="flex flex-col items-center gap-2 text-center text-[var(--accent)] font-medium">
            <UploadCloud size={32} className="animate-bounce" />
            <span className="text-sm font-bold">
              {isAr ? 'أفلت الصورة هنا للفحص الذكي ⚡' : 'Drop image here for analysis ⚡'}
            </span>
          </div>
        </div>
      )}

      {/* Hidden File Input for Image Attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFiles(e.target.files);
          }
        }}
      />

      {/* Hidden File Input for Document / Text / Code / PDF Attachments */}
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.py,.doc,.docx"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFiles(e.target.files);
          }
        }}
      />

      {/* Image Attachments Preview Tray */}
      {images.length > 0 && (
        <div className="mb-2.5 p-2 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex flex-col gap-2 animate-fadeIn shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text)] font-semibold px-1">
            <span className="flex items-center gap-1.5 text-[var(--accent)]">
              <Sparkles size={13} className="animate-pulse" />
              <span>{isAr ? 'صور مرفقة جاهزة للإدراك البصري' : 'Attached images ready for Vision analysis'}</span>
            </span>
            <button
              type="button"
              onClick={() => setImages([])}
              className="text-[var(--muted)] hover:text-rose-400 text-[11px] transition cursor-pointer"
            >
              {isAr ? 'حذف الكل' : 'Clear'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative flex items-center gap-2 p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-sm max-w-xs"
              >
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="w-10 h-10 object-cover rounded-lg border border-[var(--border)]"
                />
                <div className="flex flex-col min-w-0 pr-1 text-[11px]">
                  <span className="truncate max-w-[110px] text-[var(--text)] font-medium">{img.name}</span>
                  <span className="text-[10px] text-[var(--muted)]">{formatFileSize(img.sizeBytes)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="p-1 rounded-full bg-[var(--surface-2)] text-[var(--muted)] hover:text-rose-400 transition cursor-pointer"
                  title={isAr ? 'إزالة' : 'Remove'}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Attachments Preview Tray */}
      {attachedFiles.length > 0 && (
        <div className="mb-2.5 p-2.5 rounded-2xl bg-[var(--surface-2)] border border-cyan-500/30 flex flex-col gap-2 animate-fadeIn shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text)] font-semibold px-1">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <FileText size={13} className="animate-pulse" />
              <span>{isAr ? 'مستندات وملفات مرفقة للدراسة والتحليل' : 'Attached documents ready for study & analysis'}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachedFiles([])}
              className="text-[var(--muted)] hover:text-rose-400 text-[11px] transition cursor-pointer"
            >
              {isAr ? 'حذف الكل' : 'Clear'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {attachedFiles.map((doc) => (
              <div
                key={doc.id}
                className="group relative flex items-center gap-2.5 p-2 rounded-xl bg-[var(--surface)] border border-cyan-500/30 shadow-sm max-w-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                  <FileText size={16} />
                </div>
                <div className="flex flex-col min-w-0 pr-1 text-[11px]">
                  <span className="truncate max-w-[130px] text-[var(--text)] font-bold">{doc.name}</span>
                  <span className="text-[10px] text-[var(--muted)]">{formatFileSize(doc.sizeBytes)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  className="p-1 rounded-full bg-[var(--surface-2)] text-[var(--muted)] hover:text-rose-400 transition cursor-pointer"
                  title={isAr ? 'إزالة' : 'Remove'}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audio Recording / Transcription Status Pill (gemini-3.5-transcribe) */}
      {(isRecordingAudio || isTranscribing) && (
        <div className="flex items-center justify-between mb-2 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-lg text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            {isRecordingAudio ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <span className="font-bold text-rose-400">
                  {isAr ? `جاري التسجيل الصوتي (${recordSeconds}s)` : `Recording audio (${recordSeconds}s)`}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isAr ? '• اضغط على الميكروفون للإنهاء والتفريغ' : '• Click mic to stop & transcribe'}
                </span>
              </>
            ) : (
              <>
                <Loader2 size={13} className="animate-spin text-cyan-400" />
                <span className="font-bold text-cyan-300">
                  {isAr ? 'جاري التفريغ الصوتي الذكي...' : 'Transcribing audio...'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  gemini-3.5-transcribe
                </span>
              </>
            )}
          </div>
          {isRecordingAudio && (
            <button
              type="button"
              onClick={stopAudioRecording}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 transition cursor-pointer"
            >
              {isAr ? 'إنهاء وتفريغ' : 'Stop & Done'}
            </button>
          )}
        </div>
      )}

      {/* Microphone Blocked Helper Notice */}
      {micPermissionNotice && (
        <div className="mb-2 p-2.5 sm:p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between gap-2.5 text-xs text-amber-200 animate-fadeIn shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <Mic size={15} className="text-amber-400 shrink-0" />
            <span className="text-[11px] leading-relaxed truncate-2-lines">{micPermissionNotice}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={startAudioRecording}
              className="px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] transition cursor-pointer"
            >
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => setMicPermissionNotice(null)}
              className="p-1 rounded-lg text-amber-300/70 hover:text-amber-200 transition cursor-pointer"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Live Progress Indicator & Cancel Action */}
      <LiveProgressCard
        language={language}
        onCancel={() => {
          if (isGenerating) cancelGeneration(isAr ? 'تم إلغاء التوليد بواسطة المستخدم' : 'Cancelled by user');
          onStop();
          forceUnlock();
        }}
        className="mb-2"
      />

      {/* Emergency Unlock Banner when locked */}
      {isLocked && (
        <div className="flex items-center justify-between gap-2 mb-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs text-amber-200 animate-fadeIn">
          <div className="flex items-center gap-1.5 min-w-0">
            <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
            <span className="truncate">
              {isAr ? 'الواجهة مشغولة بتنفيذ طلبك… يمكنك فك القفل في أي لحظة:' : 'Processing request… You can unlock anytime:'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isGenerating) {
                cancelGeneration(isAr ? 'تم فك القفل اضطرارياً بواسطة المستخدم' : 'Force unlocked by user');
              }
              onStop();
              forceUnlock();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shadow-sm transition cursor-pointer shrink-0 active:scale-95"
            title={isAr ? 'فك قفل الواجهة فوراً واستعادة حرية الإدخال' : 'Unlock interface immediately'}
          >
            <Unlock size={12} />
            <span>{isAr ? 'فك القفل فوراً' : 'Unlock Now'}</span>
          </button>
        </div>
      )}

      {/* Quick Action Tools Strip (All-in-One Chat Execution) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none select-none w-full">
        {[
          {
            icon: Film,
            labelAr: 'وسائط 8K وفيديو',
            labelEn: '8K Media & Veo',
            color: 'text-amber-400',
            promptAr: 'أنشئ صورة فائقة الدقة 8K لمشهد سينمائي واقعي مذهل: ',
            promptEn: 'Generate an 8K photorealistic cinematic visual with volumetric lighting: ',
          },
          {
            icon: Code,
            labelAr: 'تطبيق ساندبوكس',
            labelEn: 'Sandbox App',
            color: 'text-emerald-400',
            promptAr: 'برمج لي تطبيق ويب تفاعلي كامل بنسبة 100% مع واجهة متطورة: ',
            promptEn: 'Build a complete interactive web application with real state and clean UI: ',
          },
          {
            icon: Languages,
            labelAr: 'ترجمة فورية',
            labelEn: 'Neural Translate',
            color: 'text-purple-400',
            promptAr: 'ترجم النص التالي بدقة فائقة مع مراعاة المعنى والسياق: ',
            promptEn: 'Translate the following text accurately preserving context and tone: ',
          },
          {
            icon: Gamepad2,
            labelAr: 'لعبة 3D تفاعلية',
            labelEn: '3D WebGL Game',
            color: 'text-rose-400',
            promptAr: 'برمج لي لعبة ثلاثية الأبعاد 3D تفاعلية وممتعة قابلة للعب فوراً: ',
            promptEn: 'Create a complete playable 3D WebGL game with physics and sound FX: ',
          },
          {
            icon: Terminal,
            labelAr: 'أمر طرفية ونظام',
            labelEn: 'Terminal / Linux',
            color: 'text-cyan-400',
            promptAr: 'نفذ أمر الطرفية التالي وتحقق من المخرجات: ',
            promptEn: 'Execute the following system terminal command and verify output: ',
          },
          {
            icon: Globe,
            labelAr: 'بحث حي ومصادر',
            labelEn: 'Live Search',
            color: 'text-blue-400',
            promptAr: 'ابحث في الإنترنت عن آخر المعلومات المحدثة اليوم مع المصادر: ',
            promptEn: 'Search the live web for verified up-to-date sources on: ',
          },
        ].map((tool, idx) => {
          const Icon = tool.icon;
          return (
            <button
              key={idx}
              type="button"
              disabled={isLocked}
              onClick={() => {
                const prefix = isAr ? tool.promptAr : tool.promptEn;
                setDraft((prev) => (prev ? `${prev} ${prefix}` : prefix));
                if (textareaRef.current) {
                  textareaRef.current.focus();
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--surface-2)]/80 hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-[var(--accent)]/40 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-all cursor-pointer shrink-0 shadow-2xs active:scale-95 disabled:opacity-50"
            >
              <Icon size={12} className={tool.color} />
              <span className="whitespace-nowrap">{isAr ? tool.labelAr : tool.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Main Luxury Streamlined Composer Box */}
      <div className={`composer flex items-end gap-1.5 p-1.5 sm:p-2 rounded-2xl sm:rounded-3xl bg-[var(--surface)]/95 border border-[var(--border-strong)] shadow-xl backdrop-blur-2xl transition-all duration-300 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_24px_var(--accent-glow)] w-full ${isLocked ? 'ring-1 ring-amber-500/30' : ''}`}>
        {/* Attach Document / File Button */}
        <button
          type="button"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 touch-manipulation ${
            isLocked ? 'opacity-40 cursor-not-allowed' : attachedFiles.length > 0
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : 'text-[var(--muted)] hover:text-cyan-400 hover:bg-[var(--surface-2)]'
          }`}
          onClick={() => documentInputRef.current?.click()}
          aria-label={isAr ? 'إرفاق ملف أو مستند' : 'Attach Document'}
          title={isAr ? 'إرفاق ملف، مستند، كود أو PDF' : 'Attach document, code or PDF'}
          disabled={isLocked || processingFiles}
        >
          {processingFiles ? (
            <Loader2 size={16} className="animate-spin text-cyan-400" />
          ) : (
            <Paperclip size={16} />
          )}
        </button>

        {/* Attach Image Button */}
        <button
          type="button"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 touch-manipulation ${
            isLocked ? 'opacity-40 cursor-not-allowed' : images.length > 0
              ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/40 shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
          }`}
          onClick={() => fileInputRef.current?.click()}
          aria-label={isAr ? 'إرفاق صورة' : 'Attach Image'}
          title={isAr ? 'إرفاق صورة للتحليل البصري' : 'Attach image'}
          disabled={isLocked || processingImages}
        >
          {processingImages ? (
            <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
          ) : (
            <Camera size={16} />
          )}
        </button>

        {/* Fetch Web Image from Internet Button */}
        <button
          type="button"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 touch-manipulation ${
            isLocked
              ? 'opacity-40 cursor-not-allowed'
              : 'text-[var(--muted)] hover:text-blue-400 hover:bg-[var(--surface-2)]'
          }`}
          onClick={() => setIsWebImageModalOpen(true)}
          aria-label={isAr ? 'جلب صور من الإنترنت' : 'Fetch Web Images'}
          title={isAr ? 'جلب صور حقيقية من الإنترنت (Wikimedia & Web)' : 'Fetch real web images'}
          disabled={isLocked}
        >
          <Globe size={16} />
        </button>



        {/* Flexible Text Input */}
        <div className="flex-1 min-w-0 w-full flex items-center py-0.5">
          <textarea
            ref={textareaRef}
            dir={isAr ? 'rtl' : 'ltr'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isLocked) {
                  return;
                }
                submit();
              }
            }}
            placeholder={
              isLocked
                ? isAr
                  ? 'اكتب رسالتك التالية هنا… (أو اضغط فك القفل للبدء فوراً)'
                  : 'Type your next prompt here… (or tap Unlock to start immediately)'
                : listening
                ? isAr
                  ? 'جاري الاستماع بدقة...'
                  : 'Listening...'
                : images.length > 0 || attachedFiles.length > 0
                ? isAr
                  ? 'اكتب سؤالك أو تعليماتك حول الملفات المرفقة...'
                  : 'Ask about the attached files...'
                : isAr
                ? 'اكتب رسالتك أو اسأل عن أي موضوع...'
                : 'Type your message or ask anything...'
            }
            rows={1}
            disabled={isLocked}
            readOnly={isLocked}
            className={`w-full bg-transparent border-0 outline-none text-[15px] text-[var(--text)] placeholder-[var(--muted)] resize-none py-1.5 px-2 min-h-[38px] max-h-[160px] font-normal leading-relaxed overflow-y-auto block ${
              isLocked ? 'cursor-not-allowed opacity-60' : ''
            }`}
          />
        </div>

        {/* Voice Input Microphone */}
        <button
          type="button"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 touch-manipulation ${
            isLocked
              ? 'opacity-40 cursor-not-allowed text-[var(--muted)]'
              : isRecordingAudio
              ? 'bg-rose-500/20 text-rose-400 animate-pulse border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
              : listening
              ? 'bg-amber-500/20 text-amber-400 animate-pulse border border-amber-500/40'
              : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
          }`}
          onClick={toggleVoiceRecording}
          aria-label={isAr ? 'تسجيل صوتي' : 'Voice Input'}
          title={
            isRecordingAudio
              ? isAr
                ? `إيقاف التسجيل (${recordSeconds}s)`
                : `Stop recording (${recordSeconds}s)`
              : isAr
              ? 'تسجيل وتفريغ صوتي فوري'
              : 'Voice Recording & Transcription'
          }
          disabled={isLocked}
        >
          {isRecordingAudio ? (
            <MicOff size={16} className="text-rose-400" />
          ) : (
            <Mic size={16} />
          )}
        </button>

        {/* Send / Stop Action Button */}
        <button
          type="button"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md touch-manipulation ${
            isLocked
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50 active:scale-95 animate-pulse'
              : draft.trim() || images.length > 0 || attachedFiles.length > 0
              ? 'bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast)] shadow-[0_0_18px_var(--accent-glow)] active:scale-95'
              : 'bg-[var(--surface-2)] text-[var(--muted)] opacity-50 cursor-not-allowed'
          }`}
          onClick={() => {
            if (isLocked) {
              if (isGenerating) {
                cancelGeneration(isAr ? 'تم إلغاء التوليد بواسطة المستخدم' : 'Cancelled by user');
              }
              onStop();
              forceUnlock();
            } else {
              submit();
            }
          }}
          aria-label={isLocked ? (isAr ? 'إلغاء وفك القفل فوراً' : 'Cancel and unlock immediately') : t.send}
          title={isLocked ? (isAr ? 'إلغاء العملية وتحرير الإدخال فوراً' : 'Cancel operation & unlock input immediately') : (draft.trim() ? t.send : '')}
          disabled={!isLocked && !draft.trim() && images.length === 0 && attachedFiles.length === 0}
        >
          {isLocked ? <Square size={13} fill="currentColor" /> : <Send size={15} />}
        </button>
      </div>

      {/* Minimalist Footnote */}
      <div className="flex items-center justify-center mt-1 text-[10px] text-[var(--muted)] select-none">
        <span>{isAr ? 'ADEM AI • هندسة وبرمجة: adem feidat' : 'ADEM AI • Engineered by: adem feidat'}</span>
      </div>

      {/* Real Internet Image Search Modal */}
      <WebImageSearchModal
        isOpen={isWebImageModalOpen}
        onClose={() => setIsWebImageModalOpen(false)}
        language={language}
        onSelectImage={(img, mode) => {
          if (mode === 'insert_markdown') {
            setDraft((prev) =>
              prev ? `${prev.trim()}\n\n![${img.title}](${img.url})\n` : `![${img.title}](${img.url})\n`
            );
          } else {
            onSend(
              isAr
                ? `إليك صورة حية تم جلبها من الإنترنت:\n![${img.title}](${img.url})\n\nأريدك أن تفحصها وتشرح محتواها وأهم تفاصيلها التقنية بالتفصيل.`
                : `Here is a real image retrieved from the web:\n![${img.title}](${img.url})\n\nPlease inspect it and analyze its key technical details in depth.`
            );
          }
        }}
      />
    </div>
  );
}
