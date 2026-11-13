import { GoogleGenAI, Type } from '@google/genai';
import { secretsManager } from '../security/secrets';
import { synthesizeApp } from '../../src/core/agent/gameAppSynthesizer';

export interface GenerateAppRequest {
  prompt: string;
  category?: 'game' | 'app' | 'tool';
  language?: 'ar' | 'en';
}

export interface GeneratedAppResponse {
  id: string;
  title: string;
  titleEn: string;
  category: 'game' | 'app' | 'tool';
  prompt: string;
  code: string;
  features: string[];
}

export class AppGeneratorEngine {
  /**
   * Generates a complete, functional, single-file HTML5/CSS/JS interactive application or game
   * dynamically using Gemini 3.8 Flash, tailored precisely to the user's prompt.
   */
  public static async generateApp(req: GenerateAppRequest): Promise<GeneratedAppResponse> {
    const rawApiKey = secretsManager.getGeminiApiKey();
    const prompt = (req.prompt || '').trim();
    const isAr = req.language !== 'en';
    const appId = `adem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (rawApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: rawApiKey });

        const systemInstruction = `You are ADEM's Autonomous Full-Stack Application & Interactive Game Synthesis Engine.
Your mission is to generate a 100% complete, fully working, beautiful, responsive, single-file HTML5/CSS3/JavaScript application, tool, or game precisely tailored to the user's prompt: "${prompt}".

CRITICAL RULES:
1. Return ONLY valid JSON matching the schema.
2. The "code" field MUST be a complete <!DOCTYPE html> document with all CSS in <style> and JavaScript in <script>.
3. Design Quality: Luxury, modern dark-mode aesthetic (#0b0f19 background, neon/emerald/cyan accents, glassmorphic panels, responsive flex/grid layout, smooth CSS transitions, mobile touch & desktop keyboard support).
4. Zero Mock, Zero Placeholder: All buttons, forms, controls, canvas, or game loops must be 100% functional and interactive.
5. Provide real working logic: state persistence (localStorage), calculations, custom rules matching user prompt, or audio effects via Web Audio API if suitable.
6. Language: If the prompt is in Arabic, all labels, instructions, and messages inside the app must be in fluent, polished Arabic (RTL). If in English or other languages, match that language.`;

        const userPrompt = `User Exact Request: "${prompt}"
App Type / Category Preference: ${req.category || 'auto-detect'}
Language Preference: ${isAr ? 'Arabic (العربية)' : 'English'}`;

        const generatePromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Display title of the application in the prompt language reflecting user request' },
                titleEn: { type: Type.STRING, description: 'English title of the application' },
                category: { type: Type.STRING, description: "'app' | 'tool' | 'game'" },
                features: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'List of 3 to 5 prominent features implemented in the code'
                },
                code: { type: Type.STRING, description: 'The complete, runnable <!DOCTYPE html> single-file source code implementing the user prompt' }
              },
              required: ['title', 'titleEn', 'category', 'features', 'code']
            },
            temperature: 0.4,
          }
        });

        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('AI Generation Timeout')), 25000)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);

        if (response.text) {
          const parsed = JSON.parse(response.text);
          if (parsed && parsed.code && parsed.code.includes('<!DOCTYPE html>')) {
            return {
              id: appId,
              title: parsed.title || prompt.slice(0, 35),
              titleEn: parsed.titleEn || 'Custom Interactive Application',
              category: (['game', 'app', 'tool'].includes(parsed.category) ? parsed.category : 'app') as 'game' | 'app' | 'tool',
              prompt,
              code: parsed.code,
              features: Array.isArray(parsed.features) ? parsed.features : ['Custom Logic', 'Interactive UI', 'Responsive Design'],
            };
          }
        }
      } catch (err) {
        console.warn('[AppGeneratorEngine] Gemini generation warning, using tailored procedural synthesizer:', err);
      }
    }

    // Dynamic Tailored Procedural Fallback Engine with user prompt integration
    const localResult = synthesizeApp({ prompt, category: req.category });
    // Customize title with user prompt to ensure it reflects their request
    const customTitle = prompt.length > 3 ? prompt.slice(0, 40) : localResult.title;
    
    // Inject custom title into code HTML
    const customizedCode = localResult.code.replace(/<title>.*?<\/title>/i, `<title>${customTitle}</title>`);

    return {
      id: appId,
      title: customTitle,
      titleEn: localResult.titleEn,
      category: localResult.category,
      prompt,
      code: customizedCode,
      features: [prompt.slice(0, 50), ...localResult.features.slice(0, 3)],
    };
  }
}
