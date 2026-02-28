import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Target, ApplyOptions } from './index.js';

const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

function loadSettings(): Record<string, unknown> {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) return {};
  const raw = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
  const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned);
}

function saveSettings(settings: Record<string, unknown>): void {
  const dir = path.dirname(CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = CLAUDE_SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
  fs.renameSync(tmp, CLAUDE_SETTINGS_FILE);
}

export const claudeCodeTarget: Target = {
  id: 'claude-code',
  label: 'Claude Code (~/.claude/settings.json)',

  isInstalled(): boolean {
    // Claude Code is our primary tool; treat it as always-present.
    return true;
  },

  apply({ env, alwaysThinking, previousKeys }: ApplyOptions): void {
    const settings = loadSettings();
    const currentEnv: Record<string, string> = (settings['env'] as Record<string, string>) || {};

    // Remove keys written by the previous provider
    if (previousKeys) {
      for (const key of previousKeys) {
        delete currentEnv[key];
      }
    }

    // Write new env vars
    for (const [key, value] of Object.entries(env)) {
      currentEnv[key] = value;
    }

    settings['env'] = currentEnv;

    // alwaysThinkingEnabled is a top-level key
    if (alwaysThinking !== undefined) {
      settings['alwaysThinkingEnabled'] = alwaysThinking;
    }

    saveSettings(settings);
  },
};

export interface DiscoveredConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  smallModel?: string;
  alwaysThinking?: boolean;
  disableTelemetry?: boolean;
  disableBetas?: boolean;
  customEnvs?: Record<string, string>;
  customHeaders?: Record<string, string>;
}

const KNOWN_ENV_KEYS = new Set([
  'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'DISABLE_TELEMETRY', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'ANTHROPIC_CUSTOM_HEADERS',
]);

/** Read current config from ~/.claude/settings.json */
export function readClaudeCodeConfig(): DiscoveredConfig | null {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) return null;
  const settings = loadSettings();
  const env = (settings['env'] as Record<string, string>) || {};

  const apiKey = env['ANTHROPIC_AUTH_TOKEN'] || env['ANTHROPIC_API_KEY'];
  const endpoint = env['ANTHROPIC_BASE_URL'];
  const model = env['ANTHROPIC_MODEL'];
  const smallModel = env['ANTHROPIC_DEFAULT_HAIKU_MODEL'];
  const alwaysThinking = settings['alwaysThinkingEnabled'] as boolean | undefined;
  const disableTelemetry = env['DISABLE_TELEMETRY'] === '1';
  const disableBetas = env['CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS'] === '1';

  let customHeaders: Record<string, string> | undefined;
  if (env['ANTHROPIC_CUSTOM_HEADERS']) {
    try { customHeaders = JSON.parse(env['ANTHROPIC_CUSTOM_HEADERS']); } catch { /* ignore */ }
  }

  const customEnvs: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!KNOWN_ENV_KEYS.has(key)) customEnvs[key] = value;
  }

  return {
    apiKey,
    endpoint: endpoint || 'https://api.anthropic.com',
    model,
    smallModel,
    alwaysThinking,
    disableTelemetry: disableTelemetry || undefined,
    disableBetas: disableBetas || undefined,
    customEnvs: Object.keys(customEnvs).length > 0 ? customEnvs : undefined,
    customHeaders,
  };
}
