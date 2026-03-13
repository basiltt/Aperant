/**
 * GitHub Copilot Handlers
 *
 * IPC handlers for GitHub Copilot Direct API integration.
 * Provides functionality to:
 * - Device flow authentication (GitHub OAuth)
 * - Token exchange (GitHub token → Copilot JWT)
 * - Model discovery from Copilot API
 * - Check authentication status
 * - Fetch usage/quota data
 */

import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { loadProfilesFile, saveProfilesFile, generateProfileId, atomicModifyProfiles } from '../services/profile';

// Cache for usage data
let cachedUsageData: { data: CopilotUsageData; timestamp: number } | null = null;
const USAGE_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Copilot internal API constants (mimics VS Code Copilot extension)
const COPILOT_CHAT_VERSION = '0.26.7';
const GITHUB_API_VERSION = '2025-04-01';

/** Quota detail from the copilot_internal/user API */
interface RawQuotaDetail {
  entitlement: number;
  overage_count: number;
  overage_permitted: boolean;
  percent_remaining: number;
  quota_id: string;
  quota_remaining: number;
  remaining: number;
  unlimited: boolean;
}

/** Response from GET /copilot_internal/user */
interface CopilotInternalUserResponse {
  access_type_sku: string;
  copilot_plan: string;
  quota_reset_date: string;
  chat_enabled: boolean;
  quota_snapshots: {
    chat: RawQuotaDetail;
    completions: RawQuotaDetail;
    premium_interactions: RawQuotaDetail;
  };
}

/** Normalized usage data for the frontend */
interface CopilotQuotaDetail {
  entitlement: number;
  remaining: number;
  percentRemaining: number;
  unlimited: boolean;
  overageCount: number;
  overagePermitted: boolean;
}

interface CopilotUsageData {
  copilotPlan: string;
  premiumRequests: CopilotQuotaDetail;
  chat: CopilotQuotaDetail;
  completions: CopilotQuotaDetail;
  quotaResetDate: string;
}

/**
 * Collect all candidate GitHub tokens from every source.
 * Returns them in priority order: stored profile → env vars → gh CLI.
 */
async function collectGitHubTokenCandidates(): Promise<Array<{ token: string; source: string }>> {
  const candidates: Array<{ token: string; source: string }> = [];

  // 1. Stored Copilot API profile token
  try {
    const profilesFile = await loadProfilesFile();
    const copilotProfile = profilesFile.profiles.find(
      (p) => p.providerType === 'copilot' || p.providerId === 'github-copilot'
    );
    if (copilotProfile?.apiKey) {
      candidates.push({ token: copilotProfile.apiKey, source: 'stored-profile' });
    }
  } catch {
    // Profile not found
  }

  // 2. Environment variables
  const envToken = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (envToken) {
    candidates.push({ token: envToken, source: 'env-var' });
  }

  // 3. gh CLI
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
    });
    const cliToken = stdout.trim();
    if (cliToken) {
      candidates.push({ token: cliToken, source: 'gh-cli' });
    }
  } catch {
    // gh CLI not available
  }

  return candidates;
}

// Cache for the validated Copilot token
let validatedCopilotToken: { token: string; source: string; timestamp: number } | null = null;
const TOKEN_VALIDATION_CACHE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Test whether a GitHub token has Copilot access by hitting the internal API.
 */
async function hasCopilotAccess(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/copilot_internal/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/json',
        'Editor-Version': 'vscode/1.99.0',
        'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
        'User-Agent': `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve a GitHub token for Copilot API calls.
 * Tries all token sources and returns the first one with Copilot access.
 */
export async function resolveGitHubToken(): Promise<string | null> {
  // Return cached validated token if still fresh
  if (validatedCopilotToken && Date.now() - validatedCopilotToken.timestamp < TOKEN_VALIDATION_CACHE_MS) {
    console.log(`[Copilot] Using cached validated token (source: ${validatedCopilotToken.source})`);
    return validatedCopilotToken.token;
  }

  const candidates = await collectGitHubTokenCandidates();
  if (candidates.length === 0) {
    console.warn('[Copilot] No GitHub token found from any source');
    return null;
  }

  // If only one candidate, use it directly
  if (candidates.length === 1) {
    console.log(`[Copilot] Token resolved from ${candidates[0].source} (single source)`);
    return candidates[0].token;
  }

  // Multiple candidates — validate each against Copilot API
  for (const candidate of candidates) {
    const hasAccess = await hasCopilotAccess(candidate.token);
    if (hasAccess) {
      console.log(`[Copilot] Token validated with Copilot access from: ${candidate.source}`);
      validatedCopilotToken = { ...candidate, timestamp: Date.now() };
      return candidate.token;
    }
    console.log(`[Copilot] Token from ${candidate.source} has NO Copilot access, trying next...`);
  }

  // None validated — fall back to first candidate
  console.warn('[Copilot] No token has Copilot access, falling back to:', candidates[0].source);
  return candidates[0].token;
}

/**
 * Normalize a raw quota detail from the API response.
 */
function normalizeQuotaDetail(raw: RawQuotaDetail): CopilotQuotaDetail {
  return {
    entitlement: raw.entitlement,
    remaining: raw.remaining,
    percentRemaining: raw.percent_remaining,
    unlimited: raw.unlimited,
    overageCount: raw.overage_count,
    overagePermitted: raw.overage_permitted,
  };
}

/**
 * Fetch Copilot usage from the internal GitHub API.
 */
async function fetchCopilotUsageData(): Promise<CopilotUsageData> {
  if (cachedUsageData && Date.now() - cachedUsageData.timestamp < USAGE_CACHE_DURATION_MS) {
    return cachedUsageData.data;
  }

  const token = await resolveGitHubToken();
  if (!token) {
    throw new Error('No GitHub token available. Please authenticate with GitHub first.');
  }

  const response = await fetch('https://api.github.com/copilot_internal/user', {
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Editor-Version': 'vscode/1.99.0',
      'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
      'User-Agent': `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('GitHub token does not have Copilot access. Ensure you have an active Copilot subscription.');
    }
    if (response.status === 404) {
      throw new Error('Copilot usage data not available. You may not have an active Copilot subscription.');
    }
    throw new Error(`GitHub API error: HTTP ${response.status} ${response.statusText || 'Unknown'}`);
  }

  const raw = await response.json() as CopilotInternalUserResponse;

  const snapshots = raw.quota_snapshots;
  if (!snapshots || typeof snapshots !== 'object') {
    throw new Error('Invalid Copilot API response: missing quota_snapshots');
  }

  const defaultQuota: RawQuotaDetail = {
    entitlement: 0,
    overage_count: 0,
    overage_permitted: false,
    percent_remaining: 100,
    quota_id: '',
    quota_remaining: 0,
    remaining: 0,
    unlimited: true,
  };

  const usageData: CopilotUsageData = {
    copilotPlan: raw.copilot_plan || raw.access_type_sku || 'unknown',
    premiumRequests: normalizeQuotaDetail(snapshots.premium_interactions || defaultQuota),
    chat: normalizeQuotaDetail(snapshots.chat || defaultQuota),
    completions: normalizeQuotaDetail(snapshots.completions || defaultQuota),
    quotaResetDate: raw.quota_reset_date || '',
  };

  cachedUsageData = { data: usageData, timestamp: Date.now() };
  return usageData;
}

/**
 * Get the GitHub username for a token.
 */
async function getGitHubUsername(token: string): Promise<string | undefined> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json() as { login?: string };
      return data.login;
    }
  } catch {
    // Token may be expired or invalid
  }
  return undefined;
}

/**
 * Check if GitHub authentication is available for Copilot.
 */
async function checkGitHubAuth(): Promise<{ authenticated: boolean; username?: string; autoDetected?: boolean }> {
  const candidates = await collectGitHubTokenCandidates();

  if (candidates.length === 0) {
    return { authenticated: false };
  }

  const storedProfileCandidate = candidates.find(c => c.source === 'stored-profile');

  if (storedProfileCandidate) {
    const hasAccess = await hasCopilotAccess(storedProfileCandidate.token);
    if (hasAccess) {
      const username = await getGitHubUsername(storedProfileCandidate.token);
      return { authenticated: true, username };
    }
    return { authenticated: false };
  }

  for (const candidate of candidates) {
    const hasAccess = await hasCopilotAccess(candidate.token);
    if (hasAccess) {
      return { authenticated: true, autoDetected: true };
    }
  }

  return { authenticated: false };
}

// Copilot Direct API constants
const COPILOT_DEVICE_FLOW_CLIENT_ID = '01ab8ac9400c4e429b23';
const COPILOT_API_BASE = 'https://api.githubcopilot.com';
const COPILOT_TOKEN_EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';

/** Response from GitHub device flow code request */
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/** Response from Copilot token exchange */
interface CopilotTokenExchangeResponse {
  token: string;
  expires_at: number;
}

/**
 * GitHub Device Flow auth for Copilot.
 * Opens the browser for the user to authorize, polls for completion.
 */
async function startDeviceFlowLogin(): Promise<{ githubToken: string; username: string }> {
  const { shell } = await import('electron');

  // Step 1: Request device code
  const codeResponse = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: COPILOT_DEVICE_FLOW_CLIENT_ID,
      scope: 'read:user',
    }),
  });

  if (!codeResponse.ok) {
    throw new Error(`Device code request failed: HTTP ${codeResponse.status}`);
  }

  const codeData = await codeResponse.json() as DeviceCodeResponse;

  // Send device code to renderer so UI can display it
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(IPC_CHANNELS.COPILOT_DEVICE_CODE, {
      userCode: codeData.user_code,
      verificationUri: codeData.verification_uri,
    });
  }

  // Step 2: Open browser for user authorization
  shell.openExternal(codeData.verification_uri);

  // Step 3: Poll for token
  const pollInterval = (codeData.interval || 5) * 1000;
  const pollTimeout = (codeData.expires_in || 900) * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < pollTimeout) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: COPILOT_DEVICE_FLOW_CLIENT_ID,
        device_code: codeData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!tokenResponse.ok) continue;

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.error === 'authorization_pending') continue;
    if (tokenData.error === 'slow_down') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }
    if (tokenData.error) {
      throw new Error(`Device flow auth failed: ${tokenData.error}`);
    }

    if (tokenData.access_token) {
      let username = '';
      try {
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (userResponse.ok) {
          const userData = await userResponse.json() as { login?: string };
          username = userData.login || '';
        }
      } catch { /* ignore */ }

      return {
        githubToken: tokenData.access_token,
        username,
      };
    }
  }

  throw new Error('Device flow authorization timed out.');
}

/**
 * Exchange a GitHub token for a short-lived Copilot API JWT.
 */
async function exchangeCopilotToken(githubToken: string): Promise<CopilotTokenExchangeResponse> {
  const response = await fetch(COPILOT_TOKEN_EXCHANGE_URL, {
    method: 'GET',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/json',
      'Editor-Version': 'vscode/1.99.0',
      'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
      'User-Agent': `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('GitHub token rejected. Ensure your account has an active Copilot subscription.');
    }
    throw new Error(`Copilot token exchange failed: HTTP ${response.status}`);
  }

  const data = await response.json() as CopilotTokenExchangeResponse;
  if (!data.token) {
    throw new Error('Invalid token exchange response: no token returned');
  }

  return data;
}

/**
 * Discover available models from the Copilot API.
 */
async function discoverCopilotModelsFromAPI(githubToken: string): Promise<Array<{ id: string; name: string }>> {
  const { token: copilotToken } = await exchangeCopilotToken(githubToken);

  const response = await fetch(`${COPILOT_API_BASE}/models`, {
    headers: {
      'Authorization': `Bearer ${copilotToken}`,
      'Accept': 'application/json',
      'Editor-Version': 'vscode/1.99.0',
      'Editor-Plugin-Version': `copilot-chat/${COPILOT_CHAT_VERSION}`,
      'Copilot-Integration-Id': 'vscode-chat',
      'Openai-Organization': 'github-copilot',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: HTTP ${response.status}`);
  }

  const data = await response.json() as { data?: Array<{ id: string; name?: string }> };
  const allModels = data.data || [];

  // Filter out non-chat models
  const nonChatPatterns = [/embed/i, /ada/i, /goldeneye/i, /dall-?e/i, /whisper/i, /tts/i];
  const chatModels = allModels.filter(m =>
    !nonChatPatterns.some(p => p.test(m.id))
  );

  return chatModels.map(m => ({
    id: m.id,
    name: m.name || m.id,
  }));
}

/**
 * Register GitHub Copilot IPC handlers.
 */
export function registerCopilotHandlers(): void {
  // Check Copilot auth status
  ipcMain.handle(
    IPC_CHANNELS.COPILOT_CHECK_AUTH,
    async (): Promise<IPCResult<{ authenticated: boolean; username?: string }>> => {
      try {
        const authResult = await checkGitHubAuth();
        return { success: true, data: authResult };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot] Auth check failed:', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  );

  // Fetch Copilot usage via internal GitHub API
  ipcMain.handle(
    IPC_CHANNELS.COPILOT_FETCH_USAGE,
    async (): Promise<IPCResult<CopilotUsageData>> => {
      try {
        const usageData = await fetchCopilotUsageData();
        return { success: true, data: usageData };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot] Usage fetch failed:', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  );

  // Device flow login
  ipcMain.handle(
    IPC_CHANNELS.COPILOT_DEVICE_LOGIN,
    async (): Promise<IPCResult<{ githubToken: string; username: string; userCode?: string }>> => {
      try {
        const result = await startDeviceFlowLogin();

        // Invalidate cached tokens/usage so the new account is picked up
        validatedCopilotToken = null;
        cachedUsageData = null;

        // Auto-create or update Copilot API profile with the GitHub token
        try {
          const file = await loadProfilesFile();
          const existingProfile = file.profiles.find(
            (p) => p.providerType === 'copilot' || p.providerId === 'github-copilot'
          );

          if (existingProfile) {
            // Update existing profile's API key (GitHub token)
            await atomicModifyProfiles((f) => {
              const profile = f.profiles.find(p => p.id === existingProfile.id);
              if (profile) {
                profile.apiKey = result.githubToken;
                profile.name = `GitHub Copilot (${result.username || 'account'})`;
                profile.updatedAt = Date.now();
              }
              return f;
            });
            console.log('[Copilot] Updated existing Copilot profile with new token');
          } else {
            // Create new Copilot profile
            const now = Date.now();
            const newProfile = {
              id: generateProfileId(),
              name: `GitHub Copilot (${result.username || 'account'})`,
              baseUrl: 'https://api.githubcopilot.com',
              apiKey: result.githubToken,
              providerType: 'copilot' as const,
              providerId: 'github-copilot',
              models: { default: 'claude-sonnet-4' },
              createdAt: now,
              updatedAt: now,
            };
            file.profiles.push(newProfile);
            await saveProfilesFile(file);
            console.log('[Copilot] Created new Copilot profile');
          }
        } catch (profileErr) {
          console.warn('[Copilot] Failed to create/update Copilot profile:', profileErr);
        }

        return { success: true, data: result };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot] Device flow login failed:', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  );

  // Exchange GitHub token for Copilot API JWT
  ipcMain.handle(
    IPC_CHANNELS.COPILOT_EXCHANGE_TOKEN,
    async (_event: IpcMainInvokeEvent, githubToken: string): Promise<IPCResult<{ copilotToken: string; expiresAt: number }>> => {
      try {
        if (!githubToken || typeof githubToken !== 'string') {
          throw new Error('GitHub token is required');
        }
        const exchangeResult = await exchangeCopilotToken(githubToken);
        return {
          success: true,
          data: {
            copilotToken: exchangeResult.token,
            expiresAt: exchangeResult.expires_at,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot] Token exchange failed:', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  );

  // Discover models from Copilot API
  ipcMain.handle(
    IPC_CHANNELS.COPILOT_DISCOVER_MODELS,
    async (_event: IpcMainInvokeEvent, githubToken: string): Promise<IPCResult<{ models: Array<{ id: string; name: string }> }>> => {
      try {
        if (!githubToken || typeof githubToken !== 'string') {
          throw new Error('GitHub token is required');
        }
        const models = await discoverCopilotModelsFromAPI(githubToken);
        return { success: true, data: { models } };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot] Model discovery failed:', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  );

  // Discover models auto — resolves GitHub token from stored accounts automatically
  ipcMain.handle(
    IPC_CHANNELS.COPILOT_DISCOVER_MODELS_AUTO,
    async (): Promise<IPCResult<{ models: Array<{ id: string; name: string }> }>> => {
      try {
        const token = await resolveGitHubToken();
        if (!token) throw new Error('No GitHub token found — sign in to GitHub Copilot first');
        const models = await discoverCopilotModelsFromAPI(token);
        return { success: true, data: { models } };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Copilot] Auto model discovery failed:', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  );

  console.warn('[IPC] GitHub Copilot handlers registered');
}
