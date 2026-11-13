import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterModelDescriptor } from '../server/openRouterProvider.ts';

test('configured OpenRouter model is routable even without remote catalog hydration', () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.ADAM_OPENROUTER_MODEL;
  try {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-secret';
    process.env.ADAM_OPENROUTER_MODEL = 'vendor/test-model';

    const descriptor = createOpenRouterModelDescriptor();
    assert.ok(descriptor);
    assert.equal(descriptor.id, 'vendor/test-model');
    assert.equal(descriptor.provider, 'openai-compatible');
    assert.equal(descriptor.enabled, true);
    assert.equal(JSON.stringify(descriptor).includes('test-openrouter-secret'), false);
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.ADAM_OPENROUTER_MODEL;
    else process.env.ADAM_OPENROUTER_MODEL = previousModel;
  }
});

test('OpenRouter descriptor is unavailable when the server key is absent', () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  try {
    delete process.env.OPENROUTER_API_KEY;
    assert.equal(createOpenRouterModelDescriptor(), undefined);
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});
