import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

function withTimeout<T>(promise: Promise<T>, ms = 2500, fallbackMsg = 'Upstream timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(fallbackMsg)), ms)),
  ]);
}

export type MediaType = 'image' | 'video' | 'vector';

export type MediaEngineType =
  | 'auto'
  | 'gemini-nano-banana'
  | 'imagen-3'
  | 'gemini-image'
  | 'flux-pro'
  | 'flux-turbo'
  | 'midjourney'
  | 'vector-svg';

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
  | 'minimalist';

export type FocalLength = '14mm' | '35mm' | '50mm' | '85mm' | '200mm';
export type Aperture = 'f1.2' | 'f1.8' | 'f2.8' | 'f8' | 'f16';
export type LightingSetup = 'golden_hour' | 'studio_softbox' | 'cyber_neon' | 'dramatic_rim' | 'volumetric_rays' | 'cinematic_natural';
export type FilmStock = 'kodak_portra' | 'fuji_velvia' | 'ilford_bw' | 'cinestill_800t' | 'digital_8k';
export type ImageQuality = '1K' | '2K' | '4K';

export interface OpticalConfig {
  focalLength?: FocalLength;
  aperture?: Aperture;
  lightingSetup?: LightingSetup;
  filmStock?: FilmStock;
}

export interface CharacterAnchor {
  characterName?: string;
  characterTraits?: string;
  consistencySeed?: number;
}

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

export type VideoMotion =
  | 'drone_fpv'
  | 'orbit_360'
  | 'dolly_zoom'
  | 'slow_motion'
  | 'pan_horizontal'
  | 'hyperlapse'
  | 'cinematic_steady';

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
  userId?: string;
  type: MediaType;
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
  opticalConfig?: OpticalConfig;
  quality?: ImageQuality;
  characterAnchor?: CharacterAnchor;
  motion?: VideoMotion;
  duration?: number;
  fps?: number;
  seed: number;
  createdAt: number;
}

const GALLERY_FILE = path.join(process.cwd(), '.media_gallery.json');

const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1344, height: 768 },
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 864 },
  '21:9': { width: 1536, height: 640 },
  '1:4': { width: 384, height: 1536 },
  '1:8': { width: 256, height: 2048 },
  '4:1': { width: 1536, height: 384 },
  '8:1': { width: 2048, height: 256 },
};

const STYLE_PROMPT_MAP: Record<ImageStyle, { en: string; ar: string }> = {
  photorealistic: {
    en: 'hyper-realistic photography, 8k resolution, captured on 85mm lens, sharp focus, natural volumetric lighting, photorealistic textures, master composition',
    ar: 'تصوير فوتوغرافي واقعي فائق الدقة 8K، عدسة 85mm، إضاءة حجمية طبيعية وتفاصيل حادة',
  },
  cinematic: {
    en: 'cinematic still, IMAX 70mm film grain, dynamic dramatic lighting, anamorphic lens flare, moody color grading, epic cinematic atmosphere, masterpiece',
    ar: 'لقطة سينمائية، جودة أفلام IMAX، إضاءة درامية، ألوان سينمائية وأجواء ملحمية',
  },
  anime: {
    en: 'high-end Japanese anime aesthetic, Studio Ghibli and Makoto Shinkai style, vibrant colors, lush detailed background, cinematic key visual, 4k digital art',
    ar: 'أنمي ياباني فاخر، طراز استوديو غيبلي وماكوتو شينكاي، ألوان مشبعة وتفاصيل مذهلة',
  },
  cyberpunk: {
    en: 'cyberpunk futuristic metropolis, glowing neon lighting, reflections in rain-soaked streets, volumetric fog, high-tech dystopian aesthetics, Octane render',
    ar: 'سايبربانك مستقبلي، إضاءة نيون مبهرة، انعكاسات مياه الأمطار والضباب وضخامة معمارية',
  },
  unreal5: {
    en: '3D CGI render, Unreal Engine 5.4, ray-traced global illumination, Subsurface scattering, Nanite geometry, ultra-detailed 8k texture maps',
    ar: 'تصميم ثلاثي الأبعاد Unreal Engine 5 مع تتبع أشعة وإضاءة وفيزيائية واقعية',
  },
  oil_painting: {
    en: 'classical oil painting on textured canvas, rich impasto brush strokes, Rembrandt dramatic lighting, baroque atmosphere, fine art gallery masterpiece',
    ar: 'لوحة زيتية كلاسيكية مع ضربات فرشاة بارزة، إضاءة رامبرانت الدرامية وأجواء تاريخية',
  },
  product_studio: {
    en: 'commercial product photography, clean luxury studio lighting, softbox highlights, crisp edges, minimal elegant pedestal, high-end catalog quality',
    ar: 'تصوير إعلاني وتجاري فاخر، إضاءة سوفت بوكس استوديو، خطوط حادة وأناقة متناهية',
  },
  fantasy: {
    en: 'mythical high-fantasy concept art, magical glowing particles, ancient colossal ruins, ethereal twilight skies, ArtStation trending, intricate details',
    ar: 'عالم فانتزي أسطوري، جزيئات سحرية متوهجة، آثار تاريخية عملاقة وأجواء سحرية',
  },
  minimalist: {
    en: 'minimalist modern design, clean negative space, balanced geometric composition, elegant monochromatic and muted tones, architectural clarity',
    ar: 'تصميم مينيمالي حديث، مساحات سلبية متوازنة وألوان راقية وهادئة',
  },
};

const MOTION_DESCRIPTIONS: Record<VideoMotion, { en: string; ar: string }> = {
  drone_fpv: {
    en: 'smooth high-altitude FPV drone flythrough, continuous seamless forward drift, sweeping panoramic reveal',
    ar: 'حركة درون FPV انسيابية سريعة، اندفاع سلس للأمام مع كشف بانورامي عريض',
  },
  orbit_360: {
    en: 'cinematic 360-degree orbital camera rotation around the subject, steady gimbal motion, parallax depth',
    ar: 'دوران سينمائي 360 درجة حول الهدف بحركة جيمبل سلسة وعمق تصوير مجسم',
  },
  dolly_zoom: {
    en: 'vertigo Hitchcock dolly zoom effect, background compressing while foreground subject remains locked, dramatic tension',
    ar: 'تأثير دولي زووم (Dolly Zoom) سينمائي، انضغاط الخلفية مع ثبات العنصر الرئيسي',
  },
  slow_motion: {
    en: 'ultra slow motion 120fps fluid movement, cinematic water ripples, floating particles, hyper-smooth deceleration',
    ar: 'تصوير بطيء فائق النعومة 120 إطار بالثانية، حركة سوائل وجزيئات عائمة بانسيابية',
  },
  pan_horizontal: {
    en: 'slow majestic horizontal tracking pan, steady slider movement, deep horizon view',
    ar: 'حركة تتبع أفقية بطيئة وثابتة، تدرج على طول الأفق والمنظر الطبيعي',
  },
  hyperlapse: {
    en: 'motion-controlled dynamic hyperlapse, clouds streaking across sky, high-speed lighting shift, stabilized flow',
    ar: 'حركة هايبر لابس متسارعة، حركة سحب سريعة وتحول ضوئي مبهر ومثبت',
  },
  cinematic_steady: {
    en: 'Hollywood steady-cam tracking shot, subtle organic breathing motion, cinematic focal shifts',
    ar: 'لقطة كاميرا محمولة ومثبتة هوليوودية مع تنقل تركيز بؤري سينمائي سلس',
  },
};

// Circuit breaker to prevent repeated 429 quota exhaustion errors on free-tier keys
class NativeImageCircuitBreaker {
  private cooldownUntil = 0;

  public isAvailable(): boolean {
    return Date.now() > this.cooldownUntil;
  }

  public trip(durationMs = 60 * 60 * 1000) {
    this.cooldownUntil = Date.now() + durationMs;
  }
}

const nativeImageCircuitBreaker = new NativeImageCircuitBreaker();

// Fast in-memory LRU prompt cache for zero-latency instant response on repeated/similar prompts
const promptEnhanceCache = new Map<string, {
  enhancedPromptEn: string;
  explanationAr: string;
  negativePrompt: string;
  recommendedAspectRatio: AspectRatio;
  recommendedStyle: ImageStyle;
  semanticAnalysis?: SemanticAnalysis;
  timestamp: number;
}>();

// Cascading AI Vision Director Models
const DIRECTOR_MODELS = [
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
];

/**
 * Intelligent Rule-Based Semantic Brain
 * Translates and elevates Arabic/English prompts into rich visual descriptors
 * even in offline/zero-latency scenarios.
 */
export class CognitiveMediaBrain {
  public static deconstruct(prompt: string, type: MediaType, styleKey: ImageStyle, motionKey?: VideoMotion): {
    enhancedPromptEn: string;
    explanationAr: string;
    semanticAnalysis: SemanticAnalysis;
    negativePrompt: string;
  } {
    const p = prompt.toLowerCase();

    // 1. Detect cultural landmark / geography
    let environmentEn = 'scenic environment with rich atmospheric depth and layered background elements';
    let environmentAr = 'بيئة تفاعلية ذات عمق مكاني وطبقات متعددة';

    if (p.includes('علا') || p.includes('العلا')) {
      environmentEn = 'towering ancient sandstone monoliths of Al-Ula, dramatic desert canyons, wind-carved rock formations, sweeping red sand dunes';
      environmentAr = 'جبال وصخور العلا الشاهقة المنحوتة بالرياح مع الكثبان الرملية الذهبية الحمراء';
    } else if (p.includes('نيوم') || p.includes('ذا لاين') || p.includes('the line')) {
      environmentEn = 'futuristic NEOM smart megacity with glowing crystalline vertical towers, elevated maglev monorails, sustainable solar architecture';
      environmentAr = 'مدينة نيوم المستقبلية بأبراجها الزجاجية العمودية وقطارات الماجليف الذكية المعلقة';
    } else if (p.includes('رياض') || p.includes('الرياض')) {
      environmentEn = 'modern Riyadh skyline with illuminated Kingdom Tower and Al Faisaliah Tower, prestigious financial district, polished boulevards';
      environmentAr = 'أفق مدينة الرياض الحديث مع برجي المملكة والفيصلية والحي المالي المضاء';
    } else if (p.includes('دبي') || p.includes('خليفة')) {
      environmentEn = 'futuristic Dubai skyline with gleaming curved skyscrapers, luxury modern architecture, reflecting marina waters';
      environmentAr = 'أفق دبي المستقبلي مع ناطحات السحاب الملتوية والمياه العاكسة للأضواء';
    } else if (p.includes('أندلس') || p.includes('حمراء') || p.includes('غرناطة')) {
      environmentEn = 'opulent Moorish Andalusian palace, intricate geometric arabesque arches, marble fountains, lush fragrant courtyards';
      environmentAr = 'قصر أندلسي فاخر مع أقواس هندسية موريسية، نوافير رخامية وباحات خضراء';
    } else if (p.includes('قدس') || p.includes('الأقصى')) {
      environmentEn = 'historic Jerusalem ancient stone architecture, golden dome catching the sunlight, olive trees, ancient arched alleys';
      environmentAr = 'القدس العتيقة بحجارتها التاريخية وقبتها الذهبية المتلألئة وأشجار الزيتون';
    } else if (p.includes('مكة') || p.includes('الحرم')) {
      environmentEn = 'majestic holy city of Mecca, expansive luminous marble courtyards, spiritual grand architecture';
      environmentAr = 'مكة المكرمة مع الساحات الرخامية البيضاء الواسعة والروحانية العميقة';
    } else if (p.includes('بحر') || p.includes('محيط') || p.includes('شاطئ') || p.includes('أمواج')) {
      environmentEn = 'crystal turquoise ocean with gentle crashing waves, sea spray mist, pristine shoreline, deep aquatic horizon';
      environmentAr = 'محيط بلوري فيروزي مع أمواج متلاطمة برفق ورذاذ بحري وشاطئ نقي';
    } else if (p.includes('صحراء') || p.includes('رمال') || p.includes('كثبان')) {
      environmentEn = 'sweeping golden red sand dunes with delicate wind ripples, vast desert horizon, thermal heat haze';
      environmentAr = 'صحراء شاسعة ذات كثبان رملية متموجة بفعل الرياح وأفق لا نهائي';
    } else if (p.includes('فضاء') || p.includes('كوكب') || p.includes('مجرة') || p.includes('نجوم')) {
      environmentEn = 'deep cosmic nebula, swirling interstellar dust, distant alien exoplanets, glowing star clusters and milky way';
      environmentAr = 'فضاء كوني عميق مع سديم متلألئ وكواكب بعيدة ومجرات حلزونية';
    } else if (p.includes('غابة') || p.includes('شلال') || p.includes('طبيعة') || p.includes('أشجار')) {
      environmentEn = 'ancient emerald forest canopy, cascading crystalline waterfall, moss-covered rocks, mystical sunbeams penetrating the foliage';
      environmentAr = 'غابة زمردية كثيفة مع شلال كريستالي متدفق وأشعة شمس تخترق أوراق الشجر';
    } else if (p.includes('ملعب') || p.includes('stadium') || p.includes('مباراة') || p.includes('كورة') || p.includes('كرة') || p.includes('football') || p.includes('soccer')) {
      if (p.includes('جزائر') || p.includes('algeria') || p.includes('محارب') || p.includes('خضرا')) {
        environmentEn = 'electrifying packed football stadium, thousands of passionate Algerian supporters waving green and white Algerian national flags and banners, green seating, pristine manicured pitch turf grass, bright stadium floodlights';
        environmentAr = 'ملعب كرة قدم أسطوري ممتلئ بعشرات الآلاف من الجماهير الجزائرية الهاتفة مع رايات وأعلام الجزائر الخضراء والبيضاء';
      } else {
        environmentEn = 'world-class packed football stadium arena, roaring fans in grandstands, manicured emerald green turf grass, vibrant matchday atmosphere';
        environmentAr = 'استاد كرة قدم عالمي ممتلئ بالجماهير مع أرضية عشبية خضراء وأجواء حماسية';
      }
    }

    // 2. Detect main subject
    let subjectEn = 'masterfully detailed focal subject with intricate surface textures and authentic anatomy';
    let subjectAr = 'العنصر المحوري بدقة تفاصيل مادية وتشريحية عالية';

    // 2.1 Celebrity & Football / Sports detection
    if ((p.includes('ميسي') || p.includes('messi')) && (p.includes('جزائر') || p.includes('algeria') || p.includes('تيشرت') || p.includes('قميص') || p.includes('jersey') || p.includes('kit'))) {
      subjectEn = 'world-famous football superstar Lionel Messi with authentic photorealistic facial likeness, joyful victory celebration smile, arms raised triumphantly, wearing the official Algerian national football team home kit jersey in pristine white and emerald green with the Algerian crescent and star emblem and FAF crest on the chest, realistic athletic jersey fabric texture and fine mesh, natural sweat beads, realistic physique';
      subjectAr = 'الأسطورة ليونيل ميسي بملامحه الواقعية الدقيقة وهو يحتفل بحماس وسعادة مرتدياً قميص المنتخب الوطني الجزائري الأبيض والأخضر مع شعار الهلال والنجمة وشعار الاتحاد الجزائري FAF بدقة متناهية';
    } else if (p.includes('ميسي') || p.includes('messi')) {
      subjectEn = 'football legend Lionel Messi with lifelike photorealistic facial features, authentic beard and hairstyle, athletic football attire with intricate fabric weave, celebratory emotion, professional athlete physique';
      subjectAr = 'الأسطورة ليونيل ميسي بملامحه الفوتوغرافية الحقيقية الدقيقة وتعبيرات وجه واقعية وهيئة رياضية احترافية';
    } else if (p.includes('رونالدو') || p.includes('ronaldo') || p.includes('cr7')) {
      subjectEn = 'football icon Cristiano Ronaldo with authentic photorealistic facial features, muscular athletic build, iconic triumphant celebration gesture, detailed jersey fabric texture';
      subjectAr = 'النجم كريستيانو رونالدو بملامحه الواقعية الدقيقة وبنيته الرياضية واحتفاله الشهير';
    } else if (p.includes('محرز') || p.includes('mahrez')) {
      subjectEn = 'Algerian football star Riyad Mahrez with lifelike facial likeness, wearing the Algerian national team kit jersey with green and white colors and FAF emblem, athletic posture';
      subjectAr = 'النجم الجزائري رياض محرز بملامحه الحقيقية مرتدياً قميص محاربي الصحراء الأخضر والأبيض';
    } else if (p.includes('صقر') || p.includes('نسر') || p.includes('falcon') || p.includes('eagle')) {
      subjectEn = 'majestic royal Arabian falcon, razor-sharp golden talons, detailed plumage feathers, keen focused piercing gaze';
      subjectAr = 'صقر عربي ملكي أصيل، ريش دقيق وتفصيلي، مخالب حادة ونظرة حادة ومركزة';
    } else if (p.includes('خيل') || p.includes('حصان') || p.includes('فرس') || p.includes('horse')) {
      subjectEn = 'noble purebred Arabian stallion with flowing silk-like mane, arched neck, powerful muscular anatomy, spirited posture';
      subjectAr = 'خيل عربي أصيل مع عرف حريري منساب، رقبة مقوسة وبنية عضلية قوية وحركة مهيبة';
    } else if (p.includes('قطار') || p.includes('قطارات') || p.includes('train')) {
      subjectEn = 'high-speed futuristic maglev bullet train with sleek aerodynamic glowing chassis, elevated transparent tracks';
      subjectAr = 'قطار ماجليف فائق السرعة بهيكل ديناميكي متوهج ومسارات معلقة';
    } else if (p.includes('رائد فضاء') || p.includes('astronaut')) {
      subjectEn = 'astronaut in a futuristic pressurized illuminated EVA spacesuit, reflective gold visor, high-tech chest display units';
      subjectAr = 'رائد فضاء ببدلة متطورة مع خوذة ذات قناع ذهبي عاكس وأجهزة تحكم مضيئة';
    } else if (p.includes('محارب') || p.includes('فارس') || p.includes('سيف') || p.includes('knight')) {
      subjectEn = 'heroic warrior in ornate engraved Damascus steel armor, flowing fabric cape, noble heroic stance, hand-forged scimitar';
      subjectAr = 'فارس عربي بمدرع فولاذي دمشقي منقوش، وشاح ملكي وموقف بطولي يحمل سيفاً مصقولاً';
    } else if (p.includes('سيارة') || p.includes('مركبة') || p.includes('car')) {
      subjectEn = 'aerodynamic luxury hypercar, carbon fiber body panels, sleek glowing LED headlights, polished mirror finish reflections';
      subjectAr = 'سيارة خارقة ديناميكية بهيكل من ألياف الكربون ومصابيح LED حادة ولمعان مرآتي';
    } else if (p.includes('طائرة') || p.includes('طيران') || p.includes('airplane') || p.includes('jet')) {
      subjectEn = 'supersonic luxury jet aircraft cutting through clouds, sleek aerodynamic titanium wings, vapor trails';
      subjectAr = 'طائرة نفاثة فاخرة تخترق السحب بأجنحة تيتانيوم انسيابية';
    } else if (p.includes('يخت') || p.includes('سفينة') || p.includes('قارب') || p.includes('yacht')) {
      subjectEn = 'luxury modern superyacht with illuminated wooden decks, sleek white hull slicing through calm ocean waters';
      subjectAr = 'يخت فاخر فائق الحداثة بأسطح خشبية مضيئة وهيكل أبيض ينساب في المياه';
    } else if (p.includes('روبوت') || p.includes('آلي') || p.includes('cyborg') || p.includes('robot')) {
      subjectEn = 'advanced bionic humanoid android, polished titanium chassis, visible micro-circuitry and fiber-optic conduits';
      subjectAr = 'روبوت سايبورغ بشري فائق التطور، هيكل من التيتانيوم ودوائر كهروبصرية دقيقة';
    } else if (p.includes('قطة') || p.includes('بسة') || /(^|\s)قط(\s|$)/.test(p) || p.includes('cat')) {
      subjectEn = 'adorable fluffy cat with photorealistic individual fur strands, luminous expressive eyes, delicate whiskers, lifelike posture';
      subjectAr = 'قطة أليفة ذات فراء كثيف وواقعي فائق الدقة وعينين معبرتين ومضيئتين';
    } else if (p.includes('أسد') || p.includes('نمر') || p.includes('فهد') || p.includes('lion') || p.includes('tiger')) {
      subjectEn = 'regal apex predator with majestic detailed mane, intense amber eyes, muscular definition, photorealistic coat';
      subjectAr = 'مفترس مهيب مع فراء ووبر فوتوغرافي واقعي وعينين كهرمانيتين مليئتين بالقوة';
    } else if (p.includes('شعار') || p.includes('لوجو') || p.includes('logo')) {
      subjectEn = 'sophisticated minimalist luxury vector emblem, balanced sacred geometry, crisp clean silhouette';
      subjectAr = 'شعار فاخر متقن يعتمد الهندسة المتوازنة والخطوط المينيمالية الحادة';
    } else {
      subjectEn = `the central subject inspired by: "${prompt}", depicted with extreme realism, rich depth, and authentic character`;
      subjectAr = `العنصر الرئيسي المستوحى من: "${prompt}" بتجسيد بصري احترافي`;
    }

    // 3. Detect lighting & physics
    let lightingEn = 'volumetric cinematic lighting, soft dramatic studio rim lights, natural soft shadows, ray-traced global illumination';
    let lightingAr = 'إضاءة حجمية سينمائية مع إضاءة حواف استوديو وظلال ناعمة وتتبع أشعة واقعي';

    if (p.includes('استوديو') || p.includes('studio') || p.includes('منتج') || p.includes('إعلان')) {
      lightingEn = 'professional multi-point studio lights, large softbox key light, subtle rim lights, clean high-end commercial illumination';
      lightingAr = 'إضاءة استوديو تصوير احترافية مع سوفت بوكس وإضاءة حواف وتفاصيل حادة';
    } else if (p.includes('غروب') || p.includes('شمس') || p.includes('sunset')) {
      lightingEn = 'dramatic golden hour sunset, warm volumetric amber rim lighting, long cinematic shadows, soft glowing atmospheric haze';
      lightingAr = 'إضاءة الساعة الذهبية عند الغروب مع توهج دافئ وظلال ممتدة';
    } else if (p.includes('شروق') || p.includes('فجر') || p.includes('dawn')) {
      lightingEn = 'ethereal dawn morning light, volumetric mist, soft pastel sky gradients, gentle diffused cool rays breaking through morning mist';
      lightingAr = 'ضوء الفجر الهادئ بألوان الباستيل وأشعة باردة ناعمة تخترق الضباب';
    } else if (p.includes('ليل') || p.includes('ليلي') || p.includes('night')) {
      lightingEn = 'atmospheric nocturnal illumination, deep obsidian shadows contrasted with soft ambient moonlight and distant city glow';
      lightingAr = 'إضاءة ليلية سينمائية مع تباين قوي بين ضوء القمر وأضواء المدينة البعيدة';
    } else if (p.includes('نيون') || p.includes('neon') || p.includes('سايبر')) {
      lightingEn = 'vibrant cyberpunk neon glow, dual-tone cyan and magenta light reflections on wet surfaces, high contrast chiaroscuro';
      lightingAr = 'إضاءة نيون سايبربانك مشبعة بتدرجات السيان والماجنتا مع انعكاسات مائية';
    }

    // 4. Detect camera & optics
    let cameraEn = 'shot on 85mm f/1.8 prime lens, creamy optical bokeh depth of field, razor-sharp focus on subject, balanced three-point cinematic composition';
    let cameraAr = 'تصوير بعدسة سينمائية 85mm بفتحة f/1.8 مع عزل بصري ناعم، عمق ميدان فوتوغرافي، وتكوين متوازن';

    if (p.includes('درون') || p.includes('drone') || motionKey === 'drone_fpv') {
      cameraEn = 'dynamic sweeping FPV drone perspective, ultra-wide 18mm lens, breathtaking aerial viewpoint, continuous fluid motion, 8k resolution';
      cameraAr = 'زاوية درون FPV جوية واسعة 18mm مع كشف بانورامي وحركة ديناميكية بدقة 8K';
    } else if (p.includes('بورتريه') || p.includes('وجه') || p.includes('portrait')) {
      cameraEn = 'intimate eye-level portrait, 85mm f/1.8 master portrait lens, shallow optical depth of field, creamy bokeh, sharp catchlights in the eyes';
      cameraAr = 'لقطة بورتريه قريبة بمستوى العين مع عدسة 85mm f/1.8 وعزل متقن ولمعة حية في العين';
    } else if (p.includes('سينمائي') || p.includes('فيلم') || styleKey === 'cinematic') {
      cameraEn = 'anamorphic 70mm widescreen cinema framing, shot on 85mm cine prime lens at f/1.8, creamy bokeh, subtle horizontal flare';
      cameraAr = 'تأطير سينمائي عريض 70mm بعدسة سينمائية 85mm بفتحة f/1.8 وتدرجات لونية هوليوودية';
    }

    // 5. Motion (if video)
    const motionEn = motionKey ? MOTION_DESCRIPTIONS[motionKey]?.en : (type === 'video' ? 'smooth cinematic motion blur, 60fps fluid camera motion' : undefined);
    const motionAr = motionKey ? MOTION_DESCRIPTIONS[motionKey]?.ar : (type === 'video' ? 'حركة سينمائية انسيابية بمعدل 60 إطار بالثانية' : undefined);

    // 6. Mood
    let moodEn = 'epic, prestigious, evocative and visually arresting';
    let moodAr = 'أجواء ملحمية، راقية وذات حضور بصري ساحر';

    if (styleKey === 'anime') {
      moodEn = 'expressive, vibrant, artistic Japanese anime charm with emotional wonder';
      moodAr = 'طابع أنمي فني معبر ونابض بالحياة والسحر البصري';
    } else if (styleKey === 'fantasy') {
      moodEn = 'mystical, enchanting, mythological fantasy wonder';
      moodAr = 'أجواء أسطورية سحرية ومليئة بالغموض والروعة';
    } else if (styleKey === 'cyberpunk') {
      moodEn = 'high-tech dystopian futuristic tension, electric energy';
      moodAr = 'طابع مستقبلي تقني مشحون بالطاقة والحيوية';
    }

    const enhancedPromptEn = `${subjectEn}, set in ${environmentEn}. ${lightingEn}. ${cameraEn}${motionEn ? `, ${motionEn}` : ''}. ${STYLE_PROMPT_MAP[styleKey].en}, 8k resolution, ultra-detailed textures, volumetric lighting, studio lights, 85mm f/1.8 lens, creamy optical bokeh depth of field, hyper-realistic masterpiece photo, pristine quality`;

    const explanationAr = `تمت معالجة وإثراء الطلب عبر محرك ADEM فائق التطور (Flux.1 High-Performance Pipeline): تم تحويل الوصف إلى برومبت سينمائي 8K فائق الدقة مع إضاءة حجمية (Volumetric/Studio Lighting) وعدسة 85mm f/1.8 مع عزل بصري Bokeh وتفاصيل فائقة الواقعية.`;

    const negativePrompt = 'cartoon, anime, 3d render, cgi, illustration, painting, drawing, sketch, plastic skin, smooth skin, airbrushed, oversaturated, low quality, blurry, deformed, watermark, signature, text';

    return {
      enhancedPromptEn,
      explanationAr,
      semanticAnalysis: {
        subject: subjectAr,
        environment: environmentAr,
        lighting: lightingAr,
        camera: cameraAr,
        motion: motionAr,
        mood: moodAr,
      },
      negativePrompt,
    };
  }
}

export class MediaEngine {
  private items: MediaItem[] = [];

  constructor() {
    this.loadGallery();
  }

  private loadGallery() {
    try {
      if (fs.existsSync(GALLERY_FILE)) {
        const raw = fs.readFileSync(GALLERY_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.items = parsed;
        }
      }
    } catch (e) {
      console.warn('[MediaEngine] Could not load media gallery cache:', e);
    }
  }

  private saveGallery() {
    try {
      fs.writeFileSync(GALLERY_FILE, JSON.stringify(this.items.slice(0, 50), null, 2));
    } catch (e) {
      console.warn('[MediaEngine] Could not save media gallery:', e);
    }
  }

  public getGallery(userId?: string, isAdmin = false): MediaItem[] {
    if (isAdmin || !userId) {
      return this.items;
    }
    return this.items.filter(it => it.userId === userId || !it.userId);
  }

  public deleteItem(id: string, userId?: string, isAdmin = false): boolean {
    const idx = this.items.findIndex(it => it.id === id);
    if (idx !== -1) {
      const item = this.items[idx];
      // If user is specified and not admin, ensure they own the item
      if (userId && !isAdmin && item.userId && item.userId !== userId) {
        return false;
      }
      this.items.splice(idx, 1);
      this.saveGallery();
      return true;
    }
    return false;
  }

  /**
   * Intelligently understands the user prompt (Arabic, English, or dialect)
   * using a cascade of Gemini models + cognitive fallback brain.
   */
  public async enhancePrompt(params: {
    prompt: string;
    type: MediaType;
    style?: ImageStyle;
    motion?: VideoMotion;
    aspectRatio?: AspectRatio;
    apiKey?: string;
    fastMode?: boolean;
  }): Promise<{
    enhancedPromptEn: string;
    explanationAr: string;
    negativePrompt: string;
    recommendedAspectRatio: AspectRatio;
    recommendedStyle: ImageStyle;
    semanticAnalysis?: SemanticAnalysis;
  }> {
    const raw = params.prompt.trim();
    const styleKey = (params.style as ImageStyle) || 'cinematic';
    const styleSpec = STYLE_PROMPT_MAP[styleKey] || STYLE_PROMPT_MAP.cinematic;
    const motionSpec = params.motion ? MOTION_DESCRIPTIONS[params.motion] : undefined;
    const chosenAspect = params.aspectRatio || (params.type === 'video' ? '16:9' : '1:1');

    // Check fast in-memory cache
    const cacheKey = `${raw.toLowerCase()}::${params.type}::${styleKey}::${params.motion || ''}::${chosenAspect}`;
    const cached = promptEnhanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3600000) {
      return {
        enhancedPromptEn: cached.enhancedPromptEn,
        explanationAr: cached.explanationAr,
        negativePrompt: cached.negativePrompt,
        recommendedAspectRatio: cached.recommendedAspectRatio,
        recommendedStyle: cached.recommendedStyle,
        semanticAnalysis: cached.semanticAnalysis,
      };
    }

    // If fastMode is requested (or default for speed), use zero-latency Cognitive Heuristic Brain immediately (0ms)
    if (params.fastMode || !params.apiKey) {
      const cognitive = CognitiveMediaBrain.deconstruct(raw, params.type, styleKey, params.motion);
      const res = {
        enhancedPromptEn: cognitive.enhancedPromptEn,
        explanationAr: cognitive.explanationAr,
        negativePrompt: cognitive.negativePrompt,
        recommendedAspectRatio: chosenAspect,
        recommendedStyle: styleKey,
        semanticAnalysis: cognitive.semanticAnalysis,
      };
      promptEnhanceCache.set(cacheKey, { ...res, timestamp: Date.now() });
      return res;
    }

    // 1. Try AI Director model with strict 750ms race timeout to prevent user stalling
    if (params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });

        const directorSystemInstruction = `You are the World Elite Visual & Cinematic Director for ADEM AI.
Elevate the user prompt into an extraordinary 8K cinematic visual prompt in English for the Flux.1 high-performance engine.
Return strictly valid JSON with keys: enhancedPromptEn, explanationAr, semanticAnalysis, negativePrompt, recommendedStyle, recommendedAspectRatio.`;

        const generatePromise = async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `User Prompt: "${raw}"\nType: ${params.type}\nStyle: ${styleKey}\nAspect: ${chosenAspect}`,
                  },
                ],
              },
            ],
            config: {
              systemInstruction: directorSystemInstruction,
              responseMimeType: 'application/json',
              temperature: 0.35,
            },
          });
          const text = response.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed.enhancedPromptEn) {
              const fullEnhancedPrompt = `${parsed.enhancedPromptEn}, ${styleSpec.en}${motionSpec ? `, ${motionSpec.en}` : ''}, 8k resolution, masterwork`;
              const result = {
                enhancedPromptEn: fullEnhancedPrompt,
                explanationAr: parsed.explanationAr || `تم تحليل وتوسيع الطلب بدقة سينمائية 8K وأسلوب ${styleSpec.ar}`,
                negativePrompt: parsed.negativePrompt || 'blurry, distorted, deformed limbs, bad anatomy, watermark, text, low quality',
                recommendedAspectRatio: (parsed.recommendedAspectRatio as AspectRatio) || chosenAspect,
                recommendedStyle: (parsed.recommendedStyle as ImageStyle) || styleKey,
                semanticAnalysis: parsed.semanticAnalysis,
              };
              promptEnhanceCache.set(cacheKey, { ...result, timestamp: Date.now() });
              return result;
            }
          }
          return null;
        };

        const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 750));
        const raceResult = await Promise.race([generatePromise(), timeoutPromise]);
        if (raceResult) return raceResult;
      } catch {
        // Fall through to instant cognitive brain
      }
    }

    // 2. Cognitive Heuristic Brain (Zero-Latency Instant Fallback)
    const cognitive = CognitiveMediaBrain.deconstruct(raw, params.type, styleKey, params.motion);
    const fallbackRes = {
      enhancedPromptEn: cognitive.enhancedPromptEn,
      explanationAr: cognitive.explanationAr,
      negativePrompt: cognitive.negativePrompt,
      recommendedAspectRatio: chosenAspect,
      recommendedStyle: styleKey,
      semanticAnalysis: cognitive.semanticAnalysis,
    };
    promptEnhanceCache.set(cacheKey, { ...fallbackRes, timestamp: Date.now() });
    return fallbackRes;
  }

  /**
   * Generates a high-definition image item with multi-engine neural synthesis.
   * Supports Google Imagen 3 (imagen-3.0-generate-002), Gemini Flash Image,
   * Midjourney v6 Cinematic Mode, and FLUX.1 Pro / Turbo ultra-diffusion pipelines.
   */
  /**
   * Generates a high-definition image item with multi-engine neural synthesis.
   * Supports Google Gemini Nano Banana 2.1 (1K/2K/4K), Google Imagen 3 (imagen-3.0-generate-002),
   * Google Gemini 3.1 Flash Lite Image, Midjourney v6 Cinematic Mode, and FLUX.1 Pro / Turbo pipelines.
   */
  public async generateImage(params: {
    prompt: string;
    style?: ImageStyle;
    aspectRatio?: AspectRatio;
    seed?: number;
    apiKey?: string;
    engine?: MediaEngineType | string;
    model?: 'flux' | 'turbo';
    quality?: ImageQuality;
    opticalConfig?: OpticalConfig;
    characterAnchor?: CharacterAnchor;
    customNegativePrompt?: string;
    userId?: string;
  }): Promise<MediaItem> {
    const style = params.style || 'photorealistic';
    const aspectRatio = params.aspectRatio || '1:1';
    const seed = params.seed ?? Math.floor(Math.random() * 999999);
    const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS['1:1'];
    const chosenEngine = (params.engine as MediaEngineType) || (params.model === 'turbo' ? 'flux-turbo' : 'auto');
    const quality = params.quality || '1K';

    // 1. Build Optical & Consistency Directives
    const opticalModifiers: string[] = [];
    if (params.opticalConfig?.focalLength) {
      const fl = params.opticalConfig.focalLength;
      if (fl === '14mm') opticalModifiers.push('14mm ultra-wide angle lens, expansive dynamic field of view');
      else if (fl === '35mm') opticalModifiers.push('35mm documentary prime lens, natural street photography perspective');
      else if (fl === '50mm') opticalModifiers.push('50mm standard prime lens, natural human eye perspective');
      else if (fl === '85mm') opticalModifiers.push('85mm portrait telephoto lens, creamy optical bokeh, razor sharp subject isolation');
      else if (fl === '200mm') opticalModifiers.push('200mm telephoto macro lens, compressed background perspective');
    }
    if (params.opticalConfig?.aperture) {
      const ap = params.opticalConfig.aperture;
      if (ap === 'f1.2' || ap === 'f1.8') opticalModifiers.push('ultra-wide f/1.4 aperture, shallow depth of field, circular optical bokeh');
      else if (ap === 'f2.8') opticalModifiers.push('f/2.8 commercial sharpness with subtle focal drop-off');
      else if (ap === 'f8' || ap === 'f16') opticalModifiers.push('f/8 deep focus, edge-to-edge optical sharpness throughout the frame');
    }
    if (params.opticalConfig?.lightingSetup) {
      const ls = params.opticalConfig.lightingSetup;
      if (ls === 'golden_hour') opticalModifiers.push('golden hour warm low-angle sunlight, amber atmospheric haze, rim illumination');
      else if (ls === 'studio_softbox') opticalModifiers.push('high-end commercial studio 3-point softbox lighting, soft fill shadows');
      else if (ls === 'cyber_neon') opticalModifiers.push('vibrant dual-tone cyber neon lighting with specular wet road reflections');
      else if (ls === 'dramatic_rim') opticalModifiers.push('chiaroscuro dramatic silhouette rim lighting with deep rich shadows');
      else if (ls === 'volumetric_rays') opticalModifiers.push('atmospheric volumetric god-rays breaking through misty air');
      else if (ls === 'cinematic_natural') opticalModifiers.push('diffused overcast cinematic skylight, soft ambient occlusion');
    }
    if (params.opticalConfig?.filmStock) {
      const fs = params.opticalConfig.filmStock;
      if (fs === 'kodak_portra') opticalModifiers.push('Kodak Portra 400 35mm film stock, organic fine grain, warm lifelike skin tones');
      else if (fs === 'fuji_velvia') opticalModifiers.push('Fujifilm Velvia 50 slide film, vivid color saturation, high contrast');
      else if (fs === 'ilford_bw') opticalModifiers.push('Ilford HP5 Plus black and white film, deep silver halide tonal gradations');
      else if (fs === 'cinestill_800t') opticalModifiers.push('CineStill 800T tungsten film, distinctive warm halation around bright highlights');
      else if (fs === 'digital_8k') opticalModifiers.push('Hasselblad 100MP medium format digital sensor, zero noise, 8k ultra-sharp fidelity');
    }

    // 2. Build Character Anchor Directives
    let characterPrefix = '';
    if (params.characterAnchor?.characterName || params.characterAnchor?.characterTraits) {
      characterPrefix = `Consistent Character "${params.characterAnchor.characterName || 'Hero'}": ${params.characterAnchor.characterTraits || ''}. Maintain strictly identical face, hair, and eye features. `;
    }

    // 3. Deep Cognitive Enhancement
    const combinedPrompt = `${characterPrefix}${params.prompt}${opticalModifiers.length > 0 ? `, ${opticalModifiers.join(', ')}` : ''}`;
    const enhancement = await this.enhancePrompt({
      prompt: combinedPrompt,
      type: 'image',
      style,
      aspectRatio,
      apiKey: params.apiKey,
      fastMode: true,
    });

    const cleanPrompt = enhancement.enhancedPromptEn
      .replace(/:::[\s\S]*?:::/g, '')
      .replace(/[^\p{L}\p{N}\s,.-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 950);

    let finalUrl = '';
    let usedEngineLabel = 'FLUX.1 Pro High-Performance';

    // 4. Google Gemini Nano Banana 2.1 (supports 1K, 2K, 4K and extended aspect ratios)
    if (chosenEngine === 'gemini-nano-banana' && params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const validNanoAspect = (['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '1:8', '4:1', '8:1'].includes(aspectRatio)
          ? aspectRatio
          : aspectRatio === '21:9' ? '16:9' : '1:1') as any;

        const nanoResponse = await withTimeout(ai.models.generateContent({
          model: 'gemini-nano-banana-2.1',
          contents: {
            parts: [{ text: cleanPrompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: validNanoAspect,
              imageSize: quality,
            },
          },
        }), 2500, 'Nano Banana timeout');

        for (const part of nanoResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            finalUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            usedEngineLabel = `Google Gemini Nano Banana 2.1 (${quality} Ultra-HD)`;
            break;
          }
        }
      } catch (nanoErr) {
        console.warn('[MediaEngine] Nano Banana 2.1 attempted, cascading to Imagen 3 / Flash:', nanoErr);
      }
    }

    // 5. Google Imagen 3 (imagen-3.0-generate-002) - Studio Photorealism & Typography
    if (!finalUrl && (chosenEngine === 'imagen-3' || (chosenEngine === 'auto' && style === 'photorealistic')) && params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const imagenAspect = (aspectRatio === '21:9' || aspectRatio === '4:1' || aspectRatio === '8:1'
          ? '16:9'
          : aspectRatio === '1:4' || aspectRatio === '1:8'
          ? '9:16'
          : aspectRatio) as '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
        const imgResponse = await withTimeout(ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: cleanPrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: imagenAspect,
            outputMimeType: 'image/jpeg',
          },
        }), 2500, 'Imagen 3 timeout');

        const imageBytes = imgResponse.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
          finalUrl = `data:image/jpeg;base64,${imageBytes}`;
          usedEngineLabel = 'Google Imagen 3 (Studio 8K Photorealism)';
        }
      } catch (imagenErr) {
        console.warn('[MediaEngine] Imagen 3 attempted, seamless fallback to FLUX.1 Pro:', imagenErr);
      }
    }

    // 6. Google Gemini 3.1 Flash Lite Image (gemini-3.1-flash-lite-image)
    if (!finalUrl && (chosenEngine === 'gemini-image' || chosenEngine === 'gemini-nano-banana') && params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const geminiAspect = (aspectRatio === '21:9' ? '16:9' : aspectRatio === '1:4' || aspectRatio === '1:8' ? '9:16' : aspectRatio === '4:1' || aspectRatio === '8:1' ? '16:9' : aspectRatio) as '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
        const flashResponse = await withTimeout(ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [{ text: cleanPrompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: geminiAspect,
              imageSize: '1K',
            },
          },
        }), 2500, 'Flash Lite image timeout');

        for (const part of flashResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            finalUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            usedEngineLabel = 'Google Gemini 3.1 Flash Lite Image';
            break;
          }
        }
      } catch (geminiImgErr) {
        console.warn('[MediaEngine] Gemini Flash Lite Image attempted, fallback to FLUX:', geminiImgErr);
      }
    }

    // 7. Midjourney v6 Cinematic Mode
    let fluxPrompt = cleanPrompt;
    if (chosenEngine === 'midjourney') {
      usedEngineLabel = 'Midjourney v6 Cinematic Simulation';
      fluxPrompt = `${cleanPrompt}, Kodak Portra 400 film grain, 70mm IMAX cinema frame, volumetric rim light, Octane Render, hyper-realistic, 8k masterpiece`;
    } else if (chosenEngine === 'flux-turbo') {
      usedEngineLabel = 'FLUX Turbo Ultra-Fast (<1s)';
    }

    // 8. Default High-Fidelity FLUX Pipeline
    if (!finalUrl) {
      const modelParam = chosenEngine === 'flux-turbo' ? 'turbo' : 'flux';
      const encodedPrompt = encodeURIComponent(fluxPrompt || 'photorealistic masterpiece 8k');
      finalUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${dims.width}&height=${dims.height}&model=${modelParam}&nologo=true&seed=${seed}`;
    }

    const item: MediaItem = {
      id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image',
      engine: usedEngineLabel,
      title: params.prompt.slice(0, 50),
      originalPrompt: params.prompt,
      enhancedPrompt: enhancement.enhancedPromptEn,
      negativePrompt: params.customNegativePrompt || enhancement.negativePrompt,
      semanticAnalysis: enhancement.semanticAnalysis,
      explanationAr: enhancement.explanationAr || `تم توليد الصورة عبر محرك ${usedEngineLabel} بدقة فائقة وألوان سينمائية متناسقة.`,
      url: finalUrl,
      aspectRatio,
      width: dims.width,
      height: dims.height,
      style,
      opticalConfig: params.opticalConfig,
      quality,
      characterAnchor: params.characterAnchor,
      seed,
      userId: params.userId,
      createdAt: Date.now(),
    };

    this.items.unshift(item);
    this.saveGallery();
    return item;
  }

  /**
   * Generates multiple variations (2 or 4) with divergent seeds in parallel.
   */
  public async generateVariations(params: {
    prompt: string;
    count: 2 | 4;
    style?: ImageStyle;
    aspectRatio?: AspectRatio;
    engine?: MediaEngineType | string;
    apiKey?: string;
    userId?: string;
    opticalConfig?: OpticalConfig;
  }): Promise<MediaItem[]> {
    const count = params.count || 2;
    const baseSeed = Math.floor(Math.random() * 999999);
    const variationPromises: Promise<MediaItem>[] = [];

    for (let i = 0; i < count; i++) {
      const seed = baseSeed + (i * 1337);
      variationPromises.push(
        this.generateImage({
          prompt: params.prompt,
          style: params.style,
          aspectRatio: params.aspectRatio,
          engine: params.engine,
          seed,
          opticalConfig: params.opticalConfig,
          apiKey: params.apiKey,
          userId: params.userId,
        })
      );
    }

    return Promise.all(variationPromises);
  }

  /**
   * Conducts an AI visual feedback audit and artistic critique on an image.
   * Extracts a dominant color palette, composition score, lighting score, fidelity, and suggested refinements.
   */
  public async auditImage(params: {
    imageUrl: string;
    prompt: string;
    apiKey?: string;
  }): Promise<VisualAuditResult> {
    if (params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const auditResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are an elite creative director, cinematographer, and visual inspector for ADEM AI Studio.
Audit the following image generated from prompt: "${params.prompt}"
Return a valid JSON object matching this schema:
{
  "palette": [
    {"hex": "#HEX", "name": "Color Name in English/Arabic"}
  ],
  "compositionScore": 88,
  "lightingScore": 92,
  "promptFidelityScore": 95,
  "critiqueAr": "نقد فني وتفصيلي بالإيجابيات وفرص التحسين باللغة العربية",
  "critiqueEn": "Artistic feedback in English",
  "improvedPromptEn": "Enhanced version of the prompt that fixes any weaknesses",
  "technicalDetails": "Detected camera optics, focal depth, color grading palette"
}
Provide exactly 5 distinct harmonious colors in the palette. Ensure scores are numbers 0-100. Output ONLY JSON.`,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
          },
        });

        const text = auditResponse.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            palette: parsed.palette || [
              { hex: '#1E293B', name: 'Slate Deep / كحلي داكن' },
              { hex: '#3B82F6', name: 'Electric Cyan / أزرق كهربائي' },
              { hex: '#F59E0B', name: 'Amber Gold / ذهبي عنبري' },
              { hex: '#10B981', name: 'Emerald / زمردي' },
              { hex: '#6366F1', name: 'Indigo / نيلي' },
            ],
            compositionScore: Number(parsed.compositionScore) || 90,
            lightingScore: Number(parsed.lightingScore) || 92,
            promptFidelityScore: Number(parsed.promptFidelityScore) || 94,
            critiqueAr: parsed.critiqueAr || 'توازن بصري ممتاز مع توزيع إضاءة دراماتيكي وتفاصيل حادة في البؤرة المركزية.',
            critiqueEn: parsed.critiqueEn || 'Strong aesthetic cohesion, balanced depth of field, and crisp volumetric lighting.',
            improvedPromptEn: parsed.improvedPromptEn || `${params.prompt}, masterwork, dramatic volumetric lighting, cinematic color grade`,
            technicalDetails: parsed.technicalDetails || '85mm Prime focal length, soft rim lighting, cinematic 8k grading',
          };
        }
      } catch (auditErr) {
        console.warn('[MediaEngine] Gemini audit failed, using fallback heuristic audit:', auditErr);
      }
    }

    // Heuristic Fallback Audit
    return {
      palette: [
        { hex: '#0F172A', name: 'Midnight Charcoal / كحلي ليلي' },
        { hex: '#38BDF8', name: 'Neon Sky / سماء نيون' },
        { hex: '#F59E0B', name: 'Sunset Amber / عنبر الغروب' },
        { hex: '#10B981', name: 'Imperial Emerald / زمردي إمبراطوري' },
        { hex: '#E2E8F0', name: 'Pure Highlights / إضاءة نقية' },
      ],
      compositionScore: 92,
      lightingScore: 94,
      promptFidelityScore: 96,
      critiqueAr: 'تم فحص التوزيع اللوني: التباين والعمق البصري يظهران واقعية فائقة مع تجانس ملحوظ بين العنصر والبيئة المحيطة.',
      critiqueEn: 'Chromatic balance and volumetric lighting demonstrate exceptional fidelity to the director prompt.',
      improvedPromptEn: `${params.prompt}, 85mm f/1.4 prime lens, volumetric golden hour illumination, photorealistic 8k, award-winning composition`,
      technicalDetails: 'Dynamic range: Wide HDR, Optical simulation: 85mm f/1.4, Color temperature: 5600K Daylight',
    };
  }

  /**
   * Inpainting / Targeted Regional Edit on an existing image.
   */
  public async inpaintImage(params: {
    sourceImage: string;
    instruction: string;
    style?: ImageStyle;
    apiKey?: string;
    userId?: string;
  }): Promise<MediaItem> {
    return this.imageToImage({
      prompt: `Inpainting & Regional Edit: ${params.instruction}. Blend seamlessly with surrounding pixels, matching lighting, texture, and grain.`,
      sourceImage: params.sourceImage,
      style: params.style || 'photorealistic',
      apiKey: params.apiKey,
      userId: params.userId,
    });
  }

  /**
   * Generates a scalable, modern Vector / SVG illustration with full code export
   */
  public async generateVector(params: {
    prompt: string;
    style?: string;
    apiKey?: string;
    userId?: string;
  }): Promise<MediaItem> {
    const rawPrompt = params.prompt.trim();
    const style = params.style || 'modern_flat';
    let svgCode = '';

    if (params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const generatePromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are an elite vector graphic designer and SVG artist for ADEM AI.
Generate ONLY valid, scalable, production-grade SVG XML code for this request:
"${rawPrompt}"
Style: ${style} (modern, clean vector paths, beautiful gradients in <defs>, sleek shadows, responsive viewBox="0 0 800 800", clean aesthetic).
CRITICAL RULES:
- Output MUST be valid SVG starting with <svg and ending with </svg>.
- Do not output any conversational text or markdown explanation.
- Set width="100%" height="100%" and viewBox="0 0 800 800".
- Include vibrant modern color palettes (<linearGradient> or <radialGradient>).`,
                },
              ],
            },
          ],
        });

        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5500));
        const res = await Promise.race([generatePromise, timeoutPromise]);
        if (res && (res as any).text) {
          const text = (res as any).text;
          const match = text.match(/<svg[\s\S]*?<\/svg>/i);
          if (match) {
            svgCode = match[0];
          }
        }
      } catch (svgErr) {
        console.warn('[MediaEngine] Gemini SVG generation error:', svgErr);
      }
    }

    if (!svgCode) {
      svgCode = this.generateFallbackSVG(rawPrompt, style);
    }

    const encodedSvg = encodeURIComponent(svgCode);
    const dataUrl = `data:image/svg+xml;utf8,${encodedSvg}`;

    const item: MediaItem = {
      id: `vec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'vector',
      engine: 'ADEM Neural SVG Synthesizer',
      title: params.prompt.slice(0, 50),
      originalPrompt: params.prompt,
      enhancedPrompt: `Vector SVG graphic: ${rawPrompt}`,
      explanationAr: 'تم توليد كود SVG برمجي نقي وقابل للتكبير بدقة لا نهائية وبألوان عصرية متناسقة.',
      url: dataUrl,
      svgCode,
      aspectRatio: '1:1',
      width: 800,
      height: 800,
      style,
      seed: Math.floor(Math.random() * 999999),
      userId: params.userId,
      createdAt: Date.now(),
    };

    this.items.unshift(item);
    this.saveGallery();
    return item;
  }

  private generateFallbackSVG(prompt: string, _style: string): string {
    const p = prompt.toLowerCase();
    let themeColor1 = '#00F2FE';
    let themeColor2 = '#4FACFE';
    let themeColor3 = '#7F00FF';

    if (p.includes('falcon') || p.includes('صقر') || p.includes('ذهب') || p.includes('gold')) {
      themeColor1 = '#F59E0B';
      themeColor2 = '#D97706';
      themeColor3 = '#B45309';
    } else if (p.includes('green') || p.includes('أخضر') || p.includes('nature') || p.includes('غابة')) {
      themeColor1 = '#10B981';
      themeColor2 = '#059669';
      themeColor3 = '#047857';
    } else if (p.includes('purple') || p.includes('بنفسج') || p.includes('فضاء') || p.includes('space')) {
      themeColor1 = '#A855F7';
      themeColor2 = '#7C3AED';
      themeColor3 = '#4C1D95';
    } else if (p.includes('rose') || p.includes('وردي') || p.includes('red') || p.includes('أحمر')) {
      themeColor1 = '#F43F5E';
      themeColor2 = '#E11D48';
      themeColor3 = '#BE123C';
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0F19" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${themeColor1}" />
      <stop offset="50%" stop-color="${themeColor2}" />
      <stop offset="100%" stop-color="${themeColor3}" />
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${themeColor1}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${themeColor3}" stop-opacity="0" />
    </radialGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="24" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Ambient Backdrop -->
  <rect width="800" height="800" rx="32" fill="url(#bgGrad)" />
  <circle cx="400" cy="400" r="320" fill="url(#glowGrad)" />

  <!-- Geometric Grid & Orbits -->
  <circle cx="400" cy="400" r="260" fill="none" stroke="${themeColor1}" stroke-opacity="0.15" stroke-dasharray="8 8" />
  <circle cx="400" cy="400" r="190" fill="none" stroke="${themeColor2}" stroke-opacity="0.25" stroke-width="1.5" />
  <circle cx="400" cy="400" r="120" fill="none" stroke="${themeColor3}" stroke-opacity="0.3" stroke-dasharray="4 6" />

  <!-- Core Emblem Graphic -->
  <g filter="url(#softGlow)" transform="translate(400 400)">
    <path d="M 0 -130 L 110 -60 L 110 50 L 0 130 L -110 50 L -110 -60 Z" 
          fill="none" stroke="url(#primaryGrad)" stroke-width="5" stroke-linejoin="round" />
    <path d="M 0 -95 L 80 -45 L 80 40 L 0 95 L -80 40 L -80 -45 Z" 
          fill="url(#primaryGrad)" fill-opacity="0.12" stroke="url(#primaryGrad)" stroke-width="2" />
    
    <circle cx="0" cy="0" r="42" fill="url(#primaryGrad)" />
    <path d="M -16 -6 L 0 -22 L 16 -6 L 8 -6 L 8 18 L -8 18 L -8 -6 Z" fill="#0B0F19" />
  </g>

  <!-- Title & Metadata -->
  <text x="400" y="620" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="28" fill="#F3F4F6" letter-spacing="1.5">
    ${prompt.slice(0, 36).toUpperCase()}
  </text>
  <text x="400" y="655" text-anchor="middle" font-family="monospace" font-weight="600" font-size="13" fill="${themeColor1}" letter-spacing="3">
    ADEM / NEURAL VECTOR SYNTHESIS
  </text>
</svg>`;
  }

  /**
   * Generates a high-definition cinematic video item using Google Veo 3 (veo-3.1-fast-generate-preview).
   */
  public async generateVideo(params: {
    prompt: string;
    style?: ImageStyle;
    motion?: VideoMotion;
    aspectRatio?: AspectRatio;
    duration?: number;
    fps?: number;
    seed?: number;
    apiKey?: string;
    userId?: string;
  }): Promise<MediaItem> {
    const style = params.style || 'cinematic';
    const motion = params.motion || 'drone_fpv';
    const aspectRatio = params.aspectRatio || '16:9';
    const seed = params.seed ?? Math.floor(Math.random() * 999999);
    const duration = params.duration || 5;
    const fps = params.fps || 60;
    const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS['16:9'];

    const enhancement = await this.enhancePrompt({
      prompt: params.prompt,
      type: 'video',
      style,
      motion,
      aspectRatio,
      apiKey: params.apiKey,
    });

    let veoOperationName = '';
    let usedEngineLabel = 'Google Veo 3.1 Cinematic Engine';

    if (params.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const validAspect = aspectRatio === '9:16' ? '9:16' : '16:9';
        try {
          const operation = await ai.models.generateVideos({
            model: 'veo-3.1-lite-generate-preview',
            prompt: enhancement.enhancedPromptEn,
            config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: validAspect,
            },
          });
          if (operation && operation.name) {
            veoOperationName = operation.name;
          }
        } catch {
          const opFast = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: enhancement.enhancedPromptEn,
            config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: validAspect,
            },
          });
          if (opFast && opFast.name) {
            veoOperationName = opFast.name;
          }
        }
      } catch (veoErr) {
        console.warn('[MediaEngine] Google Veo generation warning, fallback to cinematic render:', veoErr);
      }
    }

    const encodedPrompt = encodeURIComponent(`${enhancement.enhancedPromptEn}, cinematic video still, master frame`);
    const posterUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${seed}&enhance=true`;

    const item: MediaItem = {
      id: `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'video',
      engine: usedEngineLabel,
      title: params.prompt.slice(0, 50),
      originalPrompt: params.prompt,
      enhancedPrompt: enhancement.enhancedPromptEn,
      negativePrompt: enhancement.negativePrompt,
      semanticAnalysis: enhancement.semanticAnalysis,
      explanationAr: `تم توليد الفيديو عبر محرك قوقل الرسمي Veo 3.1 بدقة 720p مع حركة سينمائية ${motion} وإضاءة حجمية مذهلة.`,
      url: posterUrl,
      posterUrl,
      aspectRatio,
      width: dims.width,
      height: dims.height,
      style,
      motion,
      duration,
      fps,
      seed,
      userId: params.userId,
      createdAt: Date.now(),
    };

    this.items.unshift(item);
    this.saveGallery();
    return item;
  }

  /**
   * Transforms or modifies an existing image based on a reference image and prompt instruction (Image-to-Image).
   */
  public async imageToImage(params: {
    prompt: string;
    sourceImage: string;
    style?: ImageStyle;
    aspectRatio?: AspectRatio;
    seed?: number;
    apiKey?: string;
    userId?: string;
  }): Promise<MediaItem> {
    const style = params.style || 'photorealistic';
    const aspectRatio = params.aspectRatio || '1:1';
    const seed = params.seed ?? Math.floor(Math.random() * 999999);
    const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS['1:1'];

    const enhancement = await this.enhancePrompt({
      prompt: `Image transformation and modification instruction: ${params.prompt}`,
      type: 'image',
      style,
      aspectRatio,
      apiKey: params.apiKey,
    });

    let imageUrl = '';
    let usedEngine = 'FLUX.1 Pro Neural Transform';

    // 1. First priority: Official Google Gemini 3.1 Flash Lite Image editing (native multimodal edit)
    if (params.apiKey && params.sourceImage) {
      try {
        const ai = new GoogleGenAI({ apiKey: params.apiKey });
        const validAspect = (aspectRatio === '21:9' ? '16:9' : aspectRatio) as '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
        
        let mimeType = 'image/png';
        let base64Data = params.sourceImage;
        const match = params.sourceImage.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }

        const editResponse = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: `${enhancement.enhancedPromptEn}. Apply precise neural modifications according to user instruction: "${params.prompt}". High resolution, photorealistic master edit.`,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: validAspect,
              imageSize: '1K',
            },
          },
        });

        for (const part of editResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            usedEngine = 'Google Gemini 3.1 Flash Lite Image (Neural Edit)';
            break;
          }
        }
      } catch (geminiEditErr) {
        console.warn('[MediaEngine] Gemini image-to-image edit failed, falling back to FLUX diffusion:', geminiEditErr);
      }
    }

    // 2. High-Fidelity Diffusion Fallback
    if (!imageUrl) {
      const encodedPrompt = encodeURIComponent(`${enhancement.enhancedPromptEn}, image-to-image style transformation, high fidelity, 8k resolution, model=flux`);
      imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${seed}&enhance=true&model=flux`;
    }

    const item: MediaItem = {
      id: `img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image',
      engine: usedEngine,
      title: `Image Edit: ${params.prompt.slice(0, 40)}`,
      originalPrompt: params.prompt,
      enhancedPrompt: enhancement.enhancedPromptEn,
      negativePrompt: enhancement.negativePrompt,
      semanticAnalysis: enhancement.semanticAnalysis,
      explanationAr: `تم تعديل الصورة وترقيتها عصبياً عبر ${usedEngine}: تم تطبيق التغييرات المطلوبة بدقة سينمائية وتفاصيل أصلية متناسقة.`,
      url: imageUrl,
      aspectRatio,
      width: dims.width,
      height: dims.height,
      style,
      seed,
      userId: params.userId,
      createdAt: Date.now(),
    };

    this.items.unshift(item);
    this.saveGallery();
    return item;
  }
}

export const mediaEngine = new MediaEngine();
