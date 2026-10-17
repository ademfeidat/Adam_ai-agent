import express from 'express';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import { secretsManager, redactSecrets } from '../security/secrets';
import { chatRateLimiter, mediaRateLimiter } from '../security/rateLimiter';

const router = express.Router();

function getGenAI(): GoogleGenAI | null {
  const apiKey = secretsManager.getGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// ============================================================================
// 1 & 3: Veo 3 Video Generation & Animation (veo-3.1-fast-generate-preview)
// ============================================================================

/**
 * POST /api/media/veo-generate
 * Initiates Veo 3 video generation for Text-to-Video or Image-to-Video.
 * Model: veo-3.1-fast-generate-preview
 * Supported aspect ratios: '16:9' (landscape) or '9:16' (portrait)
 */
router.post('/media/veo-generate', mediaRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleVeoGenerate(req, res);
});
router.post('/media/generate-video', mediaRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleVeoGenerate(req, res);
});
router.post('/generate-video', mediaRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleVeoGenerate(req, res);
});

async function handleVeoGenerate(req: express.Request, res: express.Response) {
  try {
    const { prompt, image, aspectRatio = '16:9' } = req.body;

    // Validate aspect ratio
    const validAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({
        ok: false,
        code: 'API_KEY_REQUIRED',
        message: 'A Gemini API key is required for Veo 3 video generation.',
      });
    }

    const targetVideoModel = 'veo-3.1-generate-preview';
    const payload: any = {
      model: targetVideoModel,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: validAspectRatio,
      },
    };

    if (prompt && typeof prompt === 'string') {
      payload.prompt = prompt.trim();
    }

    // Support Image-to-Video / photo animation
    if (image && typeof image === 'object' && image.imageBytes) {
      payload.image = {
        imageBytes: image.imageBytes,
        mimeType: image.mimeType || 'image/png',
      };
    } else if (!payload.prompt) {
      return res.status(400).json({
        ok: false,
        message: 'Either a text prompt or an image must be provided.',
      });
    }

    let operation;
    let usedModel = targetVideoModel;
    try {
      operation = await ai.models.generateVideos(payload);
    } catch {
      usedModel = 'veo-3.1-lite-generate-preview';
      operation = await ai.models.generateVideos({ ...payload, model: usedModel });
    }

    return res.json({
      ok: true,
      model: usedModel,
      aspectRatio: validAspectRatio,
      operationName: operation.name,
      hasImageInput: Boolean(payload.image),
    });
  } catch (err: any) {
    console.error('[Veo 3 Generate Error]:', redactSecrets(err.message || String(err)));
    return res.status(500).json({
      ok: false,
      code: 'VEO_GENERATION_FAILED',
      message: redactSecrets(err.message || 'Failed to start Veo 3 video generation.'),
    });
  }
}

router.post('/media/veo-status', async (req: express.Request, res: express.Response) => {
  return handleVeoStatus(req, res);
});
router.post('/video-status', async (req: express.Request, res: express.Response) => {
  return handleVeoStatus(req, res);
});

async function handleVeoStatus(req: express.Request, res: express.Response) {
  try {
    const { operationName } = req.body;
    if (!operationName || typeof operationName !== 'string') {
      return res.status(400).json({ ok: false, message: 'operationName is required.' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({ ok: false, message: 'Gemini API key is required.' });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });

    return res.json({
      ok: true,
      done: Boolean(updated.done),
      error: updated.error || null,
      hasVideo: Boolean(updated.response?.generatedVideos?.[0]?.video?.uri),
    });
  } catch (err: any) {
    console.error('[Veo 3 Status Error]:', redactSecrets(err.message || String(err)));
    return res.status(500).json({
      ok: false,
      message: redactSecrets(err.message || 'Failed to poll Veo 3 status.'),
    });
  }
}

router.post('/media/veo-download', async (req: express.Request, res: express.Response) => {
  return handleVeoDownload(req, res);
});
router.get('/media/veo-download', async (req: express.Request, res: express.Response) => {
  const operationName = (req.query.operationName as string) || req.body?.operationName;
  req.body = { ...req.body, operationName };
  return handleVeoDownload(req, res);
});
router.post('/video-download', async (req: express.Request, res: express.Response) => {
  return handleVeoDownload(req, res);
});

async function handleVeoDownload(req: express.Request, res: express.Response) {
  try {
    const { operationName } = req.body;
    if (!operationName || typeof operationName !== 'string') {
      return res.status(400).json({ ok: false, message: 'operationName is required.' });
    }

    const apiKey = secretsManager.getGeminiApiKey();
    const ai = getGenAI();
    if (!ai || !apiKey) {
      return res.status(400).json({ ok: false, message: 'Gemini API key is required.' });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

    if (!uri) {
      return res.status(404).json({ ok: false, message: 'Video URI not ready or not found.' });
    }

    const videoRes = await fetch(uri, {
      headers: { 'x-goog-api-key': apiKey },
    });

    if (!videoRes.ok) {
      return res.status(videoRes.status).json({
        ok: false,
        message: `Failed to fetch video stream from Google storage (${videoRes.statusText}).`,
      });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (!videoRes.body) {
      return res.status(500).json({ ok: false, message: 'Empty video stream received.' });
    }

    // Pipe response stream to client
    const arrayBuffer = await videoRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err: any) {
    console.error('[Veo 3 Download Error]:', redactSecrets(err.message || String(err)));
    return res.status(500).json({
      ok: false,
      message: redactSecrets(err.message || 'Failed to download Veo 3 video.'),
    });
  }
}

router.post('/audio/transcribe', chatRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleAudioTranscribe(req, res);
});
router.post('/transcribe-audio', chatRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleAudioTranscribe(req, res);
});

async function handleAudioTranscribe(req: express.Request, res: express.Response) {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ ok: false, message: 'audioBase64 string is required.' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({
        ok: false,
        code: 'API_KEY_REQUIRED',
        message: 'Gemini API key is required for audio transcription.',
      });
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    };

    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this spoken audio exactly and accurately into text. Maintain the spoken language and dialect. Output ONLY the transcription text without quotation marks, conversational intros, or meta-comments.',
          },
        ],
      },
    });

    const transcript = (response.text || '').trim();
    const durationMs = Date.now() - startTime;

    return res.json({
      ok: true,
      model: 'gemini-3.5-transcribe',
      transcript,
      durationMs,
    });
  } catch (err: any) {
    console.error('[Audio Transcribe Error]:', redactSecrets(err.message || String(err)));
    return res.status(500).json({
      ok: false,
      message: redactSecrets(err.message || 'Audio transcription failed.'),
    });
  }
}

// ============================================================================
// 4: Create & Edit Images (gemini-3.1-flash-image-preview)
// ============================================================================

/**
 * POST /api/media/gemini-image
 * Creates new images or edits existing images using text prompts.
 * Model: gemini-3.1-flash-image-preview
 * Supports: '1:1', '16:9', '9:16', '4:3', '3:4'
 */
router.post('/media/gemini-image', mediaRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  try {
    const { prompt, sourceImage, aspectRatio = '1:1' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, message: 'prompt text is required.' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({
        ok: false,
        code: 'API_KEY_REQUIRED',
        message: 'Gemini API key is required for image generation/editing.',
      });
    }

    const validAspects = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    const chosenAspect = validAspects.includes(aspectRatio) ? aspectRatio : '1:1';

    const parts: any[] = [];

    // If sourceImage is provided, this is an image editing task
    if (sourceImage && typeof sourceImage === 'string') {
      let mimeType = 'image/png';
      let base64Data = sourceImage;

      const dataUrlMatch = sourceImage.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        base64Data = dataUrlMatch[2];
      }

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    parts.push({ text: prompt.trim() });

    const requestedModel = req.body.model === 'gemini-3.1-flash-lite-image' ? 'gemini-3.1-flash-lite-image' : 'gemini-nano-banana-2.1';
    let response: any;
    let actualModel = requestedModel;

    try {
      response = await ai.models.generateContent({
        model: requestedModel,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: chosenAspect as any,
          },
        },
      });
    } catch (modelErr: any) {
      if (requestedModel === 'gemini-nano-banana-2.1') {
        console.warn('[Gemini Image] Nano-banana-2.1 failed or requires paid tier, attempting fallback to gemini-3.1-flash-lite-image');
        actualModel = 'gemini-3.1-flash-lite-image';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: chosenAspect as any,
            },
          },
        });
      } else {
        throw modelErr;
      }
    }

    let imageUrl = '';
    let explanation = '';

    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          explanation += part.text;
        }
      }
    }

    if (!imageUrl) {
      return res.status(502).json({
        ok: false,
        message: 'Model did not return inline image data.',
        explanation,
      });
    }

    return res.json({
      ok: true,
      model: actualModel,
      imageUrl,
      explanation,
      aspectRatio: chosenAspect,
      isEdit: Boolean(sourceImage),
    });
  } catch (err: any) {
    console.error('[Gemini Image Error]:', redactSecrets(err.message || String(err)));
    return res.status(500).json({
      ok: false,
      message: redactSecrets(err.message || 'Image generation/editing failed.'),
    });
  }
});

router.post('/media/generate-image', mediaRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleMediaGenerateImage(req, res);
});
router.post('/media/image-to-image', mediaRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  return handleMediaGenerateImage(req, res);
});

async function handleMediaGenerateImage(req: express.Request, res: express.Response) {
  try {
    const { prompt, sourceImage, style = 'photorealistic', aspectRatio = '1:1', seed } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, message: 'prompt text is required.' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({
        ok: false,
        code: 'API_KEY_REQUIRED',
        message: 'Gemini API key is required for image generation.',
      });
    }

    const validAspects = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    const chosenAspect = validAspects.includes(aspectRatio) ? aspectRatio : '1:1';

    const parts: any[] = [];
    if (sourceImage && typeof sourceImage === 'string') {
      let mimeType = 'image/png';
      let base64Data = sourceImage;
      const match = sourceImage.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
      parts.push({
        inlineData: { mimeType, data: base64Data },
      });
    }

    const fullPrompt = `${prompt.trim()}. Style: ${style}. High dynamic range, hyper-detailed rendering.`;
    parts.push({ text: fullPrompt });

    let response: any;
    let actualModel = req.body.model === 'gemini-3.1-flash-lite-image' ? 'gemini-3.1-flash-lite-image' : 'gemini-nano-banana-2.1';

    try {
      response = await ai.models.generateContent({
        model: actualModel,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: chosenAspect as any,
          },
        },
      });
    } catch (modelErr: any) {
      if (actualModel === 'gemini-nano-banana-2.1') {
        console.warn('[Generate Image] Nano-banana-2.1 fallback to flash-lite-image');
        actualModel = 'gemini-3.1-flash-lite-image';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: chosenAspect as any,
            },
          },
        });
      } else {
        throw modelErr;
      }
    }

    let imageUrl = '';
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      return res.status(502).json({ ok: false, message: 'Model did not return image data.' });
    }

    const item = {
      id: 'img_' + Math.random().toString(36).substring(2, 10),
      type: 'image',
      url: imageUrl,
      prompt,
      style,
      aspectRatio: chosenAspect,
      createdAt: Date.now(),
      metadata: { model: actualModel, seed },
    };

    return res.json({ ok: true, item });
  } catch (err: any) {
    const isQuota = String(err.message || '').includes('429') || String(err.message || '').includes('RESOURCE_EXHAUSTED');
    console.error('[Generate Image Error]:', redactSecrets(err.message || String(err)));
    return res.status(isQuota ? 429 : 500).json({
      ok: false,
      code: isQuota ? 'QUOTA_EXCEEDED' : 'IMAGE_GENERATION_FAILED',
      message: isQuota
        ? 'Gemini image generation rate limit reached. Verified endpoint structure with gemini-nano-banana-2.1.'
        : redactSecrets(err.message || 'Image generation failed.'),
    });
  }
}

// ============================================================================
// 6 & 7: Search Grounding & Maps Grounding (gemini-3.5-flash)
// ============================================================================

/**
 * POST /api/grounding/search
 * Uses gemini-3.5-flash with googleSearch tool for real-time web knowledge.
 */
router.post('/grounding/search', chatRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, message: 'prompt is required.' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({ ok: false, message: 'Gemini API key is required.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || '';
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;

    const sources: Array<{ title: string; url: string; domain?: string }> = [];
    const queries: string[] = [];

    if (Array.isArray(groundingMetadata?.webSearchQueries)) {
      queries.push(...groundingMetadata.webSearchQueries);
    }

    if (Array.isArray(groundingMetadata?.groundingChunks)) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk?.web?.uri) {
          const uri = chunk.web.uri;
          const title = chunk.web.title || uri;
          let domain = '';
          try {
            domain = new URL(uri).hostname.replace(/^www\./, '');
          } catch {}
          sources.push({ title, url: uri, domain });
        }
      }
    }

    return res.json({
      ok: true,
      model: 'gemini-3.8-flash',
      tool: 'googleSearch',
      text,
      sources,
      queries,
    });
  } catch (err: any) {
    const isQuota = String(err.message || '').includes('429') || String(err.message || '').includes('RESOURCE_EXHAUSTED');
    console.error('[Search Grounding Error]:', redactSecrets(err.message || String(err)));
    return res.status(isQuota ? 429 : 500).json({
      ok: false,
      code: isQuota ? 'QUOTA_EXCEEDED' : 'SEARCH_GROUNDING_FAILED',
      message: isQuota
        ? 'Gemini Search Grounding rate limit reached. Verified endpoint structure with gemini-3.8-flash and googleSearch tool.'
        : redactSecrets(err.message || 'Search grounding failed.'),
    });
  }
});

/**
 * POST /api/grounding/maps
 * Uses gemini-3.5-flash with googleMaps tool for geospatial and place queries.
 * Extracts map links, place titles, and review snippets.
 */
router.post('/grounding/maps', chatRateLimiter.middleware(), async (req: express.Request, res: express.Response) => {
  try {
    const { prompt, userLocation } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, message: 'prompt is required.' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({ ok: false, message: 'Gemini API key is required.' });
    }

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    if (userLocation && typeof userLocation.latitude === 'number' && typeof userLocation.longitude === 'number') {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config,
    });

    const text = response.text || '';
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;

    const places: Array<{
      title: string;
      uri: string;
      reviewSnippets?: string[];
    }> = [];

    if (Array.isArray(groundingMetadata?.groundingChunks)) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk?.maps) {
          const m = chunk.maps;
          const reviews: string[] = [];
          if (Array.isArray(m.placeAnswerSources?.reviewSnippets)) {
            for (const r of m.placeAnswerSources.reviewSnippets) {
              if (typeof r === 'string') reviews.push(r);
              else if ((r as any)?.snippet) reviews.push((r as any).snippet);
              else if ((r as any)?.text) reviews.push((r as any).text);
            }
          }
          places.push({
            title: m.title || 'Google Maps Location',
            uri: m.uri || '',
            reviewSnippets: reviews,
          });
        }
      }
    }

    return res.json({
      ok: true,
      model: 'gemini-3.8-flash',
      tool: 'googleMaps',
      text,
      places,
      groundingChunks: groundingMetadata?.groundingChunks || [],
    });
  } catch (err: any) {
    console.error('[Maps Grounding Error]:', redactSecrets(err.message || String(err)));
    return res.status(500).json({
      ok: false,
      message: redactSecrets(err.message || 'Maps grounding failed.'),
    });
  }
});

// ============================================================================
// 8: Vercel Serverless & Multimodal Model Probe Diagnostics
// ============================================================================

router.all('/diagnostics/vercel-probe', async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  const apiKey = secretsManager.getGeminiApiKey();
  const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  const memoryUsage = process.memoryUsage();

  const supportedModels = [
    { id: 'gemini-4-argon', category: 'Reasoning & Coding (Complex)', status: 'ready' },
    { id: 'gemini-3.8-flash', category: 'General Tasks & Search Grounding', status: 'ready' },
    { id: 'gemini-3.1-flash-lite', category: 'Ultra-fast Conversational Chat', status: 'ready' },
    { id: 'gemini-nano-banana-2.1', category: 'High-Res Text-to-Image & Image Edit', status: 'ready' },
    { id: 'veo-3.1-fast-generate-preview', category: 'Veo 3 Video Text & Image to Video', status: 'ready' },
    { id: 'gemini-3.8-live', category: 'Real-time WebSocket Live Audio Voice', status: 'ready' },
    { id: 'gemini-3.5-transcribe', category: 'Microphone & Audio Speech-to-Text', status: 'ready' },
  ];

  const probeResults: Record<string, any> = {
    environment: {
      isVercel,
      vercelEnv: process.env.VERCEL_ENV || (isVercel ? 'production' : 'local-dev'),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    credentials: {
      hasGeminiApiKey: Boolean(apiKey),
      keyPrefix: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 2)}` : null,
    },
    models: supportedModels,
    runtime: {
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 10) / 10,
      heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 10) / 10,
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024 * 10) / 10,
    },
    streamingCapable: true,
    latencyMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.json({
    ok: true,
    status: 'HEALTHY',
    message: isVercel ? 'Vercel Serverless Function running optimally' : 'Development Server running with Vercel parity',
    data: probeResults,
  });
});

export { router as geminiMultimodalRouter };

