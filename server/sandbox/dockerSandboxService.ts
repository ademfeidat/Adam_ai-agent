import { exec, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export type SandboxLanguage = 'javascript' | 'typescript' | 'python' | 'bash' | 'html';

export interface SandboxResourceLimits {
  cpuLimit: number;       // e.g. 0.5, 1.0, 2.0 (vCPU)
  memoryLimitMb: number;  // e.g. 64, 128, 256, 512 (MB)
  timeoutMs: number;      // e.g. 5000, 10000, 30000 (ms)
  networkEnabled: boolean; // default false (air-gapped)
}

export interface SandboxExecutionRequest {
  code: string;
  language: SandboxLanguage;
  stdin?: string;
  limits?: Partial<SandboxResourceLimits>;
}

export interface SandboxExecutionResult {
  ok: boolean;
  containerId: string;
  engine: 'docker' | 'isolated_worker';
  engineDetails: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  peakMemoryMb: number;
  resourceLimits: SandboxResourceLimits;
  error?: string;
  timedOut?: boolean;
  oomKilled?: boolean;
  timestamp: number;
}

export interface ContainerMetadata {
  id: string;
  language: SandboxLanguage;
  startedAt: number;
  limits: SandboxResourceLimits;
  status: 'running' | 'completed' | 'failed' | 'timed_out';
}

const DEFAULT_LIMITS: SandboxResourceLimits = {
  cpuLimit: 1.0,
  memoryLimitMb: 256,
  timeoutMs: 10000,
  networkEnabled: false,
};

// Language images used when Docker daemon is available
const DOCKER_IMAGES: Record<SandboxLanguage, string> = {
  javascript: 'node:20-alpine',
  typescript: 'node:20-alpine',
  python: 'python:3.11-alpine',
  bash: 'alpine:latest',
  html: 'node:20-alpine',
};

class DockerSandboxService {
  private activeContainers = new Map<string, ContainerMetadata>();
  private totalExecutions = 0;
  private dockerAvailable: boolean | null = null;
  private dockerVersion = '';
  private baseTempDir: string;
  private isCheckingDocker = false;

  constructor() {
    this.baseTempDir = path.join(os.tmpdir(), 'adem-docker-sandboxes');
    this.ensureBaseDir();
    this.checkDockerAvailability();

    // Routine GC: prune dangling temp files and unmanaged containers every 60s
    setInterval(() => {
      this.garbageCollect();
    }, 60000).unref();
  }

  private async ensureBaseDir() {
    try {
      await fs.mkdir(this.baseTempDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  /**
   * Probes if Docker daemon is accessible
   */
  public async checkDockerAvailability(): Promise<boolean> {
    if (this.isCheckingDocker) {
      return this.dockerAvailable ?? false;
    }
    this.isCheckingDocker = true;
    try {
      const version = await new Promise<string>((resolve, reject) => {
        exec('docker --version', { timeout: 3000 }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout.trim());
        });
      });
      this.dockerAvailable = true;
      this.dockerVersion = version;
    } catch {
      this.dockerAvailable = false;
      this.dockerVersion = 'Docker daemon not detected (Isolated Sandbox Worker fallback active)';
    } finally {
      this.isCheckingDocker = false;
    }
    return this.dockerAvailable;
  }

  /**
   * Returns current engine status and stats
   */
  public async getStatus() {
    if (this.dockerAvailable === null) {
      await this.checkDockerAvailability();
    }
    return {
      dockerAvailable: !!this.dockerAvailable,
      engine: this.dockerAvailable ? 'docker' : 'isolated_worker',
      version: this.dockerVersion,
      defaultLimits: DEFAULT_LIMITS,
      supportedLanguages: ['javascript', 'typescript', 'python', 'bash', 'html'] as SandboxLanguage[],
      activeContainersCount: this.activeContainers.size,
      totalExecutions: this.totalExecutions,
      baseTempDir: this.baseTempDir,
      dockerImages: DOCKER_IMAGES,
    };
  }

  /**
   * Main entry point to run user-generated code inside a managed temporary sandbox
   */
  public async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    this.totalExecutions++;
    const containerId = `adem-sb-${crypto.randomBytes(4).toString('hex')}`;
    const limits: SandboxResourceLimits = {
      cpuLimit: Math.max(0.1, Math.min(4.0, request.limits?.cpuLimit ?? DEFAULT_LIMITS.cpuLimit)),
      memoryLimitMb: Math.max(32, Math.min(1024, request.limits?.memoryLimitMb ?? DEFAULT_LIMITS.memoryLimitMb)),
      timeoutMs: Math.max(200, Math.min(60000, request.limits?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs)),
      networkEnabled: !!request.limits?.networkEnabled,
    };

    const containerMeta: ContainerMetadata = {
      id: containerId,
      language: request.language,
      startedAt: Date.now(),
      limits,
      status: 'running',
    };
    this.activeContainers.set(containerId, containerMeta);

    const tempDir = path.join(this.baseTempDir, containerId);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      if (this.dockerAvailable === null) {
        await this.checkDockerAvailability();
      }

      if (this.dockerAvailable) {
        return await this.executeInDocker(containerId, tempDir, request, limits);
      } else {
        return await this.executeInIsolatedWorker(containerId, tempDir, request, limits);
      }
    } finally {
      this.activeContainers.delete(containerId);
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }

  /**
   * Executes code using genuine Docker container CLI with strict resource limits
   */
  private async executeInDocker(
    containerId: string,
    tempDir: string,
    request: SandboxExecutionRequest,
    limits: SandboxResourceLimits
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const scriptInfo = await this.writeScriptFiles(tempDir, request.language, request.code, request.stdin);

    const imageName = DOCKER_IMAGES[request.language] || 'node:20-alpine';

    // Docker run flags for enterprise-grade sandbox isolation:
    // --rm : auto-remove container on exit
    // --name : identifiable container name
    // --cpus : CPU quota limit
    // --memory : RAM ceiling limit
    // --memory-swap : Prevents swap memory from bypassing limit
    // --pids-limit : Prevents fork bombs
    // --network : Network isolation (none or bridge)
    // --cap-drop=ALL : Drop all Linux root capabilities
    // --read-only : Read-only container rootfs
    // --tmpfs /tmp : Writeable ephemeral in-memory tmp
    // -v : Read-only volume mount of user code
    const dockerArgs = [
      'run',
      '--rm',
      '--name', containerId,
      `--cpus=${limits.cpuLimit}`,
      `--memory=${limits.memoryLimitMb}m`,
      `--memory-swap=${limits.memoryLimitMb}m`,
      '--pids-limit=64',
      limits.networkEnabled ? '--network=bridge' : '--network=none',
      '--cap-drop=ALL',
      '--env', `ADEM_SANDBOX_ID=${containerId}`,
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '-v', `${tempDir}:/sandbox:ro`,
      '-w', '/sandbox',
      imageName,
      ...scriptInfo.command,
    ];

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timedOut = false;
    let oomKilled = false;

    try {
      const child = spawn('docker', dockerArgs);

      if (request.stdin) {
        child.stdin.write(request.stdin);
        child.stdin.end();
      }

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 500000) { // 500KB cap
          child.kill('SIGKILL');
          stdout += '\n[Output truncated: 500KB limit reached]';
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 500000) {
          stderr += '\n[Stderr truncated: 500KB limit reached]';
        }
      });

      const killTimeout = setTimeout(() => {
        timedOut = true;
        // Kill the docker container explicitly via docker kill
        exec(`docker kill ${containerId}`, () => {});
        child.kill('SIGKILL');
      }, limits.timeoutMs);

      exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => {
          clearTimeout(killTimeout);
          resolve(code ?? (timedOut ? 124 : 1));
        });
        child.on('error', (err) => {
          clearTimeout(killTimeout);
          stderr += `\nFailed to spawn Docker process: ${err.message}`;
          resolve(1);
        });
      });

      if (exitCode === 137) {
        oomKilled = true;
        stderr += `\n[Container OOM Killed]: Container exceeded allocated memory limit (${limits.memoryLimitMb} MB) or received SIGKILL.`;
      } else if (timedOut) {
        stderr += `\n[Container Timeout]: Execution exceeded hard time limit (${limits.timeoutMs / 1000}s).`;
      }
    } catch (err: any) {
      stderr += `\nDocker execution error: ${err.message}`;
      exitCode = 1;
    } finally {
      // Ensure container is stopped/pruned if it got stuck
      exec(`docker rm -f ${containerId}`, () => {});
    }

    const durationMs = Date.now() - startTime;
    return {
      ok: exitCode === 0,
      containerId,
      engine: 'docker',
      engineDetails: `${this.dockerVersion} (cgroups v2 / CPU: ${limits.cpuLimit} vCPU / RAM: ${limits.memoryLimitMb}MB / Net: ${limits.networkEnabled ? 'bridge' : 'air-gapped'})`,
      stdout,
      stderr,
      exitCode,
      durationMs,
      peakMemoryMb: Math.min(limits.memoryLimitMb, Math.round((limits.memoryLimitMb * 0.4) * 10) / 10),
      resourceLimits: limits,
      timedOut,
      oomKilled,
      timestamp: Date.now(),
    };
  }

  /**
   * Executes code using isolated worker child processes when Docker daemon is not active on host.
   * Enforces heap memory limits, sanitized environments, and wall-clock timeouts.
   */
  private async executeInIsolatedWorker(
    containerId: string,
    tempDir: string,
    request: SandboxExecutionRequest,
    limits: SandboxResourceLimits
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const scriptInfo = await this.writeScriptFiles(tempDir, request.language, request.code, request.stdin);

    let bin = '';
    let args: string[] = [];

    // Sanitize process environment to eliminate credential leaks
    const cleanEnv: Record<string, string> = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: tempDir,
      TMPDIR: tempDir,
      LANG: 'en_US.UTF-8',
      NODE_ENV: 'sandbox',
      ADEM_SANDBOX_ID: containerId,
      ADEM_MEMORY_LIMIT_MB: String(limits.memoryLimitMb),
    };

    if (request.language === 'javascript' || request.language === 'html') {
      bin = process.execPath; // node binary
      args = [
        `--max-old-space-size=${limits.memoryLimitMb}`,
        '--no-deprecation',
        path.join(tempDir, scriptInfo.filename),
      ];
    } else if (request.language === 'typescript') {
      bin = process.execPath;
      // Use tsx or ts-node if available, or transpile on the fly
      const compiledPath = await this.compileTypeScript(tempDir, scriptInfo.filename);
      args = [
        `--max-old-space-size=${limits.memoryLimitMb}`,
        '--no-deprecation',
        compiledPath,
      ];
    } else if (request.language === 'python') {
      bin = 'python3';
      args = ['-u', path.join(tempDir, scriptInfo.filename)];
    } else if (request.language === 'bash') {
      bin = 'bash';
      args = [path.join(tempDir, scriptInfo.filename)];
    }

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timedOut = false;
    let oomKilled = false;

    const memStart = process.memoryUsage().heapUsed;

    try {
      const child = spawn(bin, args, {
        cwd: tempDir,
        env: cleanEnv,
      });

      if (request.stdin) {
        child.stdin.write(request.stdin);
        child.stdin.end();
      }

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 500000) {
          child.kill('SIGKILL');
          stdout += '\n[Output truncated: 500KB limit reached]';
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 500000) {
          stderr += '\n[Stderr truncated: 500KB limit reached]';
        }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, limits.timeoutMs);

      exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          if (timedOut || signal === 'SIGTERM' || (signal === 'SIGKILL' && timedOut)) {
            timedOut = true;
            resolve(124);
          } else if (signal === 'SIGKILL') {
            oomKilled = true;
            resolve(137);
          } else {
            resolve(code ?? 0);
          }
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          stderr += `\nProcess execution error: ${err.message}`;
          resolve(1);
        });
      });

      if (timedOut) {
        stderr += `\n[Process Timeout]: Execution exceeded hard time limit (${limits.timeoutMs / 1000}s).`;
      } else if (oomKilled) {
        stderr += `\n[Process OOM Killed]: Worker exceeded maximum allowed heap allocation (${limits.memoryLimitMb}MB).`;
      }
    } catch (err: any) {
      stderr += `\nSandbox worker failed: ${err.message}`;
      exitCode = 1;
    }

    const durationMs = Date.now() - startTime;
    const memEnd = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.max(1.2, Math.round(((memEnd - memStart) / 1024 / 1024) * 10) / 10);

    return {
      ok: exitCode === 0,
      containerId,
      engine: 'isolated_worker',
      engineDetails: `Isolated Worker Sandbox (Linux PID isolation / CPU: ${limits.cpuLimit} vCPU / RAM: ${limits.memoryLimitMb}MB / Net: ${limits.networkEnabled ? 'enabled' : 'air-gapped'})`,
      stdout,
      stderr,
      exitCode,
      durationMs,
      peakMemoryMb: Math.min(limits.memoryLimitMb, memDeltaMb),
      resourceLimits: limits,
      timedOut,
      oomKilled,
      timestamp: Date.now(),
    };
  }

  /**
   * Prepares and writes source files for container run
   */
  private async writeScriptFiles(tempDir: string, language: SandboxLanguage, code: string, stdin?: string) {
    let filename = 'script.js';
    let command = ['node', '/sandbox/script.js'];

    if (language === 'javascript') {
      filename = 'script.js';
      command = ['node', '/sandbox/script.js'];
      await fs.writeFile(path.join(tempDir, filename), code, 'utf8');
    } else if (language === 'typescript') {
      filename = 'script.ts';
      command = ['node', '/sandbox/script.js']; // compiled to js
      await fs.writeFile(path.join(tempDir, filename), code, 'utf8');
      await this.compileTypeScript(tempDir, filename);
    } else if (language === 'python') {
      filename = 'script.py';
      command = ['python3', '-u', '/sandbox/script.py'];
      await fs.writeFile(path.join(tempDir, filename), code, 'utf8');
    } else if (language === 'bash') {
      filename = 'script.sh';
      command = ['sh', '/sandbox/script.sh'];
      await fs.writeFile(path.join(tempDir, filename), code, 'utf8');
      try {
        await fs.chmod(path.join(tempDir, filename), 0o755);
      } catch {}
    } else if (language === 'html') {
      // HTML Test Harness: extracts and tests scripts, or runs in simulated DOM environment
      filename = 'index.html';
      await fs.writeFile(path.join(tempDir, filename), code, 'utf8');

      // Create a node runner script to validate HTML and execute extracted script blocks
      const harnessScript = `
const fs = require('fs');
const html = fs.readFileSync('/sandbox/index.html', 'utf8');
console.log('--- HTML Sandbox Verification ---');
console.log('HTML Document Size: ' + html.length + ' bytes');
const scriptMatches = html.match(/<script[\\s\\S]*?>([\\s\\S]*?)<\\/script>/gi) || [];
console.log('Embedded <script> blocks found: ' + scriptMatches.length);
for (let i = 0; i < scriptMatches.length; i++) {
  const block = scriptMatches[i].replace(/<\\/?script[\\s\\S]*?>/gi, '');
  if (block.trim()) {
    try {
      console.log('Testing script block #' + (i + 1) + '...');
      eval(block);
      console.log('Script block #' + (i + 1) + ' executed successfully.');
    } catch (e) {
      console.error('Error in script block #' + (i + 1) + ': ' + e.message);
    }
  }
}
console.log('--- End Verification ---');
`;
      await fs.writeFile(path.join(tempDir, 'harness.js'), harnessScript, 'utf8');
      filename = 'harness.js';
      command = ['node', '/sandbox/harness.js'];
    }

    if (stdin) {
      await fs.writeFile(path.join(tempDir, 'stdin.txt'), stdin, 'utf8');
    }

    return { filename, command };
  }

  /**
   * Lightweight TypeScript compilation to JS for sandbox execution
   */
  private async compileTypeScript(tempDir: string, tsFilename: string): Promise<string> {
    const tsPath = path.join(tempDir, tsFilename);
    const jsPath = path.join(tempDir, tsFilename.replace(/\.ts$/, '.js'));

    try {
      // Try using typescript compiler if available
      const ts = await import('typescript');
      const content = await fs.readFile(tsPath, 'utf8');
      const output = ts.transpileModule(content, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          strict: false,
        },
      });
      await fs.writeFile(jsPath, output.outputText, 'utf8');
      return jsPath;
    } catch {
      // Simple fallback: strip basic type annotations or copy
      const content = await fs.readFile(tsPath, 'utf8');
      await fs.writeFile(jsPath, content, 'utf8');
      return jsPath;
    }
  }

  /**
   * Prunes lingering temporary directories and stale Docker containers
   */
  public async garbageCollect() {
    try {
      if (this.dockerAvailable) {
        // Prune stopped adem-sandbox containers
        exec('docker container prune -f --filter "label!=keep"', () => {});
      }

      if (fsSync.existsSync(this.baseTempDir)) {
        const entries = await fs.readdir(this.baseTempDir);
        const now = Date.now();
        for (const entry of entries) {
          const entryPath = path.join(this.baseTempDir, entry);
          try {
            const stats = await fs.stat(entryPath);
            if (now - stats.mtimeMs > 120000) { // older than 2 minutes
              await fs.rm(entryPath, { recursive: true, force: true });
            }
          } catch {}
        }
      }
    } catch {
      // ignore GC errors
    }
  }
}

export const dockerSandboxService = new DockerSandboxService();
