/**
 * Proxy API
 *
 * Preload API for controlling the multi-provider proxy server.
 * The proxy translates Anthropic API format to other providers,
 * allowing Claude Code SDK to work via GitHub Copilot, OpenAI, Gemini, etc.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';

export interface ProxyStatus {
  running: boolean;
  active_provider?: string;
  available_providers?: string[];
}

export interface ProxyModel {
  id: string;
  name: string;
}

export interface ProxyAPI {
  proxyStart: (provider?: string) => Promise<IPCResult<{ pid: number }>>;
  proxyStop: () => Promise<IPCResult>;
  proxyStatus: () => Promise<IPCResult<ProxyStatus>>;
  proxySwitch: (provider: string) => Promise<IPCResult>;
  proxyDiscoverModels: () => Promise<IPCResult<{ provider: string; models: ProxyModel[] }>>;
}

export const createProxyAPI = (): ProxyAPI => ({
  proxyStart: (provider?: string): Promise<IPCResult<{ pid: number }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROXY_START, provider),

  proxyStop: (): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROXY_STOP),

  proxyStatus: (): Promise<IPCResult<ProxyStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROXY_STATUS),

  proxySwitch: (provider: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROXY_SWITCH, provider),

  proxyDiscoverModels: (): Promise<IPCResult<{ provider: string; models: ProxyModel[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROXY_DISCOVER_MODELS),
});
