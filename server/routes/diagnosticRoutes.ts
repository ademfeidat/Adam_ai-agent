import type { Express, Request, Response } from 'express';
import type { GuardianInput, GuardianReport } from '../guardian';

type DiagnosticRouteDependencies = {
  secretsManager: { getGeminiApiKey(): string | undefined };
  isOpenRouterConfigured: () => boolean;
  isGatewayConfigured: (req?: Request) => boolean;
  getOpenRouterModel: () => string;
  checkSupabaseHealth: () => Promise<Record<string, unknown>>;
  buildGuardianReport: (options: GuardianInput) => GuardianReport;
  redactSecrets: (value: string) => string;
  model: string;
};

/**
 * Registers low-risk service diagnostics. Dependencies are injected so this
 * module does not own provider, secrets, or persistence initialization.
 * Keep this registration after global middleware/rate limiting.
 */
export function registerDiagnosticRoutes(app: Express, deps: DiagnosticRouteDependencies): void {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      status: 'online',
      agent: 'ADEM',
      configured: Boolean(deps.secretsManager.getGeminiApiKey()) || deps.isOpenRouterConfigured() || deps.isGatewayConfigured(),
      agentic: true,
      provider: deps.isOpenRouterConfigured() ? 'openrouter' : (process.env.AI_GATEWAY_API_KEY?.trim() ? 'vercel-ai-gateway' : 'gemini'),
      model: deps.isOpenRouterConfigured() ? deps.getOpenRouterModel() : deps.model,
      timestamp: Date.now(),
    });
  });

  app.get('/api/guardian', (req: Request, res: Response) => {
    const report = deps.buildGuardianReport({
      geminiConfigured: Boolean(deps.secretsManager.getGeminiApiKey()),
      gatewayConfigured: deps.isGatewayConfigured(req),
      sessionSecretConfigured: Boolean(process.env.SESSION_SECRET?.trim()),
      vercel: process.env.VERCEL === '1',
      production: process.env.VERCEL_ENV === 'production',
      model: deps.model,
    });
    res.status(report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503).json(report);
  });

  app.get('/api/ping', (_req: Request, res: Response) => {
    res.json({ ok: true, pong: Date.now() });
  });

  app.get('/api/supabase/status', async (_req: Request, res: Response) => {
    try {
      const health = await deps.checkSupabaseHealth();
      res.json({ ok: true, ...health });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: deps.redactSecrets(String(err?.message || 'Failed to check Supabase status')) });
    }
  });
}
