import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';
// A browser-exposed VITE key must never satisfy server-side provider configuration.
process.env.VITE_GEMINI_API_KEY = 'client-only-test-key';
const { app } = await import('../server.ts');

async function closeTestServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

test('health endpoint exposes a provider-neutral server status', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.configured, false);
  await closeTestServer(server);
});

test('chat endpoint returns a typed configuration error without provider credentials', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gemini-api-key': 'attacker-supplied-key' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], language: 'en', agentName: 'Adam' }),
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, 'AI_NOT_CONFIGURED');
  await closeTestServer(server);
});
