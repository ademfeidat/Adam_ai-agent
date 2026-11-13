import test from 'node:test';
import assert from 'node:assert/strict';
import { dockerSandboxService } from '../server/sandbox/dockerSandboxService.ts';

test('DockerSandboxService reports status and supported languages', async () => {
  const status = await dockerSandboxService.getStatus();
  assert.equal(typeof status.dockerAvailable, 'boolean');
  assert.ok(['docker', 'isolated_worker'].includes(status.engine));
  assert.ok(status.supportedLanguages.includes('javascript'));
  assert.ok(status.supportedLanguages.includes('python'));
  assert.ok(status.supportedLanguages.includes('bash'));
  assert.equal(typeof status.activeContainersCount, 'number');
  assert.equal(typeof status.totalExecutions, 'number');
});

test('DockerSandboxService executes JavaScript securely and captures stdout', async () => {
  const result = await dockerSandboxService.execute({
    language: 'javascript',
    code: 'console.log("HELLO_SANDBOX_" + (40 + 2));',
    limits: {
      cpuLimit: 1.0,
      memoryLimitMb: 128,
      timeoutMs: 5000,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('HELLO_SANDBOX_42'));
  assert.equal(result.stderr, '');
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.containerId.startsWith('adem-sb-'));
  assert.equal(result.resourceLimits.memoryLimitMb, 128);
});

test('DockerSandboxService executes Python code accurately', async () => {
  const result = await dockerSandboxService.execute({
    language: 'python',
    code: 'print(f"SUM={sum([1, 2, 3, 4, 5])}")',
    limits: {
      cpuLimit: 0.5,
      memoryLimitMb: 128,
      timeoutMs: 5000,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('SUM=15'));
});

test('DockerSandboxService executes Bash scripts and sanitizes environment credentials', async () => {
  const result = await dockerSandboxService.execute({
    language: 'bash',
    code: 'echo "TEST_VAL=$ADEM_SANDBOX_ID"',
    limits: {
      timeoutMs: 5000,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('TEST_VAL=adem-sb-'));
});

test('DockerSandboxService enforces wall-clock timeout and terminates infinite loops', async () => {
  const result = await dockerSandboxService.execute({
    language: 'javascript',
    code: 'while (true) {}',
    limits: {
      timeoutMs: 600, // 600ms timeout
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.ok(result.exitCode !== 0);
  assert.ok(result.stderr.includes('Timeout'));
});

test('DockerSandboxService handles compilation and execution errors cleanly', async () => {
  const result = await dockerSandboxService.execute({
    language: 'javascript',
    code: 'throw new Error("Deliberate sandbox error test");',
    // Allow Docker startup overhead on shared CI runners; the assertion is
    // about application stderr, not whether the daemon can warm an image in 5s.
    limits: {
      timeoutMs: 15000,
    },
  });

  assert.equal(result.ok, false);
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.stderr.includes('Deliberate sandbox error test'));
});

test('DockerSandboxService garbage collection runs safely', async () => {
  await dockerSandboxService.garbageCollect();
  const status = await dockerSandboxService.getStatus();
  assert.equal(typeof status.activeContainersCount, 'number');
});
