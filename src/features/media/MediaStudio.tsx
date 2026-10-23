import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Film,
  Image as ImageIcon,
  Wand2,
  Download,
  Copy,
  Trash2,
  RefreshCw,
  Play,
  Pause,
  Maximize2,
  Check,
  Zap,
  Sliders,
  Layers,
  Camera,
  Share2,
  Code2,
  Cpu,
  Palette,
  Sun,
  Moon,
  X,
  FileCode,
  ZoomIn,
  Video,
  Eye,
  Settings,
  Scissors,
  Flame,
  ArrowRight,
  MonitorPlay,
  Sparkle,
  ScanEye,
  Split,
  Brush,
  Focus,
  SlidersHorizontal,
  UserCheck,
  Grid3X3,
  ShieldCheck,
} from 'lucide-react';
import type { Language, ViewId } from '../../core/domain';
import { useGeneration } from '../../core/generation';
import { LiveProgressCard } from '../../components/LiveProgressCard';

export type StudioTab = 'image' | 'video' | 'vector' | 'gallery';
export type AspectRatio = '16:9' | '1:1' | '9:16' | '4:3' | '21:9' | '1:4' | '1:8' | '4:1' | '8:1';

export type ImageStyle =
  | 'photorealistic'
  | 'cinematic'
  | 'anime'
  | 'cyberpunk'
  | 'unreal5'
  | 'oil_painting'
  | 'product_studio'
  | 'fantasy'
  | 'minimalist'
  | 'concept_art';

export type MediaEngineChoice =
  | 'auto'
  | 'gemini-nano-banana'
  | 'gemini-image'
  | 'imagen-3'
  | 'flux-pro'
  | 'midjourney'
  | 'flux-turbo';

export type VideoMotion =
  | 'drone_fpv'
  | 'orbit_360'
  | 'dolly_zoom'
  | 'slow_motion'
  | 'pan_horizontal'
  | 'hyperlapse'
  | 'cinematic_steady';

export type FocalLength = 'none' | '14mm' | '35mm' | '50mm' | '85mm' | '200mm';
export type Aperture = 'none' | 'f1.2' | 'f1.8' | 'f2.8' | 'f8' | 'f16';
export type LightingSetup = 'none' | 'golden_hour' | 'studio_softbox' | 'cyber_neon' | 'dramatic_rim' | 'volumetric_rays' | 'cinematic_natural';
export type FilmStock = 'none' | 'kodak_portra' | 'fuji_velvia' | 'ilford_bw' | 'cinestill_800t' | 'digital_8k';
export type ImageQuality = '1K' | '2K' | '4K';

export interface VisualAuditResult {
  palette: Array<{ hex: string; name: string }>;
  compositionScore: number;
  lightingScore: number;
  promptFidelityScore: number;
  critiqueAr: string;
  critiqueEn: string;
  improvedPromptEn: string;
  technicalDetails: string;
}

export interface SemanticAnalysis {
  subject: string;
  environment: string;
  lighting: string;
  camera: string;
  motion?: string;
  mood: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'vector';
  operationName?: string;
  generationStatus?: 'processing' | 'completed' | 'failed';
  engine?: string;
  title: string;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  semanticAnalysis?: SemanticAnalysis;
  explanationAr?: string;
  url: string;
  posterUrl?: string;
  svgCode?: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  style: string;
  quality?: ImageQuality;
  motion?: VideoMotion;
  duration?: number;
  fps?: number;
  seed: number;
  createdAt: number;
}

interface MediaStudioProps {
  language: Language;
  onNavigate?: (view: ViewId) => void;
  onRunPromptInChat?: (prompt: string) => void;
}

const ENGINE_CHOICES: Array<{
  id: MediaEngineChoice;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  icon: string;
  badge: string;
}> = [
  {
    id: 'auto',
    nameAr: 'الموجه الذكي التلقائي',
    nameEn: 'Smart Neural Router',
    descAr: 'يختار المحرك الأنسب تلقائياً بناءً على نمط الطلب ومستوى الواقعية',
    descEn: 'Intelligently routes to optimal engine based on prompt aesthetic',
    icon: '⚡',
    badge: 'OPTIMAL',
  },
  {
    id: 'gemini-nano-banana',
    nameAr: 'Google Nano Banana 2.1 (4K)',
    nameEn: 'Google Nano Banana 2.1 (4K)',
    descAr: 'محرك قوقل الخارق للتوليد بدقة 4K فائقة الوضوح وأبعاد واسعة',
    descEn: 'Flagship Google generative vision with configurable 1K/2K/4K resolution',
    icon: '🍌',
    badge: 'FLAGSHIP 4K',
  },
  {
    id: 'imagen-3',
    nameAr: 'Google Imagen 3 (Studio 8K)',
    nameEn: 'Google Imagen 3 (Studio 8K)',
    descAr: 'أعلى دقة واقعية فوتوغرافية ومحاكاة الاستوديو من قوقل ديب مايند',
    descEn: 'DeepMind studio realism, authentic textures & lighting physics',
    icon: '💎',
    badge: 'STUDIO 8K',
  },
  {
    id: 'gemini-image',
    nameAr: 'Google Gemini 3.1 Flash Lite',
    nameEn: 'Google Gemini 3.1 Flash Lite',
    descAr: 'محرك قوقل الرسمي فائق السرعة لتوليد وتعديل الصور بدقة أصلية',
    descEn: 'Official native Google vision pipeline with editing capability',
    icon: '✨',
    badge: 'OFFICIAL GOOGLE',
  },
  {
    id: 'flux-pro',
    nameAr: 'FLUX.1 Pro Ultra-Precision',
    nameEn: 'FLUX.1 Pro Ultra-Precision',
    descAr: 'إضاءة حجمية ملحمية وتفاصيل مادية مجهرية عبر أحدث شبكات الانتشار',
    descEn: 'Breathtaking volumetric depth, skin textures & epic composition',
    icon: '🔥',
    badge: 'FLUX PRO',
  },
  {
    id: 'midjourney',
    nameAr: 'Midjourney v6 Cinema Style',
    nameEn: 'Midjourney v6 Cinema Style',
    descAr: 'إخراج سينمائي بلوني أفلام 70mm وعدسات أنامورفيك وعزل بصري ناعم',
    descEn: '70mm anamorphic bokeh, film stock color grading & artistic depth',
    icon: '🎬',
    badge: 'CINEMA',
  },
  {
    id: 'flux-turbo',
    nameAr: 'FLUX Turbo الخاطف',
    nameEn: 'FLUX Turbo Ultra-Fast',
    descAr: 'توليد فوري فائق السرعة خلال ثانية واحدة للعصف الذهني',
    descEn: 'Instant sub-second generation for real-time creative flow',
    icon: '⚡',
    badge: '< 1s SPEED',
  },
];

const STYLE_OPTIONS: Array<{ id: ImageStyle; nameAr: string; nameEn: string; icon: string }> = [
  { id: 'cinematic', nameAr: 'سينمائي IMAX 70mm', nameEn: 'Cinematic IMAX', icon: '🎬' },
  { id: 'photorealistic', nameAr: 'واقعية فوتوغرافية 8K', nameEn: 'Photorealistic 8K', icon: '📸' },
  { id: 'unreal5', nameAr: 'ثلاثي الأبعاد Unreal 5.4', nameEn: '3D Unreal Engine 5', icon: '💎' },
  { id: 'anime', nameAr: 'أنمي فاخر Ghibli/Shinkai', nameEn: 'Anime Visual Art', icon: '🎌' },
  { id: 'cyberpunk', nameAr: 'سايبربانك نيون مستقبلي', nameEn: 'Cyberpunk Neon', icon: '⚡' },
  { id: 'product_studio', nameAr: 'استوديو إعلاني تجاري', nameEn: 'Commercial Studio', icon: '🏛️' },
  { id: 'oil_painting', nameAr: 'لوحة زيتية كلاسيكية', nameEn: 'Oil Painting', icon: '🎨' },
  { id: 'fantasy', nameAr: 'عوالم وأساطير فانتزي', nameEn: 'Mythic Fantasy', icon: '🌌' },
  { id: 'concept_art', nameAr: 'رسم تخطيطي فني ArtStation', nameEn: 'Concept Art', icon: '🖌️' },
  { id: 'minimalist', nameAr: 'مينيمالي حديث نقي', nameEn: 'Minimalist Clean', icon: '📐' },
];

const ASPECT_OPTIONS: Array<{ id: AspectRatio; nameAr: string; nameEn: string; ratio: string }> = [
  { id: '16:9', nameAr: 'شاشة عريضة', nameEn: 'Landscape', ratio: '16:9' },
  { id: '1:1', nameAr: 'مربع', nameEn: 'Square', ratio: '1:1' },
  { id: '9:16', nameAr: 'طولي (ريلز / هاتف)', nameEn: 'Portrait / Reels', ratio: '9:16' },
  { id: '4:3', nameAr: 'شاشة كلاسيكية', nameEn: 'Standard', ratio: '4:3' },
  { id: '21:9', nameAr: 'ألترا وايد سينمائي', nameEn: 'Cinemascope', ratio: '21:9' },
  { id: '1:4', nameAr: 'طولي بانورامي 1:4', nameEn: 'Ultra Tall 1:4', ratio: '1:4' },
  { id: '4:1', nameAr: 'عريض بانورامي 4:1', nameEn: 'Ultra Wide 4:1', ratio: '4:1' },
];

const FOCAL_LENGTH_OPTIONS: Array<{ id: FocalLength; nameAr: string; nameEn: string; icon: string }> = [
  { id: 'none', nameAr: 'تلقائي', nameEn: 'Auto', icon: '🎯' },
  { id: '14mm', nameAr: '14mm زاوية فائقة الاتساع', nameEn: '14mm Ultra-Wide', icon: '📐' },
  { id: '35mm', nameAr: '35mm وثائقي وشارع', nameEn: '35mm Documentary', icon: '🏙️' },
  { id: '50mm', nameAr: '50mm عين طبيعية', nameEn: '50mm Standard', icon: '👁️' },
  { id: '85mm', nameAr: '85mm بورتريه مع عزل بوكيه', nameEn: '85mm Portrait Bokeh', icon: '🎭' },
  { id: '200mm', nameAr: '200mm تيليفوتو ماكرو', nameEn: '200mm Telephoto Macro', icon: '🔭' },
];

const APERTURE_OPTIONS: Array<{ id: Aperture; nameAr: string; nameEn: string }> = [
  { id: 'none', nameAr: 'تلقائي', nameEn: 'Auto' },
  { id: 'f1.2', nameAr: 'f/1.2 عزل دائري حالم (Creamy Bokeh)', nameEn: 'f/1.2 Creamy Bokeh' },
  { id: 'f1.8', nameAr: 'f/1.8 عزل سينمائي ناعم', nameEn: 'f/1.8 Cinematic Bokeh' },
  { id: 'f2.8', nameAr: 'f/2.8 حدة استوديو تجاري', nameEn: 'f/2.8 Commercial Sharp' },
  { id: 'f8', nameAr: 'f/8 حدة كاملة للأفق', nameEn: 'f/8 Deep Landscape' },
  { id: 'f16', nameAr: 'f/16 حدة معمارية شاملة', nameEn: 'f/16 Infinite Depth' },
];

const LIGHTING_OPTIONS: Array<{ id: LightingSetup; nameAr: string; nameEn: string }> = [
  { id: 'none', nameAr: 'تلقائي', nameEn: 'Auto' },
  { id: 'golden_hour', nameAr: 'الساعة الذهبية ودفء الغروب', nameEn: 'Golden Hour Sunset' },
  { id: 'studio_softbox', nameAr: 'استوديو سوفت بوكس احترافي (3 نقاط)', nameEn: '3-Point Studio Softbox' },
  { id: 'cyber_neon', nameAr: 'نيون سايبربانك ثنائي اللون مع بلل', nameEn: 'Dual Cyber Neon Glow' },
  { id: 'dramatic_rim', nameAr: 'إضاءة حواف درامية (Rim Light Noir)', nameEn: 'Dramatic Chiaroscuro Rim' },
  { id: 'volumetric_rays', nameAr: 'أشعة ضوئية حجمية (God-Rays)', nameEn: 'Volumetric Sun Rays' },
  { id: 'cinematic_natural', nameAr: 'ضوء طبيعي ناعم (Overcast Diffused)', nameEn: 'Diffused Overcast Sky' },
];

const FILM_STOCK_OPTIONS: Array<{ id: FilmStock; nameAr: string; nameEn: string }> = [
  { id: 'none', nameAr: 'تلقائي', nameEn: 'Auto' },
  { id: 'kodak_portra', nameAr: 'Kodak Portra 400 (دفء البشرة وحبيبات ناعمة)', nameEn: 'Kodak Portra 400' },
  { id: 'fuji_velvia', nameAr: 'Fujifilm Velvia 50 (تشبع ألوان حيوي عالي)', nameEn: 'Fujifilm Velvia 50' },
  { id: 'ilford_bw', nameAr: 'Ilford HP5 (أبيض وأسود تباين سينمائي)', nameEn: 'Ilford HP5 B&W' },
  { id: 'cinestill_800t', nameAr: 'CineStill 800T (هالة ضوئية ليلية دافئة)', nameEn: 'CineStill 800T Film' },
  { id: 'digital_8k', nameAr: 'Hasselblad 100MP 8K Digital Sensor', nameEn: '8K Digital Hasselblad' },
];

const QUALITY_OPTIONS: Array<{ id: ImageQuality; nameAr: string; nameEn: string; desc: string }> = [
  { id: '1K', nameAr: '1K معيار قياسي', nameEn: '1K Standard', desc: '1024x1024 · فائق السرعة ومثالي للعصف الذهني' },
  { id: '2K', nameAr: '2K عالي الدقة HD', nameEn: '2K High-Def', desc: '2048x2048 · توازن رائع بين السرعة والتفاصيل' },
  { id: '4K', nameAr: '4K فائق الدقة Ultra-HD', nameEn: '4K Master Studio', desc: '3840x2160 · أعلى دقة استوديو تجارية' },
];

const QUICK_NEGATIVE_PRESETS = [
  { id: 'no_blur', labelAr: 'مكافحة الضبابية', labelEn: 'Anti-Blur', text: 'blurry, out of focus, motion blur, soft focus' },
  { id: 'no_anatomy', labelAr: 'إصلاح الأطراف والأصابع', labelEn: 'Perfect Anatomy', text: 'bad anatomy, deformed limbs, extra fingers, mutated hands, missing fingers' },
  { id: 'no_watermark', labelAr: 'إزالة النصوص والشعارات', labelEn: 'No Watermark/Text', text: 'watermark, text, signature, stamp, username, border' },
  { id: 'photoreal_skin', labelAr: 'بشرة طبيعية غير بلاستيكية', labelEn: 'Natural Skin Texture', text: 'plastic skin, airbrushed, cartoonish skin, artificial face' },
  { id: 'high_contrast', labelAr: 'منع بهتان الألوان', labelEn: 'Anti-Washed Colors', text: 'washed out, low contrast, oversaturated, muddy shadows' },
];

const MOTION_OPTIONS: Array<{ id: VideoMotion; nameAr: string; nameEn: string }> = [
  { id: 'drone_fpv', nameAr: 'درون سينمائي سريع FPV', nameEn: 'FPV Drone Flythrough' },
  { id: 'orbit_360', nameAr: 'دوران 360° حول الهدف', nameEn: '360° Orbital Camera' },
  { id: 'dolly_zoom', nameAr: 'تقريب دولي زووم (Dolly Zoom)', nameEn: 'Vertigo Dolly Zoom' },
  { id: 'slow_motion', nameAr: 'تصوير بطيء فائق النعومة 120fps', nameEn: 'Ultra Slow Motion' },
  { id: 'cinematic_steady', nameAr: 'كاميرا سينمائية مثبتة SteadyCam', nameEn: 'SteadyCam Motion' },
  { id: 'pan_horizontal', nameAr: 'تتبع أفقي بانورامي هادئ', nameEn: 'Panoramic Tracking Pan' },
  { id: 'hyperlapse', nameAr: 'هايبر لابس متسارع ديناميكي', nameEn: 'Dynamic Hyperlapse' },
];

const PROMPT_INSPIRATIONS_IMAGE = [
  { ar: 'صقر عربي ذهبي ملكي يحلق فوق رمال صحراء العلا عند الغروب مع إضاءة دافئة', en: 'Royal golden Arabian falcon soaring over Al-Ula sandstone dunes at sunset' },
  { ar: 'سيارة خارقة ديناميكية تسير في شوارع طوكيو ليلاً تحت المطر مع انعكاسات النيون', en: 'Futuristic hypercar racing through Tokyo neon streets in rain reflections' },
  { ar: 'بورتريه فوتوغرافي فائق الدقة 8K لمحارب قديم بعيون ثاقبة وإضاءة درامية جانبية', en: 'Cinematic 8K portrait of ancient warrior with piercing eyes and dramatic rim lighting' },
  { ar: 'واحة مائية خيالية في كوكب كريستالي مع شلالات متوهجة باللون البنفسجي والزمردي', en: 'Ethereal alien oasis on a crystal planet with bioluminescent waterfalls' },
];

const PROMPT_INSPIRATIONS_VIDEO = [
  { ar: 'لقطة درون سينمائية FPV تندفع بسرعة وسلاسة عبر ناطحات سحاب مدينة نيوم الذكية ليلاً', en: 'Cinematic FPV drone sweeping through futuristic NEOM skyscraper canyons at night' },
  { ar: 'دوران سينمائي 360 درجة حول يخت فاخر يبحر في مياه البحر الأحمر الفيروزية النقية', en: '360 degree orbital camera around luxury yacht cutting through turquoise Red Sea waters' },
  { ar: 'تصوير بطيء فائق لقطرات مطر تسقط على بتلات زهرة لوتس متوهجة في ضوء الفجر', en: 'Ultra slow-motion water droplets splashing on glowing lotus petal at dawn' },
  { ar: 'تقريب دولي سينمائي درامي على رائد فضاء يستكشف آثاراً حجرية عملاقة على كوكب المريخ', en: 'Cinematic vertigo dolly zoom on astronaut discovering colossal ancient ruins on Mars' },
];

const PROMPT_INSPIRATIONS_VECTOR = [
  { ar: 'شعار تقني تجريدي لشركة ذكاء اصطناعي بتدرج نيون سيان وبنفسجي وخطوط هندسية حادة', en: 'Minimalist geometric cybernetic AI logo with neon cyan and purple gradient' },
  { ar: 'تميمة صقر عربي ملكي بأسلوب فيكتور عصري وخطوط هندسية متناسقة قابلة للتحجيم', en: 'Modern vector mascot emblem of a royal golden falcon with sleek geometric curves' },
  { ar: 'أيقونة مكوك فضاء مستقبلي ينطلق نحو مجرة دائرية بألوان متوهجة وخلفية نقية', en: 'Futuristic space shuttle launching towards a spiral galaxy flat vector badge' },
  { ar: 'رسم بياني شبكي للبنية السحابية الرقمية مع عقد متصلة ومسارات بيانات متوهجة', en: 'Cloud computing network architecture infographic with glowing nodes and data flows' },
];

const QUICK_OPTICAL_MODIFIERS = [
  { labelAr: 'إضاءة سينمائية', labelEn: 'Cinematic Light', text: 'volumetric dramatic rim lighting, soft shadow depth' },
  { labelAr: 'الساعة الذهبية', labelEn: 'Golden Hour', text: 'warm golden hour sunset glow, amber rays, atmospheric haze' },
  { labelAr: 'عدسة 85mm بورتري', labelEn: '85mm Prime', text: 'shot on 85mm f/1.8 lens, creamy optical bokeh depth of field' },
  { labelAr: 'نيون سايبربانك', labelEn: 'Cyber Neon', text: 'vibrant dual-tone cyan and magenta neon glow, wet reflections' },
  { labelAr: 'استوديو سوفت بوكس', labelEn: 'Studio Softbox', text: 'commercial product photography, large softbox key lighting, crisp reflections' },
  { labelAr: 'ريندر Unreal 5.4', labelEn: 'Unreal Engine 5', text: '3D CGI render, Unreal Engine 5.4, ray-traced global illumination, 8k textures' },
];

export function MediaStudio({ language, onNavigate, onRunPromptInChat }: MediaStudioProps) {
  const isAr = language === 'ar';
  const {
    isGenerating: globalIsGenerating,
    startGeneration,
    updateStage,
    finishGeneration,
    cancelGeneration,
  } = useGeneration();
  const abortRef = useRef<AbortController | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>('image');
  const [selectedEngine, setSelectedEngine] = useState<MediaEngineChoice>('auto');
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<ImageStyle>('cinematic');
  const [selectedAspect, setSelectedAspect] = useState<AspectRatio>('16:9');
  const [selectedMotion, setSelectedMotion] = useState<VideoMotion>('drone_fpv');
  const [customSeed, setCustomSeed] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Pro Optical Physics Studio State
  const [selectedFocalLength, setSelectedFocalLength] = useState<FocalLength>('none');
  const [selectedAperture, setSelectedAperture] = useState<Aperture>('none');
  const [selectedLighting, setSelectedLighting] = useState<LightingSetup>('none');
  const [selectedFilmStock, setSelectedFilmStock] = useState<FilmStock>('none');
  const [showOpticalStudio, setShowOpticalStudio] = useState(false);

  // Resolution & Quality State
  const [selectedQuality, setSelectedQuality] = useState<ImageQuality>('1K');

  // Negative Prompting & Presets
  const [customNegativePrompt, setCustomNegativePrompt] = useState('');
  const [activeNegativeTags, setActiveNegativeTags] = useState<string[]>(['no_blur', 'no_anatomy']);
  const [showNegativeStudio, setShowNegativeStudio] = useState(false);

  // Character Consistency Anchor / Identity Lock
  const [characterLockEnabled, setCharacterLockEnabled] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [characterTraits, setCharacterTraits] = useState('');
  const [showCharacterLock, setShowCharacterLock] = useState(false);

  // Batch Generation State
  const [batchCount, setBatchCount] = useState<1 | 2 | 4>(1);
  const [variationResults, setVariationResults] = useState<MediaItem[]>([]);

  // AI Visual Audit State
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<VisualAuditResult | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Inpainting & Regional Edit State
  const [showInpaintModal, setShowInpaintModal] = useState(false);
  const [inpaintInstruction, setInpaintInstruction] = useState('');
  const [isInpainting, setIsInpainting] = useState(false);

  // Before / After Comparison Split View
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);

  // Vector Display States
  const [vectorViewMode, setVectorViewMode] = useState<'preview' | 'code'>('preview');
  const [svgBackdrop, setSvgBackdrop] = useState<'dark' | 'light' | 'grid'>('dark');

  // Image-to-Image / Camera Reference State
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [isImg2Img, setIsImg2Img] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Prompt Expander State
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedResult, setEnhancedResult] = useState<{
    enhancedPromptEn: string;
    explanationAr: string;
    negativePrompt: string;
    semanticAnalysis?: SemanticAnalysis;
  } | null>(null);

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [currentResult, setCurrentResult] = useState<MediaItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSvg, setCopiedSvg] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Gallery State
  const [gallery, setGallery] = useState<MediaItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'image' | 'video' | 'vector'>('all');

  // Video Simulation Loop
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoIntervalRef = useRef<any>(null);

  // Real-Time VFX Shaders & Color Grading
  const [colorGrade, setColorGrade] = useState<'normal' | 'cinematic_noir' | 'cyberpunk' | 'golden_hour' | 'hdr' | 'emerald_matrix'>('normal');
  const [superResolution, setSuperResolution] = useState<boolean>(true);
  const [videoSpeed, setVideoSpeed] = useState<number>(1.0);

  const getFilterStyle = () => {
    let filterString = '';
    switch (colorGrade) {
      case 'cinematic_noir':
        filterString = 'contrast(1.2) brightness(0.95) saturate(1.1) sepia(0.12)';
        break;
      case 'cyberpunk':
        filterString = 'hue-rotate(185deg) saturate(1.4) contrast(1.2)';
        break;
      case 'golden_hour':
        filterString = 'sepia(0.25) saturate(1.3) contrast(1.05) brightness(1.02)';
        break;
      case 'hdr':
        filterString = 'contrast(1.3) saturate(1.35) brightness(1.05)';
        break;
      case 'emerald_matrix':
        filterString = 'hue-rotate(80deg) saturate(1.3) contrast(1.2)';
        break;
      default:
        filterString = 'none';
        break;
    }
    return {
      filter: filterString,
      imageRendering: superResolution ? ('crisp-edges' as const) : ('auto' as const),
    };
  };

  const fetchGallery = async () => {
    setGalleryLoading(true);
    try {
      const res = await fetch('/api/media/gallery');
      const data = await res.json();
      if (data.ok && Array.isArray(data.gallery)) {
        setGallery(data.gallery);
        if (!currentResult && data.gallery.length > 0) {
          setCurrentResult(data.gallery[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to load media gallery:', e);
    } finally {
      setGalleryLoading(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, []);

  // Video Player Simulation Loop
  useEffect(() => {
    if (currentResult?.type === 'video' && isVideoPlaying) {
      const step = 2 * videoSpeed;
      videoIntervalRef.current = setInterval(() => {
        setVideoProgress((p) => (p >= 100 ? 0 : p + step));
      }, 100);
    } else {
      clearInterval(videoIntervalRef.current);
    }
    return () => clearInterval(videoIntervalRef.current);
  }, [currentResult, isVideoPlaying, videoSpeed]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSourceImage(event.target?.result as string);
        setIsImg2Img(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/media/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          type: activeTab === 'video' ? 'video' : 'image',
          style: selectedStyle,
          motion: selectedMotion,
          aspectRatio: selectedAspect,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnhancedResult({
          enhancedPromptEn: data.enhancedPromptEn,
          explanationAr: data.explanationAr,
          negativePrompt: data.negativePrompt,
          semanticAnalysis: data.semanticAnalysis,
        });
      }
    } catch (e) {
      console.warn('Prompt enhance failed:', e);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleAppendModifier = (text: string) => {
    setPrompt((prev) => (prev.trim() ? `${prev.trim()}, ${text}` : text));
  };

  const handleToggleNegativeTag = (tagId: string) => {
    setActiveNegativeTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleAuditImage = async () => {
    if (!currentResult) return;
    setIsAuditing(true);
    setShowAuditModal(true);
    try {
      const res = await fetch('/api/media/audit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: currentResult.url,
          prompt: currentResult.originalPrompt || prompt,
        }),
      });
      const data = await res.json();
      if (data.ok && data.audit) {
        setAuditResult(data.audit);
      }
    } catch (e) {
      console.warn('Audit failed:', e);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleApplyAuditImprovement = () => {
    if (!auditResult?.improvedPromptEn) return;
    setPrompt(auditResult.improvedPromptEn);
    setShowAuditModal(false);
  };

  const handleInpaint = async () => {
    if (!currentResult || !inpaintInstruction.trim()) return;
    setIsInpainting(true);
    try {
      const res = await fetch('/api/media/inpaint-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImage: currentResult.url,
          instruction: inpaintInstruction.trim(),
          style: selectedStyle,
        }),
      });
      const data = await res.json();
      if (data.ok && data.item) {
        setBeforeImage(currentResult.url);
        setCurrentResult(data.item);
        setShowComparison(true);
        setShowInpaintModal(false);
        setInpaintInstruction('');
        fetchGallery();
      }
    } catch (e) {
      console.warn('Inpainting failed:', e);
    } finally {
      setIsInpainting(false);
    }
  };

  const handleGenerateVariations = () => {
    const nextSeed = Math.floor(Math.random() * 999999);
    setCustomSeed(nextSeed.toString());
    setTimeout(() => {
      handleGenerate();
    }, 50);
  };

  const activeGenerating = isGenerating || globalIsGenerating;

  const handleGenerate = async () => {
    if (!prompt.trim() || activeGenerating) return;
    setIsGenerating(true);
    const initialMsg = isAr ? '1/3 تحليل النوايا الدلالية ومواءمة محركات الإخراج…' : '1/3 Synthesizing prompt & routing pipeline…';
    setGenerationStep(initialMsg);

    const abort = new AbortController();
    abortRef.current = abort;
    const taskType = activeTab === 'video' ? 'video' : activeTab === 'vector' ? 'vector' : 'image';
    startGeneration({
      taskType,
      taskTitle: prompt.length > 36 ? prompt.slice(0, 36) + '…' : prompt,
      totalSteps: 3,
      initialStage: initialMsg,
      controller: abort,
    });

    try {
      const seedNum = customSeed.trim() ? Number(customSeed) : Math.floor(Math.random() * 999999);
      
      const opticalConfig = {
        focalLength: selectedFocalLength !== 'none' ? selectedFocalLength : undefined,
        aperture: selectedAperture !== 'none' ? selectedAperture : undefined,
        lightingSetup: selectedLighting !== 'none' ? selectedLighting : undefined,
        filmStock: selectedFilmStock !== 'none' ? selectedFilmStock : undefined,
      };

      const characterAnchor = characterLockEnabled && (characterName.trim() || characterTraits.trim()) ? {
        characterName: characterName.trim(),
        characterTraits: characterTraits.trim(),
      } : undefined;

      const combinedNegativePrompt = [
        ...activeNegativeTags.map(id => QUICK_NEGATIVE_PRESETS.find(p => p.id === id)?.text).filter(Boolean),
        customNegativePrompt.trim(),
      ].filter(Boolean).join(', ');

      if (activeTab === 'image' && batchCount > 1) {
        const batchMsg = isAr ? `2/3 توليد ${batchCount} تنويعات بصرية متوازية عبر بذور انتشار مختلفة…` : `2/3 Synthesizing ${batchCount} parallel visual variations…`;
        setGenerationStep(batchMsg);
        updateStage(batchMsg, 50, 2);
        const res = await fetch('/api/media/generate-variations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            count: batchCount,
            style: selectedStyle,
            aspectRatio: selectedAspect,
            engine: selectedEngine,
            opticalConfig,
          }),
          signal: abort.signal,
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
          updateStage(isAr ? '3/3 إنهاء ومعالجة الحزمة البصرية…' : '3/3 Finalizing variations batch…', 95, 3);
          setCurrentResult(data.items[0]);
          setVariationResults(data.items);
          fetchGallery();
        }
        return;
      }

      let endpoint = '/api/media/generate-image';
      let payload: any = {
        prompt,
        style: selectedStyle,
        aspectRatio: selectedAspect,
        seed: seedNum,
        engine: selectedEngine,
        quality: selectedQuality,
        opticalConfig,
        characterAnchor,
        customNegativePrompt: combinedNegativePrompt || undefined,
      };

      if (activeTab === 'vector') {
        endpoint = '/api/media/generate-vector';
        payload = {
          prompt,
          style: selectedStyle,
        };
      } else if (activeTab === 'video') {
        // Use the real asynchronous Veo API; never return a generated still as a fake video.
        endpoint = '/api/media/veo-generate';
        payload = {
          prompt,
          style: selectedStyle,
          motion: selectedMotion,
          aspectRatio: selectedAspect,
          seed: seedNum,
        };
      } else if (isImg2Img && sourceImage) {
        endpoint = '/api/media/image-to-image';
        payload = {
          prompt,
          sourceImage,
          style: selectedStyle,
          aspectRatio: selectedAspect,
          seed: seedNum,
        };
      }

      const secondStepMsg = activeTab === 'vector'
        ? (isAr ? '2/3 بناء المسارات الهندسية والتدرجات عبر Neural SVG…' : '2/3 Synthesizing vector paths & gradients via Neural SVG…')
        : activeTab === 'video'
        ? (isAr ? '2/3 محاكاة اللقطات الحركية وضبط الإضاءة والديناميكية عبر Veo 3…' : '2/3 Rendering cinematic camera motion via Google Veo 3…')
        : isImg2Img
        ? (isAr ? '2/3 معالجة الصورة المرجعية وتطبيق التعديل العصبي…' : '2/3 Processing reference image & neural restyling…')
        : (isAr ? `2/3 توليد الصورة بدقة فائقة عبر محرك ${selectedEngine}…` : `2/3 Synthesizing high-res textures via ${selectedEngine}…`);

      setGenerationStep(secondStepMsg);
      updateStage(secondStepMsg, 60, 2);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || (isAr ? 'فشل التوليد' : 'Generation failed'));
      }

      let generatedItem: MediaItem | null = data.item || null;
      if (activeTab === 'video' && data.operationName) {
        const operationName = String(data.operationName);
        let completed = false;
        // Veo jobs are asynchronous. Poll the real operation until the MP4 is ready.
        for (let attempt = 0; attempt < 120; attempt += 1) {
          if (abort.signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
          setGenerationStep(isAr
            ? `يجري توليد الفيديو فعليًا عبر Veo… (${Math.min(99, Math.round((attempt + 1) / 120 * 100))}%)`
            : `Veo is rendering the actual video… check ${attempt + 1}/120`);
          const statusResponse = await fetch('/api/media/veo-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationName }),
            signal: abort.signal,
          });
          const statusData = await statusResponse.json();
          if (!statusResponse.ok || !statusData.ok) {
            throw new Error(statusData.message || (isAr ? 'تعذر فحص حالة الفيديو' : 'Could not check video status'));
          }
          if (statusData.error) {
            throw new Error(typeof statusData.error === 'string' ? statusData.error : JSON.stringify(statusData.error));
          }
          if (statusData.done && statusData.hasVideo) {
            generatedItem = {
              id: `vid_${Date.now().toString(36)}`,
              type: 'video',
              operationName,
              generationStatus: 'completed',
              engine: `Google ${data.model || 'Veo'}`,
              title: prompt.slice(0, 50),
              originalPrompt: prompt,
              enhancedPrompt: prompt,
              url: `/api/media/veo-download?operationName=${encodeURIComponent(operationName)}`,
              aspectRatio: selectedAspect,
              width: selectedAspect === '9:16' ? 768 : 1280,
              height: selectedAspect === '9:16' ? 1365 : 720,
              style: selectedStyle,
              motion: selectedMotion,
              duration: 8,
              fps: 24,
              seed: seedNum,
              createdAt: Date.now(),
            };
            completed = true;
            break;
          }
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 3000);
            abort.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Generation cancelled', 'AbortError'));
            }, { once: true });
          });
        }
        if (!completed || !generatedItem) {
          throw new Error(isAr
            ? 'استغرق توليد الفيديو وقتًا طويلًا. أعد المحاولة أو تحقق من حالة مزود الفيديو.'
            : 'Video generation timed out. Retry or check the video provider status.');
        }
      }

      if (generatedItem) {
        updateStage(isAr ? '3/3 إنهاء ومعالجة العمل وحفظه…' : '3/3 Finalizing output & caching…', 95, 3);
        if (isImg2Img && sourceImage) {
          setBeforeImage(sourceImage);
          setShowComparison(true);
        }
        setCurrentResult(generatedItem);
        setVariationResults([]);
        fetchGallery();
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        cancelGeneration(isAr ? 'تم إلغاء التوليد بواسطة المستخدم' : 'Generation cancelled by user');
        return;
      }
      cancelGeneration();
      console.warn('Generation failed:', e);
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
      abortRef.current = null;
      finishGeneration();
    }
  };

  const handleCopyPrompt = () => {
    const textToCopy = enhancedResult?.enhancedPromptEn || currentResult?.enhancedPrompt || prompt;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySvgCode = () => {
    if (!currentResult?.svgCode) return;
    navigator.clipboard.writeText(currentResult.svgCode);
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 2000);
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setGallery((g) => g.filter((item) => item.id !== id));
        if (currentResult?.id === id) {
          setCurrentResult(gallery.find((item) => item.id !== id) || null);
        }
      }
    } catch (e) {
      console.warn('Delete failed:', e);
    }
  };

  const filteredGallery = useMemo(() => {
    if (galleryFilter === 'all') return gallery;
    return gallery.filter((item) => item.type === galleryFilter);
  }, [gallery, galleryFilter]);

  return (
    <section className="feature-page max-w-7xl mx-auto px-3 sm:px-6 py-6 select-none animate-fadeIn">
      {/* Studio Header (Strict Zero-Pill & Clean Typography) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono tracking-wider mb-1">
            <span>ADEM MEDIA SUITE 2026</span>
            <span aria-hidden="true">·</span>
            <span>GOOGLE IMAGEN 3</span>
            <span aria-hidden="true">·</span>
            <span>GOOGLE VEO 3</span>
            <span aria-hidden="true">·</span>
            <span>FLUX.1 PRO</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text)] tracking-tight">
            {isAr ? 'استوديو الصور والفيديوهات الخارق' : 'Master Multi-Engine Media Studio'}
          </h1>
          <p className="text-[var(--text-secondary)] text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            {isAr
              ? 'منظومة بصرية متكاملة لتوليد الصور الفوتوغرافية بدقة 8K، الفيديوهات السينمائية بمحرك Google Veo 3، والرسوم المتجهية البرمجية SVG.'
              : 'End-to-end multimodal production suite for 8K photorealism, Google Veo 3 cinematic video dynamics, and scalable Vector SVGs.'}
          </p>
        </div>

        {/* Clean Interactive Tab Switcher (Segmented Control) */}
        <div className="flex items-center p-1 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] self-start md:self-auto text-xs shrink-0 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'image'
                ? 'bg-[var(--accent)] text-slate-950 shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <ImageIcon size={14} />
            <span>{isAr ? 'توليد الصور' : 'Images'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'video'
                ? 'bg-[var(--accent)] text-slate-950 shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Video size={14} />
            <span>{isAr ? 'فيديو Veo 3 السينمائي' : 'Veo 3 Cinema'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vector')}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'vector'
                ? 'bg-[var(--accent)] text-slate-950 shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Code2 size={14} />
            <span>{isAr ? 'فيكتور SVG' : 'Vector SVG'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('gallery');
              fetchGallery();
            }}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              activeTab === 'gallery'
                ? 'bg-[var(--accent)] text-slate-950 shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            <Layers size={14} />
            <span>{isAr ? 'المعرض' : 'Gallery'}</span>
            <span className="text-[10px] opacity-80 font-mono ms-0.5">({gallery.length})</span>
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      {activeTab !== 'gallery' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6 items-start">
          {/* Left Panel: Creation Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Engine Selection & Pro Studio Quality Bar (Image Tab) */}
            {activeTab === 'image' && (
              <div className="p-4 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                  <span className="flex items-center gap-1.5">
                    <Cpu size={14} className="text-cyan-400" />
                    <span>{isAr ? 'محرك التوليد العصبي:' : 'Neural Engine:'}</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {ENGINE_CHOICES.find((e) => e.id === selectedEngine)?.badge}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ENGINE_CHOICES.map((eng) => (
                    <button
                      key={eng.id}
                      type="button"
                      onClick={() => setSelectedEngine(eng.id)}
                      className={`p-2.5 rounded-2xl border text-start transition cursor-pointer flex flex-col justify-between min-h-[64px] ${
                        selectedEngine === eng.id
                          ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-base">{eng.icon}</span>
                        <span className="text-[9px] font-mono opacity-70 uppercase">{eng.badge}</span>
                      </div>
                      <span className="text-xs font-bold truncate mt-1">
                        {isAr ? eng.nameAr : eng.nameEn}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Pro Resolution & Batch Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1.5 flex items-center justify-between">
                      <span>{isAr ? 'دقة واستبانة الإخراج:' : 'Resolution & Fidelity:'}</span>
                      <span className="font-mono text-emerald-400 text-[10px]">{selectedQuality}</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {QUALITY_OPTIONS.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setSelectedQuality(q.id)}
                          className={`py-1.5 px-2 rounded-xl border text-center transition cursor-pointer text-xs font-bold ${
                            selectedQuality === q.id
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                          }`}
                        >
                          {q.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1.5 flex items-center justify-between">
                      <span>{isAr ? 'التوليد الدفعي المتوازي:' : 'Batch Variations:'}</span>
                      <span className="font-mono text-cyan-400 text-[10px]">{batchCount}x</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([1, 2, 4] as const).map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setBatchCount(cnt)}
                          className={`py-1.5 px-2 rounded-xl border text-center transition cursor-pointer text-xs font-bold flex items-center justify-center gap-1 ${
                            batchCount === cnt
                              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                          }`}
                        >
                          <Grid3X3 size={11} />
                          <span>{cnt}x</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Prompt Composer Box */}
            <div className="p-4 sm:p-5 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-400" />
                  <span>
                    {activeTab === 'vector'
                      ? (isAr ? 'وصف الرسم المتجهي والشعار:' : 'Vector / Logo Prompt:')
                      : activeTab === 'video'
                      ? (isAr ? 'وصف المشهد السينمائي والحركة:' : 'Cinematic Scene & Camera Prompt:')
                      : (isAr ? 'وصف العمل البصري المراد توليده:' : 'Visual Masterpiece Prompt:')}
                  </span>
                </span>

                <div className="flex items-center gap-1.5">
                  {activeTab === 'image' && (
                    <button
                      type="button"
                      onClick={() => setShowCharacterLock(!showCharacterLock)}
                      className={`px-2 py-1 rounded-xl border text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                        characterLockEnabled
                          ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                      }`}
                      title={isAr ? 'تثبيت هوية وملامح الشخصية عبر التوليدات' : 'Lock character identity across generations'}
                    >
                      <UserCheck size={12} />
                      <span>{isAr ? 'تثبيت الشخصية' : 'Character Lock'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleEnhancePrompt}
                    disabled={!prompt.trim() || isEnhancing}
                    className="px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Wand2 size={12} className={isEnhancing ? 'animate-spin' : ''} />
                    <span>{isEnhancing ? (isAr ? 'جاري التحسين…' : 'Enhancing…') : (isAr ? 'تعزيز سينمائي ✨' : 'Enhance ✨')}</span>
                  </button>
                </div>
              </div>

              {/* Character Consistency Anchor Bar (Expandable) */}
              {activeTab === 'image' && showCharacterLock && (
                <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-800/40 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-purple-300 flex items-center gap-1.5">
                      <UserCheck size={13} className="text-purple-400" />
                      <span>{isAr ? 'مرساة تثبيت ملامح الشخصية (Consistent Face Anchor):' : 'Consistent Character Anchor:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCharacterLockEnabled(!characterLockEnabled)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-bold font-mono transition cursor-pointer ${
                        characterLockEnabled
                          ? 'bg-purple-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {characterLockEnabled ? (isAr ? 'مفعل ✓' : 'LOCKED ✓') : (isAr ? 'غير مفعل' : 'DISABLED')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={characterName}
                      onChange={(e) => {
                        setCharacterName(e.target.value);
                        setCharacterLockEnabled(true);
                      }}
                      placeholder={isAr ? 'اسم أو رمز الشخصية (مثال: Al-Ula Falcon Knight)' : 'Character name (e.g. Cyber Nomad Zack)'}
                      className="px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--muted)]"
                    />
                    <input
                      type="text"
                      value={characterTraits}
                      onChange={(e) => {
                        setCharacterTraits(e.target.value);
                        setCharacterLockEnabled(true);
                      }}
                      placeholder={isAr ? 'الملامح الثابتة (مثال: عيون كهرمانية حادة، شعر أسود قصير، ندبة)' : 'Fixed facial traits (e.g. sharp jaw, emerald eyes, silver hair)'}
                      className="px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--muted)]"
                    />
                  </div>
                </div>
              )}

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={activeGenerating}
                readOnly={activeGenerating}
                placeholder={
                  activeGenerating
                    ? (isAr ? 'جاري تنفيذ وتوليد العمل البصري حالياً… يرجى الانتظار أو الإلغاء ⏳' : 'Visual generation currently running… please wait or cancel ⏳')
                    : activeTab === 'vector'
                    ? (isAr ? 'مثال: شعار تقني مينيمالي لشركة ذكاء اصطناعي بخطوط هندسية متناسقة وتدرج ألوان متوهج…' : 'e.g. Minimalist cybernetic AI tech emblem with sleek gradients and clean geometric lines…')
                    : activeTab === 'video'
                    ? (isAr ? 'مثال: لقطة درون سينمائية FPV تندفع بسرعة بين أبراج مدينة ذكية مستقبلية في الليل مع أضواء النيون…' : 'e.g. Cinematic FPV drone swooping through futuristic skyscraper canyons at night with wet neon reflections…')
                    : (isAr ? 'مثال: صقر عربي ذهبي ملكي يحلق فوق رمال صحراء العلا عند الغروب مع إضاءة شمسية دافئة وعزل 85mm…' : 'e.g. Royal golden Arabian falcon soaring over sandstone dunes at sunset, 85mm lens, volumetric light…')
                }
                rows={3}
                className={`w-full p-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs sm:text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition resize-none leading-relaxed ${
                  activeGenerating ? 'cursor-not-allowed opacity-60 pointer-events-none' : ''
                }`}
              />

              {/* Quick Modifiers */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] text-[var(--muted)] font-medium shrink-0">
                  {isAr ? 'إضافات بصرية سريعة:' : 'Modifiers:'}
                </span>
                {QUICK_OPTICAL_MODIFIERS.map((mod, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAppendModifier(mod.text)}
                    className="px-2 py-0.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text)] transition cursor-pointer font-medium"
                  >
                    + {isAr ? mod.labelAr : mod.labelEn}
                  </button>
                ))}
              </div>

              {/* Negative Prompting Suite (Image Tab) */}
              {activeTab === 'image' && (
                <div className="pt-2 border-t border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--muted)] font-semibold flex items-center gap-1">
                      <ShieldCheck size={12} className="text-rose-400" />
                      <span>{isAr ? 'الفلاتر السلبية الذكية (Negative Constraints):' : 'Negative Constraints:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNegativeStudio(!showNegativeStudio)}
                      className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      {showNegativeStudio ? (isAr ? 'إخفاء الحقل المخصص' : 'Hide Custom') : (isAr ? '+ مخصص' : '+ Custom')}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {QUICK_NEGATIVE_PRESETS.map((np) => (
                      <button
                        key={np.id}
                        type="button"
                        onClick={() => handleToggleNegativeTag(np.id)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition cursor-pointer ${
                          activeNegativeTags.includes(np.id)
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                        }`}
                      >
                        {activeNegativeTags.includes(np.id) ? '✓ ' : '+ '}
                        {isAr ? np.labelAr : np.labelEn}
                      </button>
                    ))}
                  </div>

                  {showNegativeStudio && (
                    <input
                      type="text"
                      value={customNegativePrompt}
                      onChange={(e) => setCustomNegativePrompt(e.target.value)}
                      placeholder={isAr ? 'استبعاد مخصص (مثال: no artifacts, no sunglasses, no crowded background)' : 'Custom negative tokens...'}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)] placeholder-[var(--muted)]"
                    />
                  )}
                </div>
              )}

              {/* Prompt Suggestions */}
              <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
                <span className="text-[11px] text-[var(--muted)] font-medium block">
                  {isAr ? 'أفكار مقترحة جاهزة للتجربة:' : 'Inspirations:'}
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                  {(activeTab === 'vector'
                    ? PROMPT_INSPIRATIONS_VECTOR
                    : activeTab === 'video'
                    ? PROMPT_INSPIRATIONS_VIDEO
                    : PROMPT_INSPIRATIONS_IMAGE
                  ).map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(isAr ? s.ar : s.en)}
                      className="px-2.5 py-1 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] transition text-start cursor-pointer truncate max-w-xs shrink-0"
                    >
                      {isAr ? s.ar : s.en}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image-to-Image / Camera Reference Section */}
              {activeTab === 'image' && (
                <div className="pt-3 border-t border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                      <Camera size={13} className="text-emerald-400" />
                      <span>{isAr ? 'تعديل صورة مرجعية (Image-to-Image):' : 'Image-to-Image Reference & Restyling:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsImg2Img(!isImg2Img);
                        if (isImg2Img) setSourceImage(null);
                      }}
                      className={`text-[11px] px-2.5 py-0.5 rounded-xl font-medium transition cursor-pointer ${
                        isImg2Img
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text)] border border-[var(--border)]'
                      }`}
                    >
                      {isImg2Img ? (isAr ? 'مفعل ✓' : 'Active ✓') : (isAr ? 'تفعيل رفع صورة' : 'Enable Img2Img')}
                    </button>
                  </div>

                  {isImg2Img && (
                    <div className="p-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center gap-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                      />
                      {sourceImage ? (
                        <div className="flex items-center gap-3 w-full">
                          <img
                            src={sourceImage}
                            alt="Source"
                            className="w-12 h-12 object-cover rounded-xl border border-emerald-500/30"
                          />
                          <div className="flex-1 text-xs">
                            <span className="text-emerald-400 font-semibold block">
                              {isAr ? 'تم تحميل الصورة المرجعية بنجاح' : 'Reference image loaded'}
                            </span>
                            <span className="text-[var(--muted)] text-[11px]">
                              {isAr ? 'اكتب التعديل المطلوب وسيقوم المحرك بإعادة إنتاجها' : 'Type prompt above to apply neural restyling'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSourceImage(null)}
                            className="p-1.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs transition cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs text-[var(--muted)]">
                            {isAr ? 'اختر صورة من جهازك للتحويل أو التعديل:' : 'Select an image to restyle or transform:'}
                          </span>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Camera size={13} />
                            <span>{isAr ? 'رفع صورة' : 'Upload Image'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AI Enhanced Output Box */}
              {enhancedResult && (
                <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-800/40 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                    <span className="flex items-center gap-1">
                      <Zap size={13} className="text-amber-400" />
                      <span>{isAr ? 'البرومبت المعزز سينمائياً:' : 'Cinematic Master Prompt:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(enhancedResult.enhancedPromptEn);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 font-mono leading-relaxed bg-black/40 p-2.5 rounded-xl border border-indigo-900/40">
                    {enhancedResult.enhancedPromptEn}
                  </p>
                </div>
              )}
            </div>

            {/* Pro Optical Physics Studio (معمل البصريات والكاميرا الاحترافية) */}
            {activeTab === 'image' && (
              <div className="p-4 sm:p-5 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                  <span className="flex items-center gap-1.5">
                    <Focus size={14} className="text-amber-400" />
                    <span>{isAr ? 'معمل البصريات والكاميرا الاحترافية (Optical Rig):' : 'Optical Physics & Camera Rig:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowOpticalStudio(!showOpticalStudio)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer font-semibold"
                  >
                    {showOpticalStudio ? (isAr ? 'طي المعمل ▲' : 'Collapse ▲') : (isAr ? 'توسيع معمل العدسات والإضاءة ▼' : 'Open Optics Studio ▼')}
                  </button>
                </div>

                {showOpticalStudio ? (
                  <div className="space-y-3 pt-2 border-t border-[var(--border)] animate-fadeIn">
                    {/* Focal Length */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        <span>{isAr ? 'البُعد البؤري للعدسة (Focal Length):' : 'Focal Length:'}</span>
                        <span className="font-mono text-cyan-400">{selectedFocalLength !== 'none' ? selectedFocalLength : 'Auto'}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {FOCAL_LENGTH_OPTIONS.map((foc) => (
                          <button
                            key={foc.id}
                            type="button"
                            onClick={() => setSelectedFocalLength(foc.id)}
                            className={`p-1.5 rounded-xl border text-center transition cursor-pointer text-[10px] font-bold ${
                              selectedFocalLength === foc.id
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-sm'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                            }`}
                          >
                            <span className="block text-xs">{foc.icon}</span>
                            <span className="truncate block mt-0.5">{isAr ? foc.nameAr.split(' ')[0] : foc.nameEn.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aperture */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        <span>{isAr ? 'فتحة العدسة والعزل (Aperture & Bokeh):' : 'Aperture & Bokeh:'}</span>
                        <span className="font-mono text-emerald-400">{selectedAperture !== 'none' ? selectedAperture : 'Auto'}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {APERTURE_OPTIONS.map((ap) => (
                          <button
                            key={ap.id}
                            type="button"
                            onClick={() => setSelectedAperture(ap.id)}
                            className={`p-1.5 rounded-xl border text-center transition cursor-pointer text-[10px] font-bold ${
                              selectedAperture === ap.id
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                            }`}
                          >
                            {ap.id === 'none' ? (isAr ? 'تلقائي' : 'Auto') : ap.id}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Lighting Rig */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        <span>{isAr ? 'الإضاءة والاستوديو (Lighting Setup):' : 'Lighting Setup:'}</span>
                        <span className="text-[10px] text-amber-400">{LIGHTING_OPTIONS.find(l => l.id === selectedLighting)?.[isAr ? 'nameAr' : 'nameEn']}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {LIGHTING_OPTIONS.map((lit) => (
                          <button
                            key={lit.id}
                            type="button"
                            onClick={() => setSelectedLighting(lit.id)}
                            className={`p-2 rounded-xl border text-start transition cursor-pointer text-[10px] font-bold truncate ${
                              selectedLighting === lit.id
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                            }`}
                          >
                            {isAr ? lit.nameAr : lit.nameEn}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Film Stock & Sensor */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        <span>{isAr ? 'فيلم التصوير والمستشعر (Film Stock / Sensor):' : 'Film Stock & Sensor:'}</span>
                        <span className="text-[10px] text-purple-400">{FILM_STOCK_OPTIONS.find(f => f.id === selectedFilmStock)?.[isAr ? 'nameAr' : 'nameEn']}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {FILM_STOCK_OPTIONS.map((flm) => (
                          <button
                            key={flm.id}
                            type="button"
                            onClick={() => setSelectedFilmStock(flm.id)}
                            className={`p-2 rounded-xl border text-start transition cursor-pointer text-[10px] font-bold truncate ${
                              selectedFilmStock === flm.id
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                            }`}
                          >
                            {isAr ? flm.nameAr : flm.nameEn}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] flex-wrap">
                    <span>{isAr ? 'العدسة:' : 'Lens:'} <b className="text-[var(--text)]">{selectedFocalLength}</b></span>
                    <span aria-hidden="true">·</span>
                    <span>{isAr ? 'العزل:' : 'Aperture:'} <b className="text-[var(--text)]">{selectedAperture}</b></span>
                    <span aria-hidden="true">·</span>
                    <span>{isAr ? 'الإضاءة:' : 'Light:'} <b className="text-[var(--text)]">{selectedLighting}</b></span>
                  </div>
                )}
              </div>
            )}

            {/* Artistic Style Matrix (Image & Vector) */}
            {activeTab !== 'video' && (
              <div className="p-4 sm:p-5 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                  <span className="flex items-center gap-1.5">
                    <Palette size={14} className="text-purple-400" />
                    <span>{isAr ? 'الأسلوب الفني والجمالي:' : 'Artistic Style:'}</span>
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">
                    {STYLE_OPTIONS.find((s) => s.id === selectedStyle)?.[isAr ? 'nameAr' : 'nameEn']}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {STYLE_OPTIONS.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyle(style.id)}
                      className={`p-2.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[58px] ${
                        selectedStyle === style.id
                          ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="text-base">{style.icon}</span>
                      <span className="text-[11px] font-bold leading-tight">
                        {isAr ? style.nameAr : style.nameEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Video Motion Direction Matrix (Video Tab) */}
            {activeTab === 'video' && (
              <div className="p-4 sm:p-5 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                  <span className="flex items-center gap-1.5">
                    <MonitorPlay size={14} className="text-rose-400" />
                    <span>{isAr ? 'حركة الكاميرا والإخراج السينمائي (Google Veo 3):' : 'Camera Motion Dynamics (Google Veo 3):'}</span>
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">
                    {MOTION_OPTIONS.find((m) => m.id === selectedMotion)?.[isAr ? 'nameAr' : 'nameEn']}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MOTION_OPTIONS.map((mot) => (
                    <button
                      key={mot.id}
                      type="button"
                      onClick={() => setSelectedMotion(mot.id)}
                      className={`p-2.5 rounded-2xl border text-start transition cursor-pointer flex items-center justify-between ${
                        selectedMotion === mot.id
                          ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="text-xs font-bold">{isAr ? mot.nameAr : mot.nameEn}</span>
                      <span className="text-[10px] font-mono opacity-70">60 FPS</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Aspect Ratio & Form Factor */}
            <div className="p-4 sm:p-5 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                <span className="flex items-center gap-1.5">
                  <Sliders size={14} className="text-emerald-400" />
                  <span>{isAr ? 'أبعاد ونسب الصورة / الفيديو:' : 'Aspect Ratio & Framing:'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  {showAdvanced ? (isAr ? 'إخفاء الإعدادات المتقدمة' : 'Hide Advanced') : (isAr ? 'إعدادات متقدمة' : 'Advanced')}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {ASPECT_OPTIONS.map((asp) => (
                  <button
                    key={asp.id}
                    type="button"
                    onClick={() => setSelectedAspect(asp.id)}
                    className={`p-2 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      selectedAspect === asp.id
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)] shadow-sm'
                        : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{asp.ratio}</span>
                    <span className="text-[10px] leading-tight opacity-80">{isAr ? asp.nameAr : asp.nameEn}</span>
                  </button>
                ))}
              </div>

              {showAdvanced && (
                <div className="pt-3 border-t border-[var(--border)] space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[var(--muted)] block mb-1">Seed (بذرة التوليد):</label>
                      <input
                        type="text"
                        value={customSeed}
                        onChange={(e) => setCustomSeed(e.target.value)}
                        placeholder={isAr ? 'عشوائي تلقائي' : 'Random seed'}
                        className="w-full px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--muted)] block mb-1">
                        {isAr ? 'المحرك الفعال:' : 'Active Pipeline:'}
                      </label>
                      <div className="px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-emerald-400 font-mono">
                        {selectedEngine.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Progress Indicator & Abort Action */}
            {activeGenerating && (
              <LiveProgressCard
                language={language}
                onCancel={() => {
                  abortRef.current?.abort();
                  cancelGeneration(isAr ? 'تم إلغاء التوليد بواسطة المستخدم' : 'Generation cancelled by user');
                }}
                className="mb-3"
              />
            )}

            {/* Main Action Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || activeGenerating}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99] ${
                activeGenerating
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-80'
                  : 'bg-[var(--accent)] hover:opacity-90 text-slate-950 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>{generationStep || (isAr ? 'جاري التوليد بدقة فائقة…' : 'Synthesizing media…')}</span>
                </>
              ) : (
                <>
                  {activeTab === 'vector' ? (
                    <Code2 size={16} />
                  ) : activeTab === 'video' ? (
                    <Video size={16} />
                  ) : (
                    <ImageIcon size={16} />
                  )}
                  <span>
                    {activeTab === 'vector'
                      ? (isAr ? 'توليد رسم وكود SVG الآن' : 'Synthesize Vector SVG Now')
                      : activeTab === 'video'
                      ? (isAr ? 'إخراج فيديو Veo 3 السينمائي الآن' : 'Render Veo 3 Cinema Video Now')
                      : (isAr ? `توليد العمل البصري بدقة فائقة الآن` : 'Generate Masterpiece Now')}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Right Panel: Viewport Stage (5 cols) */}
          <div className="lg:col-span-5 sticky top-20 space-y-4">
            <div className="p-4 rounded-3xl bg-[var(--surface-2)] border border-[var(--border)] shadow-xl overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">
                    {currentResult?.type === 'vector'
                      ? (isAr ? 'منصة الفيكتور والكود (SVG Canvas)' : 'SVG Vector Canvas')
                      : currentResult?.type === 'video'
                      ? (isAr ? 'مسرح عرض الفيديو (Veo 3 Cinema)' : 'Veo 3 Cinema Stage')
                      : (isAr ? 'منصة المعاينة فائقة الدقة (8K Viewer)' : '8K Master Stage')}
                  </h3>
                </div>

                {currentResult && (
                  <div className="flex items-center gap-1.5">
                    {currentResult.engine && (
                      <span className="text-[10px] font-mono text-cyan-400">
                        {currentResult.engine}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="p-1 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition"
                      title={isAr ? 'تكبير كامل' : 'Fullscreen'}
                    >
                      <Maximize2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Viewport Box */}
              <div
                className={`relative rounded-2xl overflow-hidden border border-[var(--border)] aspect-video flex items-center justify-center shadow-inner ${
                  currentResult?.type === 'vector'
                    ? svgBackdrop === 'light'
                      ? 'bg-white'
                      : svgBackdrop === 'grid'
                      ? 'bg-slate-950 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:16px_16px]'
                      : 'bg-slate-950'
                    : 'bg-slate-950'
                }`}
              >
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full border-4 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin" />
                      <Sparkles size={18} className="absolute inset-0 m-auto text-[var(--accent)] animate-pulse" />
                    </div>
                    <div className="text-xs font-semibold text-[var(--text)] animate-pulse">
                      {generationStep || (isAr ? 'جاري بناء التكوين البصري…' : 'Building visual composition…')}
                    </div>
                  </div>
                ) : currentResult ? (
                  <>
                    {/* Vector Display */}
                    {currentResult.type === 'vector' ? (
                      vectorViewMode === 'preview' ? (
                        currentResult.svgCode ? (
                          <div
                            className="w-full h-full p-4 flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: currentResult.svgCode }}
                          />
                        ) : (
                          <img
                            src={currentResult.url}
                            alt={currentResult.title}
                            className="w-full h-full object-contain p-4"
                          />
                        )
                      ) : (
                        <div className="w-full h-full p-3 overflow-auto bg-slate-950 text-left font-mono text-[10px] text-cyan-300">
                          <pre className="whitespace-pre-wrap">{currentResult.svgCode || '<svg>...</svg>'}</pre>
                        </div>
                      )
                    ) : currentResult.type === 'video' ? (
                      <video
                        src={currentResult.url}
                        poster={currentResult.posterUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain bg-black"
                        aria-label={currentResult.title}
                      />
                    ) : (
                      <img
                        src={currentResult.url}
                        alt={currentResult.title}
                        referrerPolicy="no-referrer"
                        style={getFilterStyle()}
                        className="w-full h-full object-cover transition-all duration-500"
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center p-6 text-[var(--muted)] text-xs">
                    {isAr ? 'المسرح جاهز. اكتب وصفاً واضغط على زر التوليد.' : 'Studio is ready. Enter prompt and generate.'}
                  </div>
                )}
              </div>

              {/* Vector Mode Quick Toolbar */}
              {currentResult?.type === 'vector' && (
                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--border)] text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setVectorViewMode('preview')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                        vectorViewMode === 'preview' ? 'bg-cyan-600 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      {isAr ? 'معاينة بصرية' : 'Visual View'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVectorViewMode('code')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                        vectorViewMode === 'code' ? 'bg-cyan-600 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      <FileCode size={12} />
                      <span>{isAr ? 'كود SVG' : 'SVG Code'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSvgBackdrop('dark')}
                      className={`p-1 rounded-md ${svgBackdrop === 'dark' ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                      title={isAr ? 'خلفية داكنة' : 'Dark'}
                    >
                      <Moon size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSvgBackdrop('light')}
                      className={`p-1 rounded-md ${svgBackdrop === 'light' ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                      title={isAr ? 'خلفية فاتحة' : 'Light'}
                    >
                      <Sun size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSvgBackdrop('grid')}
                      className={`p-1 rounded-md text-[10px] font-mono ${svgBackdrop === 'grid' ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--muted)]'}`}
                      title={isAr ? 'شبكة شفافة' : 'Grid'}
                    >
                      #
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time Color Grade & VFX Deck */}
              {currentResult && currentResult.type !== 'vector' && (
                <div className="p-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-2 mt-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text)]">
                    <span className="flex items-center gap-1.5">
                      <Palette size={12} className="text-cyan-400" />
                      <span>{isAr ? 'معالجة الألوان وتأثيرات الإخراج:' : 'Color Grade & VFX Shaders:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSuperResolution((s) => !s)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer border ${
                        superResolution
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]'
                      }`}
                    >
                      {superResolution ? '8K SHARP' : 'RAW'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'normal', ar: 'الأصلي RAW', en: 'Raw' },
                      { id: 'cinematic_noir', ar: 'سينمائي 70mm', en: 'Cinema 70mm' },
                      { id: 'cyberpunk', ar: 'نيون سايبر', en: 'Cyber Neon' },
                      { id: 'golden_hour', ar: 'غروب ذهبي', en: 'Golden Hour' },
                      { id: 'hdr', ar: 'استوديو HDR', en: 'Studio HDR' },
                      { id: 'emerald_matrix', ar: 'ماتريكس زمردي', en: 'Emerald Matrix' },
                    ].map((lut) => (
                      <button
                        key={lut.id}
                        type="button"
                        onClick={() => setColorGrade(lut.id as any)}
                        className={`px-2 py-1 rounded-xl text-[10px] font-semibold transition cursor-pointer border ${
                          colorGrade === lut.id
                            ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                            : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                        }`}
                      >
                        {isAr ? lut.ar : lut.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Bar Below Preview */}
              {currentResult && (
                <div className="mt-3 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text)] truncate">{currentResult.title}</h4>
                    <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-0.5 font-mono">
                      {currentResult.enhancedPrompt}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)] flex-wrap">
                    {/* Quick Variation */}
                    <button
                      type="button"
                      onClick={handleGenerateVariations}
                      disabled={isGenerating}
                      className="px-3 py-1.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={isGenerating ? 'animate-spin' : ''} />
                      <span>{isAr ? 'تنويع جديد' : 'New Variation'}</span>
                    </button>

                    {/* Download */}
                    {currentResult.type === 'vector' && currentResult.svgCode ? (
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([currentResult.svgCode || ''], { type: 'image/svg+xml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `adam_vector_${currentResult.id}.svg`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download size={13} />
                        <span>{isAr ? 'تحميل .SVG' : 'Download .SVG'}</span>
                      </button>
                    ) : (
                      <a
                        href={currentResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={`adam_${currentResult.type}_${currentResult.id}`}
                        className="px-3 py-1.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download size={13} />
                        <span>{isAr ? 'تنزيل فائق الدقة' : 'Download HD'}</span>
                      </a>
                    )}

                    {/* Copy Vector Code or Prompt */}
                    {currentResult.type === 'vector' && currentResult.svgCode ? (
                      <button
                        type="button"
                        onClick={handleCopySvgCode}
                        className="px-3 py-1.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedSvg ? <Check size={13} className="text-emerald-400" /> : <Code2 size={13} />}
                        <span>{copiedSvg ? (isAr ? 'تم النسخ' : 'Copied SVG') : (isAr ? 'نسخ كود SVG' : 'Copy SVG')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className="px-3 py-1.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ البرومبت' : 'Copy Prompt')}</span>
                      </button>
                    )}

                    {/* Send to Chat for continuous exploration */}
                    <button
                      type="button"
                      onClick={() => {
                        const message = `أريدك أن تفحص وتطور هذا العمل البصري الذي تم توليده في استوديو الوسائط:\n- العنوان: "${currentResult.title}"\n- الوصف: "${currentResult.originalPrompt}"\n- المحرك: ${currentResult.engine || 'ADEM Visual Engine'}`;
                        if (onRunPromptInChat) {
                          onRunPromptInChat(message);
                        } else if (onNavigate) {
                          onNavigate('chat');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Share2 size={13} />
                      <span>{isAr ? 'ناقش في المحادثة' : 'Discuss in Chat'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Vault / Gallery View */
        <div className="my-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setGalleryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  galleryFilter === 'all' ? 'bg-[var(--accent)] text-slate-950' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {isAr ? 'الكل' : 'All'} ({gallery.length})
              </button>
              <button
                type="button"
                onClick={() => setGalleryFilter('image')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  galleryFilter === 'image' ? 'bg-[var(--accent)] text-slate-950' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {isAr ? 'الصور' : 'Images'} ({gallery.filter((g) => g.type === 'image').length})
              </button>
              <button
                type="button"
                onClick={() => setGalleryFilter('video')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  galleryFilter === 'video' ? 'bg-[var(--accent)] text-slate-950' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {isAr ? 'الفيديوهات' : 'Videos'} ({gallery.filter((g) => g.type === 'video').length})
              </button>
              <button
                type="button"
                onClick={() => setGalleryFilter('vector')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  galleryFilter === 'vector' ? 'bg-[var(--accent)] text-slate-950' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {isAr ? 'الفيكتور وSVG' : 'Vector SVG'} ({gallery.filter((g) => g.type === 'vector').length})
              </button>
            </div>
          </div>

          {/* Gallery Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredGallery.map((item) => {
              const isVector = item.type === 'vector';
              const isVideo = item.type === 'video';

              return (
                <div
                  key={item.id}
                  className="rounded-2xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group hover:border-[var(--border-strong)] transition-all flex flex-col"
                >
                  <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                    {isVector && item.svgCode ? (
                      <div
                        className="w-full h-full p-4 flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: item.svgCode }}
                      />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    )}

                    <div className="absolute top-2 start-2 flex items-center gap-1">
                      <span className="text-[10px] font-mono text-white bg-black/70 px-2 py-0.5 rounded-md uppercase">
                        {isVector ? 'SVG' : isVideo ? 'VEO 3' : 'IMG'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="absolute top-2 end-2 p-1.5 rounded-lg bg-black/60 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text)] line-clamp-1">{item.title}</h4>
                      <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-1 leading-relaxed">
                        {item.originalPrompt}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setPrompt(item.originalPrompt);
                          setActiveTab(item.type);
                          setCurrentResult(item);
                        }}
                        className="text-[var(--accent)] hover:underline font-semibold cursor-pointer"
                      >
                        {isAr ? 'فتح بالأستوديو' : 'Open in Studio'}
                      </button>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        <Download size={13} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredGallery.length === 0 && !galleryLoading && (
            <div className="text-center py-16 text-[var(--muted)] text-xs">
              {isAr ? 'المعرض فارغ حالياً. قم بتوليد صورة أو فيكتور أو فيديو لحفظها هنا.' : 'Gallery is empty. Generate media to view it here.'}
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxOpen && currentResult && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-10 end-0 text-white hover:text-cyan-400 p-2 cursor-pointer"
            >
              <X size={24} />
            </button>
            <div className="w-full max-h-[80vh] flex items-center justify-center overflow-hidden rounded-2xl bg-black/60 border border-slate-800">
              {currentResult.type === 'vector' && currentResult.svgCode ? (
                <div
                  className="w-full h-full p-8 flex items-center justify-center max-w-2xl max-h-[70vh]"
                  dangerouslySetInnerHTML={{ __html: currentResult.svgCode }}
                />
              ) : (
                <img
                  src={currentResult.url}
                  alt={currentResult.title}
                  className="max-w-full max-h-[80vh] object-contain rounded-xl"
                />
              )}
            </div>
            <div className="mt-3 text-center text-xs text-slate-300 max-w-xl">
              <span className="font-bold text-white block mb-1">{currentResult.title}</span>
              <span className="text-[11px] text-slate-400 font-mono">{currentResult.enhancedPrompt}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
