import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as keytar from 'keytar';
import { Config, Provider, requiresApiKey } from '../types/provider.js';
import { installedTargets } from '../targets/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.ai-providers');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const KEYCHAIN_SERVICE = 'ai-provider-cli';

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig: Config = { providers: [] };
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  const configData = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(configData) as Config;
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  const tmpFile = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmpFile, CONFIG_FILE);
}

export async function setApiKey(providerName: string, apiKey: string): Promise<void> {
  await keytar.setPassword(KEYCHAIN_SERVICE, providerName, apiKey);
}

export async function getApiKey(providerName: string): Promise<string | null> {
  return await keytar.getPassword(KEYCHAIN_SERVICE, providerName);
}

export async function deleteApiKey(providerName: string): Promise<boolean> {
  return await keytar.deletePassword(KEYCHAIN_SERVICE, providerName);
}

export async function addProvider(provider: Provider, apiKey?: string): Promise<void> {
  const config = loadConfig();

  const existingIndex = config.providers.findIndex(p => p.name === provider.name);
  if (existingIndex !== -1) {
    throw new Error(`Provider '${provider.name}' already exists`);
  }

  if (apiKey && requiresApiKey(provider)) {
    await setApiKey(provider.name, apiKey);
  }

  config.providers.push(provider);

  if (config.providers.length === 1) {
    config.activeProvider = provider.name;
  }

  saveConfig(config);
}

export async function removeProvider(providerName: string): Promise<void> {
  const config = loadConfig();

  const providerIndex = config.providers.findIndex(p => p.name === providerName);
  if (providerIndex === -1) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  const provider = config.providers[providerIndex];

  if (requiresApiKey(provider)) {
    await deleteApiKey(providerName);
  }

  config.providers.splice(providerIndex, 1);

  if (config.activeProvider === providerName) {
    config.activeProvider = config.providers.length > 0 ? config.providers[0].name : undefined;
  }

  if (config.previousProvider === providerName) {
    config.previousProvider = undefined;
  }

  saveConfig(config);
}

export async function setActiveProvider(providerName: string): Promise<string[]> {
  const config = loadConfig();

  const provider = config.providers.find(p => p.name === providerName);
  if (!provider) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  config.previousProvider = config.activeProvider;
  config.activeProvider = providerName;

  // ── Build the base env dict ──────────────────────────────────────────────
  const env: Record<string, string> = {};
  const appliedKeys: string[] = [];

  if (provider.type === 'claude' || provider.type === 'litellm') {
    const apiKey = await getApiKey(providerName);
    if (apiKey) {
      env['ANTHROPIC_AUTH_TOKEN'] = apiKey;
      appliedKeys.push('ANTHROPIC_AUTH_TOKEN');
    }
    env['ANTHROPIC_BASE_URL'] = provider.endpoint;
    appliedKeys.push('ANTHROPIC_BASE_URL');
  }
  // subscription type: no auth vars — previousKeys cleanup removes the old ones

  if (provider.model) {
    env['ANTHROPIC_MODEL'] = provider.model;
    appliedKeys.push('ANTHROPIC_MODEL');
  }
  if (provider.smallModel) {
    env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = provider.smallModel;
    appliedKeys.push('ANTHROPIC_DEFAULT_HAIKU_MODEL');
  }
  if (provider.options?.disableTelemetry) {
    env['DISABLE_TELEMETRY'] = '1';
    appliedKeys.push('DISABLE_TELEMETRY');
  }
  if (provider.options?.disableBetas) {
    env['CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS'] = '1';
    appliedKeys.push('CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS');
  }

  // Custom HTTP headers — stored as JSON in a single env var
  if (provider.headers && Object.keys(provider.headers).length > 0) {
    env['ANTHROPIC_CUSTOM_HEADERS'] = JSON.stringify(provider.headers);
    appliedKeys.push('ANTHROPIC_CUSTOM_HEADERS');
  }

  // Global custom env vars (applied to all targets)
  if (provider.customEnvs) {
    for (const [key, value] of Object.entries(provider.customEnvs)) {
      env[key] = value;
      appliedKeys.push(key);
    }
  }

  // ── Apply to each installed target ───────────────────────────────────────
  const targets = installedTargets();
  const targetFilter = provider.targets; // undefined = apply to all

  const updatedLabels: string[] = [];

  for (const target of targets) {
    if (targetFilter && !targetFilter.includes(target.id)) continue;

    // Merge per-target env vars on top of the base env dict
    const targetEnv = { ...env };
    const perTargetEnvs = provider.targetEnvs?.[target.id];
    if (perTargetEnvs) {
      for (const [key, value] of Object.entries(perTargetEnvs)) {
        targetEnv[key] = value;
      }
    }

    target.apply({
      env: targetEnv,
      model: provider.model,
      alwaysThinking: provider.options?.alwaysThinking,
      // Only the Claude Code CLI target uses previousKeys for cleanup
      previousKeys: target.id === 'claude-code' ? config.lastAppliedEnvKeys : undefined,
    });

    updatedLabels.push(target.label);
  }

  config.lastAppliedEnvKeys = appliedKeys;
  saveConfig(config);

  return updatedLabels;
}

export async function getActiveProvider(): Promise<{ provider: Provider; apiKey?: string } | null> {
  const config = loadConfig();

  if (!config.activeProvider) return null;

  const provider = config.providers.find(p => p.name === config.activeProvider);
  if (!provider) return null;

  let apiKey: string | undefined;
  if (requiresApiKey(provider)) {
    const key = await getApiKey(provider.name);
    apiKey = key || undefined;
  }

  return { provider, apiKey };
}

export function setProviderEnv(providerName: string, key: string, value: string, targetId?: string): void {
  const config = loadConfig();
  const provider = config.providers.find(p => p.name === providerName);
  if (!provider) throw new Error(`Provider '${providerName}' not found`);

  if (targetId) {
    if (!provider.targetEnvs) provider.targetEnvs = {};
    if (!provider.targetEnvs[targetId]) provider.targetEnvs[targetId] = {};
    provider.targetEnvs[targetId][key] = value;
  } else {
    if (!provider.customEnvs) provider.customEnvs = {};
    provider.customEnvs[key] = value;
  }

  saveConfig(config);
}

export function deleteProviderEnv(providerName: string, key: string, targetId?: string): boolean {
  const config = loadConfig();
  const provider = config.providers.find(p => p.name === providerName);
  if (!provider) throw new Error(`Provider '${providerName}' not found`);

  if (targetId) {
    if (!provider.targetEnvs?.[targetId] || !(key in provider.targetEnvs[targetId])) return false;
    delete provider.targetEnvs[targetId][key];
    if (Object.keys(provider.targetEnvs[targetId]).length === 0) {
      delete provider.targetEnvs[targetId];
    }
  } else {
    if (!provider.customEnvs || !(key in provider.customEnvs)) return false;
    delete provider.customEnvs[key];
  }

  saveConfig(config);
  return true;
}

export function listProviders(): Provider[] {
  const config = loadConfig();
  return config.providers;
}

export function getActiveProviderName(): string | undefined {
  const config = loadConfig();
  return config.activeProvider;
}

export function getPreviousProviderName(): string | undefined {
  const config = loadConfig();
  return config.previousProvider;
}
