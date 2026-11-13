import { Router, type Request, type Response } from 'express';
import { dockerSandboxService, type SandboxExecutionRequest } from './dockerSandboxService';
import { AppGeneratorEngine } from './appGeneratorEngine';

export const sandboxRouter = Router();

/**
 * POST /api/sandbox/generate-app
 * Generates a full interactive HTML5/CSS/JS application or game using Gemini 3.8 Flash
 */
sandboxRouter.post('/generate-app', async (req: Request, res: Response) => {
  try {
    const { prompt, category, language } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({
        ok: false,
        error: 'PROMPT_REQUIRED',
        message: 'The prompt parameter is required.',
      });
      return;
    }

    const app = await AppGeneratorEngine.generateApp({
      prompt: prompt.trim(),
      category,
      language: language === 'en' ? 'en' : 'ar',
    });

    res.json({ ok: true, app });
  } catch (err: any) {
    console.error('[Sandbox Generate App Error]:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to generate application.' });
  }
});

/**
 * GET /api/sandbox/docker/status
 * Returns current Docker execution environment capabilities and active pool stats.
 */
sandboxRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await dockerSandboxService.getStatus();
    res.json({
      ok: true,
      ...status,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/sandbox/docker/execute
 * Runs user-generated code securely inside an isolated temporary container
 * with strict CPU and RAM resource limits, wall-clock timeouts, and network policies.
 */
sandboxRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const { code, language = 'javascript', stdin, limits } = req.body || {};

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        ok: false,
        error: 'INVALID_PAYLOAD',
        message: 'The "code" parameter is required and must be a string.',
      });
      return;
    }

    const validLanguages = ['javascript', 'typescript', 'python', 'bash', 'html'];
    if (!validLanguages.includes(language)) {
      res.status(400).json({
        ok: false,
        error: 'UNSUPPORTED_LANGUAGE',
        message: `Language '${language}' is not supported. Choose from: ${validLanguages.join(', ')}`,
      });
      return;
    }

    const executionRequest: SandboxExecutionRequest = {
      code,
      language,
      stdin: typeof stdin === 'string' ? stdin : undefined,
      limits: limits && typeof limits === 'object' ? limits : undefined,
    };

    const result = await dockerSandboxService.execute(executionRequest);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: 'EXECUTION_FAILED',
      message: err.message || 'Container execution failed.',
    });
  }
});

/**
 * POST /api/sandbox/docker/prune
 * Manually trigger garbage collection of dangling temporary containers and directories.
 */
sandboxRouter.post('/prune', async (_req: Request, res: Response) => {
  try {
    await dockerSandboxService.garbageCollect();
    const status = await dockerSandboxService.getStatus();
    res.json({
      ok: true,
      message: 'Temporary containers and sandbox cache successfully pruned.',
      activeContainersCount: status.activeContainersCount,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
