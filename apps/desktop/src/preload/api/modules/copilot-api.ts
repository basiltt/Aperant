/**
 * GitHub Copilot API for renderer process
 *
 * Provides access to Copilot Direct API management:
 * - Device flow authentication
 * - Token exchange
 * - Model discovery
 * - Authentication and usage checks
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import { invokeIpc, createIpcListener } from './ipc-utils';

export interface CopilotAuthResult {
  success: boolean;
  data?: {
    authenticated: boolean;
    username?: string;
    autoDetected?: boolean;
  };
  error?: string;
}

export interface CopilotQuotaDetail {
  entitlement: number;
  remaining: number;
  percentRemaining: number;
  unlimited: boolean;
  overageCount: number;
  overagePermitted: boolean;
}

export interface CopilotUsageData {
  copilotPlan: string;
  premiumRequests: CopilotQuotaDetail;
  chat: CopilotQuotaDetail;
  completions: CopilotQuotaDetail;
  quotaResetDate: string;
}

export interface CopilotUsageResult {
  success: boolean;
  data?: CopilotUsageData;
  error?: string;
}

export interface CopilotDeviceLoginResult {
  success: boolean;
  data?: {
    githubToken: string;
    username: string;
    userCode?: string;
  };
  error?: string;
}

export interface CopilotTokenExchangeResult {
  success: boolean;
  data?: {
    copilotToken: string;
    expiresAt: number;
  };
  error?: string;
}

export interface CopilotModelDiscoveryResult {
  success: boolean;
  data?: {
    models: Array<{ id: string; name: string }>;
  };
  error?: string;
}

export interface CopilotAPI {
  checkCopilotAuth: () => Promise<CopilotAuthResult>;
  fetchCopilotUsage: () => Promise<CopilotUsageResult>;
  copilotDeviceLogin: () => Promise<CopilotDeviceLoginResult>;
  copilotExchangeToken: (githubToken: string) => Promise<CopilotTokenExchangeResult>;
  copilotDiscoverModels: (githubToken: string) => Promise<CopilotModelDiscoveryResult>;
  copilotDiscoverModelsAuto: () => Promise<CopilotModelDiscoveryResult>;
  onCopilotDeviceCode: (callback: (data: { userCode: string; verificationUri: string }) => void) => () => void;
}

export const createCopilotAPI = (): CopilotAPI => ({
  checkCopilotAuth: (): Promise<CopilotAuthResult> =>
    invokeIpc(IPC_CHANNELS.COPILOT_CHECK_AUTH),

  fetchCopilotUsage: (): Promise<CopilotUsageResult> =>
    invokeIpc(IPC_CHANNELS.COPILOT_FETCH_USAGE),

  copilotDeviceLogin: (): Promise<CopilotDeviceLoginResult> =>
    invokeIpc(IPC_CHANNELS.COPILOT_DEVICE_LOGIN),

  copilotExchangeToken: (githubToken: string): Promise<CopilotTokenExchangeResult> =>
    invokeIpc(IPC_CHANNELS.COPILOT_EXCHANGE_TOKEN, githubToken),

  copilotDiscoverModels: (githubToken: string): Promise<CopilotModelDiscoveryResult> =>
    invokeIpc(IPC_CHANNELS.COPILOT_DISCOVER_MODELS, githubToken),

  copilotDiscoverModelsAuto: (): Promise<CopilotModelDiscoveryResult> =>
    invokeIpc(IPC_CHANNELS.COPILOT_DISCOVER_MODELS_AUTO),

  onCopilotDeviceCode: (callback: (data: { userCode: string; verificationUri: string }) => void): (() => void) =>
    createIpcListener(IPC_CHANNELS.COPILOT_DEVICE_CODE, callback),
});
