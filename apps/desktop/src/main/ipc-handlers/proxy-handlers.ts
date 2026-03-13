/**
 * Proxy Server IPC Handlers
 *
 * Manages the Claude Code multi-provider proxy as a child process.
 * Handles start, stop, status, and provider switching.
 *
 * The proxy translates Anthropic API format to other providers (Copilot, OpenAI, Gemini),
 * allowing Claude Code SDK to work with any supported LLM provider.
 */

import { ipcMain, app, type IpcMainInvokeEvent } from 'electron';
import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { resolveGitHubToken } from './copilot-handlers';
import { getAPIProfileEnv } from '../services/profile';

let proxyProcess: ChildProcess | null = null;
let proxyReady = false;
let proxyStarting = false;

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8765;

function normalizeProxyProvider(provider?: string): string | undefined {
  const value = String(provider ?? '').trim().toLowerCase();
  if (!value) return undefined;

  const aliases: Record<string, string> = {
    'github-copilot': 'copilot',
    'github-copilot-enterprise': 'copilot',
    google: 'gemini',
    'google-gemini': 'gemini',
  };

  return aliases[value] ?? value;
}

/**
 * Make an HTTP request to the proxy using Node.js http module.
 */
function proxyRequest(
  method: string,
  reqPath: string,
  body?: string,
  timeoutMs = 3000
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: PROXY_HOST,
        port: PROXY_PORT,
        path: reqPath,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          : undefined,
        timeout: timeoutMs,
      },
      (res: http.IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode || 0, data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}

/** Locate the proxy directory across dev and packaged modes. */
function findProxyDir(): string | null {
  const candidates = [
    // Packaged: resources/proxy
    ...(app.isPackaged ? [path.join(process.resourcesPath, 'proxy')] : []),
    // Dev: from out/main -> apps/proxy
    path.resolve(__dirname, '..', '..', '..', 'proxy'),
    // From app root
    path.resolve(app.getAppPath(), '..', 'proxy'),
    // Repo root / cwd
    path.resolve(process.cwd(), 'apps', 'proxy'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'proxy_server.py'))) {
      return p;
    }
  }
  return null;
}

/** Locate a usable Python executable. */
function findPython(): string | null {
  const backendVenvCandidates = [
    path.resolve(__dirname, '..', '..', '..', 'backend', '.venv', 'Scripts', 'python.exe'),
    path.resolve(__dirname, '..', '..', '..', 'backend', '.venv', 'bin', 'python'),
    path.resolve(app.getAppPath(), '..', 'backend', '.venv', 'Scripts', 'python.exe'),
    path.resolve(app.getAppPath(), '..', 'backend', '.venv', 'bin', 'python'),
    path.resolve(process.cwd(), 'apps', 'backend', '.venv', 'Scripts', 'python.exe'),
    path.resolve(process.cwd(), 'apps', 'backend', '.venv', 'bin', 'python'),
  ];

  for (const p of backendVenvCandidates) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback to system python
  return process.platform === 'win32' ? 'python' : 'python3';
}

/** Wait for the proxy to respond on /_proxy/status */
async function waitForProxyReady(timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { status } = await proxyRequest('GET', '/_proxy/status', undefined, 1500);
      if (status === 200) {
        console.log('[Proxy] Ready — status endpoint responded');
        return true;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log('[Proxy] Timed out waiting for proxy to become ready');
  return false;
}

/** Check if the proxy is currently running and responding. */
async function isProxyAlive(): Promise<boolean> {
  try {
    const { status } = await proxyRequest('GET', '/_proxy/status', undefined, 2000);
    return status === 200;
  } catch {
    return false;
  }
}

/** Inject provider auth tokens into the running proxy via HTTP. */
async function injectProviderTokens(): Promise<void> {
  // Inject GitHub token
  try {
    const ghToken = await resolveGitHubToken();
    if (ghToken) {
      const { status, data } = await proxyRequest('POST', '/_proxy/set-token',
        JSON.stringify({ env_var: 'GITHUB_TOKEN', token: ghToken }));
      if (status === 200) {
        console.log('[Proxy] Injected GITHUB_TOKEN into proxy');
      } else {
        console.warn(`[Proxy] set-token returned ${status}: ${data}`);
      }
    }
  } catch (err) {
    console.warn('[Proxy] Could not inject GitHub token:', err);
  }

  // Inject API profile env vars
  try {
    const profileEnv = await getAPIProfileEnv();
    const profileKeysToInject = [
      'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
    ];
    for (const envVar of profileKeysToInject) {
      const value = profileEnv[envVar];
      if (value) {
        try {
          const { status } = await proxyRequest('POST', '/_proxy/set-token',
            JSON.stringify({ env_var: envVar, token: value }));
          if (status === 200) {
            console.log(`[Proxy] Injected ${envVar} from profile`);
          }
        } catch {
          // Non-critical
        }
      }
    }
  } catch (err) {
    console.warn('[Proxy] Could not resolve API profile env:', err);
  }

  // Fallback: inject from host process.env
  const envFallbacks = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
    'GROQ_API_KEY', 'GEMINI_API_KEY',
  ];
  for (const envVar of envFallbacks) {
    const value = process.env[envVar];
    if (value) {
      try {
        const { status } = await proxyRequest('POST', '/_proxy/set-token',
          JSON.stringify({ env_var: envVar, token: value }));
        if (status === 200) {
          console.log(`[Proxy] Injected ${envVar} from env`);
        }
      } catch {
        // Non-critical
      }
    }
  }
}

/**
 * Kill any stale proxy process on PROXY_PORT from a previous app run.
 */
function killStaleProxy(): void {
  try {
    if (process.platform === 'win32') {
      const output = execSync(
        `netstat -ano | findstr "LISTENING" | findstr ":${PROXY_PORT}"`,
        { encoding: 'utf-8', timeout: 5000, windowsHide: true }
      );
      const pids = new Set<number>();
      for (const line of output.split('\n')) {
        const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
        if (match) {
          const pid = Number.parseInt(match[1], 10);
          if (pid > 0 && pid !== process.pid) pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8', timeout: 5000, windowsHide: true });
          console.log(`[Proxy] Killed stale proxy process PID ${pid}`);
        } catch {
          // Process may have already exited
        }
      }
    } else {
      try {
        execSync(`fuser -k ${PROXY_PORT}/tcp 2>/dev/null`, { timeout: 5000 });
        console.log('[Proxy] Killed stale proxy process on port', PROXY_PORT);
      } catch {
        // No process on port or fuser not available
      }
    }
  } catch {
    // netstat/fuser failed — likely no stale process
  }
}

async function startProxyInternal(provider?: string): Promise<IPCResult<{ pid: number }>> {
  const normalizedProvider = normalizeProxyProvider(provider);
  try {
    // Already running?
    if (proxyProcess && !proxyProcess.killed && (await isProxyAlive())) {
      console.log('[Proxy] Already running, pid:', proxyProcess.pid);
      if (normalizedProvider) {
        await proxyRequest('POST', '/_proxy/switch', JSON.stringify({ provider: normalizedProvider }));
      }
      await injectProviderTokens();
      return { success: true, data: { pid: proxyProcess.pid! } };
    }

    // Guard against concurrent start calls
    if (proxyStarting) {
      while (proxyStarting) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (proxyProcess && !proxyProcess.killed && proxyReady) {
        return { success: true, data: { pid: proxyProcess.pid! } };
      }
      return { success: false, error: 'Concurrent proxy start failed' };
    }

    proxyStarting = true;

    const proxyDir = findProxyDir();
    if (!proxyDir) {
      return { success: false, error: 'Proxy directory not found (apps/proxy)' };
    }

    const python = findPython();
    if (!python) {
      return { success: false, error: 'Python not found' };
    }

    console.log('[Proxy] Starting with python:', python, 'dir:', proxyDir);

    // Kill any stale proxy from a previous session
    killStaleProxy();
    await new Promise((r) => setTimeout(r, 500));

    const args = [
      '-u',  // unbuffered stdout/stderr
      path.join(proxyDir, 'proxy_server.py'),
      '--config',
      path.join(proxyDir, 'config.json'),
    ];
    if (normalizedProvider) {
      args.push('--provider', normalizedProvider);
    }

    proxyProcess = spawn(python, args, {
      cwd: proxyDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    proxyProcess.on('exit', (code: number | null) => {
      console.log(`[Proxy] Process exited with code ${code}`);
      proxyProcess = null;
      proxyReady = false;
    });

    proxyProcess.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.log(`[Proxy] ${line}`);
    });

    // Wait for it to become ready
    proxyReady = await waitForProxyReady();
    if (!proxyReady) {
      if (proxyProcess && !proxyProcess.killed) {
        proxyProcess.kill();
      }
      proxyProcess = null;
      return { success: false, error: 'Proxy failed to start within timeout' };
    }

    // Inject provider tokens via HTTP
    await injectProviderTokens();

    return { success: true, data: { pid: proxyProcess.pid! } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start proxy',
    };
  } finally {
    proxyStarting = false;
  }
}

/**
 * Forcefully kill the proxy process.
 */
export function shutdownProxy(): void {
  if (!proxyProcess || proxyProcess.killed) return;

  const pid = proxyProcess.pid;
  console.log('[Proxy] Shutting down proxy, pid:', pid);

  if (process.platform === 'win32' && pid) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { timeout: 5000, windowsHide: true });
    } catch {
      // Process may have already exited
    }
  } else {
    proxyProcess.kill();
  }

  proxyProcess = null;
  proxyReady = false;
}

/**
 * Get the proxy base URL if running.
 * Used to inject ANTHROPIC_BASE_URL for Claude Code SDK.
 */
export function getProxyBaseUrl(): string | null {
  if (!proxyProcess || proxyProcess.killed || !proxyReady) return null;
  return `http://${PROXY_HOST}:${PROXY_PORT}`;
}

/**
 * Tell the proxy which model to use for the active provider.
 */
export async function setProxyModel(model: string): Promise<void> {
  if (!proxyProcess || proxyProcess.killed || !proxyReady) return;
  try {
    await proxyRequest('POST', '/_proxy/set-model', JSON.stringify({ model }));
  } catch (err) {
    console.warn('[Proxy] Failed to set model:', err);
  }
}

export function registerProxyHandlers(): void {
  // Start proxy server
  ipcMain.handle(
    IPC_CHANNELS.PROXY_START,
    async (_: IpcMainInvokeEvent, provider?: string): Promise<IPCResult<{ pid: number }>> => {
      return startProxyInternal(provider);
    }
  );

  // Stop proxy server
  ipcMain.handle(
    IPC_CHANNELS.PROXY_STOP,
    async (): Promise<IPCResult> => {
      try {
        if (proxyProcess && !proxyProcess.killed) {
          proxyProcess.kill();
          proxyProcess = null;
          proxyReady = false;
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop proxy',
        };
      }
    }
  );

  // Get proxy status
  ipcMain.handle(
    IPC_CHANNELS.PROXY_STATUS,
    async (): Promise<
      IPCResult<{
        running: boolean;
        active_provider?: string;
        available_providers?: string[];
      }>
    > => {
      try {
        const { status, data: raw } = await proxyRequest('GET', '/_proxy/status');
        if (status === 200) {
          const data = JSON.parse(raw);
          return {
            success: true,
            data: {
              running: true,
              active_provider: data.active_provider,
              available_providers: data.available_providers,
            },
          };
        }
        return { success: true, data: { running: false } };
      } catch {
        return { success: true, data: { running: false } };
      }
    }
  );

  // Switch provider on running proxy
  ipcMain.handle(
    IPC_CHANNELS.PROXY_SWITCH,
    async (_: IpcMainInvokeEvent, provider: string): Promise<IPCResult> => {
      try {
        const normalizedProvider = normalizeProxyProvider(provider);
        if (!normalizedProvider) {
          return { success: false, error: 'Provider is required' };
        }
        const { status, data: raw } = await proxyRequest(
          'POST',
          '/_proxy/switch',
          JSON.stringify({ provider: normalizedProvider })
        );
        if (status !== 200) {
          const err = JSON.parse(raw);
          return { success: false, error: err.error?.message || 'Switch failed' };
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch provider',
        };
      }
    }
  );

  // Discover models from the active proxy provider
  ipcMain.handle(
    IPC_CHANNELS.PROXY_DISCOVER_MODELS,
    async (): Promise<IPCResult<{ provider: string; models: Array<{ id: string; name: string }> }>> => {
      try {
        await injectProviderTokens();

        const { status, data: raw } = await proxyRequest('GET', '/_proxy/models', undefined, 15000);
        if (status === 200) {
          const data = JSON.parse(raw);
          return {
            success: true,
            data: {
              provider: data.provider,
              models: data.models || [],
            },
          };
        }
        const err = JSON.parse(raw);
        return { success: false, error: err.error?.message || `Failed to list models (${status})` };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to discover proxy models',
        };
      }
    }
  );

  // Clean up on app quit
  app.on('before-quit', () => {
    shutdownProxy();
  });

  console.warn('[IPC] Proxy handlers registered');
}
