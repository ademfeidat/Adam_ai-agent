export type ModelProvider = 'ADEM-G' | 'gemini' | 'huggingface' | 'openai-compatible' | 'local' | 'pollinations';
export type ModelCapability = 'general' | 'reasoning' | 'coding' | 'math' | 'vision' | 'search' | 'fast' | 'arabic';

export interface ModelDescriptor { id: string; provider: ModelProvider; displayName: string; capabilities: readonly ModelCapability[]; contextLength?: number; quality: number; speed: number; cost: number; enabled: boolean; endpoint?: string; }
export interface RoutingTask { prompt: string; capabilities?: ModelCapability[]; maxModels?: number; preferSpeed?: boolean; budget?: number; }
export interface RoutingPlan { primary: ModelDescriptor; ensemble: ModelDescriptor[]; strategy: 'single' | 'ensemble'; }

export const MAX_SWARM_MODELS = 1000;

export class ModelRegistry {
  private readonly models = new Map<string, ModelDescriptor>();
  register(model: ModelDescriptor) { this.models.set(model.id, model); }
  registerMany(models: ModelDescriptor[]) { models.forEach(model => this.register(model)); }
  get(id: string) { return this.models.get(id); }
  all() { return [...this.models.values()]; }
  enabled() { return this.all().filter(model => model.enabled); }
  size() { return this.models.size; }
}

export function formatAdemModelName(modelIdOrName: string): string {
  if (!modelIdOrName) return 'ADEM-G 3.8 Flash';
  const clean = String(modelIdOrName).trim();
  if (clean.startsWith('ADEM-G')) return clean;

  const map: Record<string, string> = {
    'gemini-4-argon': 'ADEM-G 4 Argon',
    'gemini-3.8-flash': 'ADEM-G 3.8 Flash',
    'gemini-3.1-flash-lite': 'ADEM-G 3.1 Flash Lite',
    'gemini-flash-latest': 'ADEM-G Flash Latest',
    'gemini-3.1-pro-preview': 'ADEM-G 3.1 Pro Preview',
    'gemini-2.5-flash': 'ADEM-G 2.5 Flash',
    'gemini-2.5-pro': 'ADEM-G 2.5 Pro',
    'gemini-3.6-flash': 'ADEM-G 3.6 Flash',
    'gemini-3.5-flash': 'ADEM-G 3.5 Flash',
    'gemini-3.5-flash-lite': 'ADEM-G 3.5 Flash Lite',
  };
  if (map[clean.toLowerCase()]) return map[clean.toLowerCase()];

  return clean
    .replace(/^gemini[- ]?/i, 'ADEM-G ')
    .replace(/gemini[- ]?/gi, 'ADEM-G ');
}

const builtInModels: ModelDescriptor[] = [
  { id: 'gemini-4-argon', provider: 'ADEM-G', displayName: 'ADEM-G 4 Argon (Flagship Reasoning & STEM)', capabilities: ['reasoning','coding','math','general','vision','arabic'], quality: 10.0, speed: 9.2, cost: 2, enabled: true },
  { id: 'gemini-3.8-flash', provider: 'ADEM-G', displayName: 'ADEM-G 3.8 Flash', capabilities: ['general','fast','coding','reasoning','math','vision','arabic'], quality: 9.9, speed: 9.8, cost: 1, enabled: true },
  { id: 'gemini-3.6-flash', provider: 'ADEM-G', displayName: 'ADEM-G 3.6 Flash', capabilities: ['general','fast','coding','reasoning','math','vision','arabic'], quality: 9.7, speed: 9.6, cost: 1, enabled: true },
  { id: 'gemini-3.5-flash-lite', provider: 'ADEM-G', displayName: 'ADEM-G 3.5 Flash Lite', capabilities: ['general','fast','coding','arabic'], quality: 9.4, speed: 9.9, cost: 1, enabled: true },
  { id: 'gemini-3.1-flash-lite', provider: 'ADEM-G', displayName: 'ADEM-G 3.1 Flash Lite', capabilities: ['general','fast','coding','arabic'], quality: 9.5, speed: 9.9, cost: 1, enabled: true },
  { id: 'gemini-flash-latest', provider: 'ADEM-G', displayName: 'ADEM-G Flash Latest', capabilities: ['general','fast','coding','reasoning','math','vision','arabic'], quality: 9.8, speed: 9.8, cost: 1, enabled: true },
  { id: 'gemini-2.5-flash', provider: 'ADEM-G', displayName: 'ADEM-G 2.5 Flash (legacy access)', capabilities: ['general','fast','coding','reasoning','arabic'], quality: 9.6, speed: 9.7, cost: 1, enabled: false },
  { id: 'gemini-2.5-pro', provider: 'ADEM-G', displayName: 'ADEM-G 2.5 Pro (legacy access)', capabilities: ['general','coding','reasoning','math','vision','arabic'], quality: 9.9, speed: 9.0, cost: 2, enabled: false },
  { id: 'deepseek-ai/DeepSeek-R1', provider: 'huggingface', displayName: 'DeepSeek-R1 (Hugging Face Reasoning)', capabilities: ['reasoning','coding','math','general','arabic'], quality: 9.9, speed: 8.8, cost: 1, enabled: true, endpoint: 'https://router.huggingface.co/v1/chat/completions' },
  { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', provider: 'huggingface', displayName: 'Qwen 2.5 Coder 32B (Hugging Face Code)', capabilities: ['coding','reasoning','fast','general','arabic'], quality: 9.8, speed: 9.5, cost: 1, enabled: true, endpoint: 'https://router.huggingface.co/v1/chat/completions' },
  { id: 'meta-llama/Llama-3.3-70B-Instruct', provider: 'huggingface', displayName: 'Llama 3.3 70B (Hugging Face Intelligence)', capabilities: ['general','reasoning','coding','arabic','math'], quality: 9.7, speed: 9.0, cost: 1, enabled: true, endpoint: 'https://router.huggingface.co/v1/chat/completions' },
  { id: 'mistralai/Mistral-Small-24B-Instruct-2501', provider: 'huggingface', displayName: 'Mistral Small 24B (Hugging Face Fast)', capabilities: ['general','fast','coding','arabic'], quality: 9.4, speed: 9.8, cost: 1, enabled: true, endpoint: 'https://router.huggingface.co/v1/chat/completions' },
  { id: 'gemini-3.1-pro-preview', provider: 'ADEM-G', displayName: 'ADEM-G 3.1 Pro Preview', capabilities: ['general','coding','reasoning','math','vision','arabic'], quality: 9.9, speed: 9.2, cost: 2, enabled: false },
];
export const modelRegistry = new ModelRegistry();
modelRegistry.registerMany(builtInModels);

function normalizeCapability(value: unknown): ModelCapability | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'code' || text === 'coding' || text.includes('program')) return 'coding';
  if (text === 'reason' || text === 'reasoning' || text.includes('reason')) return 'reasoning';
  if (text === 'math' || text.includes('mathemat')) return 'math';
  if (text === 'vision' || text.includes('image')) return 'vision';
  if (text === 'search' || text.includes('web')) return 'search';
  if (text === 'arabic' || text.includes('arab')) return 'arabic';
  if (text === 'fast' || text.includes('speed')) return 'fast';
  if (text === 'general') return 'general';
  return null;
}

/** Hydrate the registry from a remote OpenAI-compatible catalog without hardcoding a fake "1000 models" list. */
export function registerRemoteModels(input: unknown, provider: ModelProvider = 'pollinations', endpoint = 'https://gen.pollinations.ai/v1/chat/completions', registry: ModelRegistry = modelRegistry) {
  const entries = Array.isArray(input) ? input : (input && typeof input === 'object' && Array.isArray((input as any).data) ? (input as any).data : []);
  const models: ModelDescriptor[] = entries.map((entry: any) => {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (!id) return null;
    const declared = Array.isArray(entry?.capabilities) ? entry.capabilities.map(normalizeCapability).filter(Boolean) as ModelCapability[] : [];
    const capabilities = [...new Set<ModelCapability>(['general', ...declared])];
    const contextLength = Number(entry?.context_length ?? entry?.contextLength ?? entry?.max_context_length);
    return { id, provider, displayName: String(entry?.name ?? entry?.display_name ?? id), capabilities, contextLength: Number.isFinite(contextLength) ? contextLength : undefined, quality: 7.5, speed: 7.5, cost: 0, enabled: true, endpoint };
  }).filter(Boolean) as ModelDescriptor[];
  registry.registerMany(models);
  return models;
}

function score(model: ModelDescriptor, task: RoutingTask) {
  const required: ModelCapability[] = task.capabilities?.length ? task.capabilities : ['general'];
  const match = required.filter(cap => model.capabilities.includes(cap)).length / required.length;
  const qualityWeight = task.preferSpeed ? 0.25 : 0.55;
  const speedWeight = task.preferSpeed ? 0.55 : 0.2;
  const costWeight = task.budget !== undefined ? 0.25 : 0.05;
  return match * 5 + model.quality * qualityWeight + model.speed * speedWeight + Math.max(0, 10 - model.cost) * costWeight;
}

export function routeTask(task: RoutingTask): RoutingPlan {
  const candidates = modelRegistry.enabled().filter(model => task.budget === undefined || model.cost <= task.budget);
  if (!candidates.length) throw new Error('No enabled model matches the current routing constraints.');
  const ranked = candidates.sort((a, b) => score(b, task) - score(a, task));
  const maxModels = Math.max(1, Math.min(task.maxModels ?? 1, MAX_SWARM_MODELS));
  const primary = ranked[0];
  return maxModels === 1 ? { primary, ensemble: [primary], strategy: 'single' } : { primary, ensemble: ranked.slice(0, maxModels), strategy: 'ensemble' };
}

export function registrySnapshot() { return { total: modelRegistry.size(), enabled: modelRegistry.enabled().length, providers: [...new Set(modelRegistry.enabled().map(model => model.provider))] }; }
