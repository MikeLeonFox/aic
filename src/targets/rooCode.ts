import * as fs from 'fs';
import * as path from 'path';
import type { Target, ApplyOptions } from './index.js';
import { getExtensionStorageRoot } from './index.js';
import type { DiscoveredConfig } from './claudeCode.js';

const EXTENSION_ID = 'rooveterinaryinc.roo-cline';
const SETTINGS_RELATIVE = path.join('settings', 'globalSettings.json');

function getSettingsPath(): string | null {
  const root = getExtensionStorageRoot();
  if (!root) return null;
  return path.join(root, EXTENSION_ID, SETTINGS_RELATIVE);
}

export function readRooCodeConfig(): DiscoveredConfig | null {
  const settingsPath = getSettingsPath();
  if (!settingsPath || !fs.existsSync(settingsPath)) return null;

  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const provider = settings['apiProvider'] as string | undefined;

    if (provider === 'openai') {
      return {
        apiKey: settings['openAiApiKey'] as string | undefined,
        endpoint: settings['openAiBaseUrl'] as string | undefined,
        model: settings['openAiModelId'] as string | undefined,
      };
    } else {
      // anthropic or other
      return {
        apiKey: settings['apiKey'] as string | undefined,
        endpoint: (settings['anthropicBaseUrl'] as string | undefined) || 'https://api.anthropic.com',
        model: settings['apiModelId'] as string | undefined,
      };
    }
  } catch {
    return null;
  }
}

export const rooCodeTarget: Target = {
  id: 'roo-code',
  label: 'Roo Code for VSCode',

  isInstalled(): boolean {
    const p = getSettingsPath();
    return p !== null && fs.existsSync(p);
  },

  apply({ env, model }: ApplyOptions): void {
    const settingsPath = getSettingsPath();
    if (!settingsPath || !fs.existsSync(settingsPath)) return;

    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(raw) as Record<string, unknown>;

      const authToken = env['ANTHROPIC_AUTH_TOKEN'];
      const baseUrl = env['ANTHROPIC_BASE_URL'];
      const primaryModel = model || env['ANTHROPIC_MODEL'];
      const defaultAnthropicBase = 'https://api.anthropic.com';
      const isCustomEndpoint = baseUrl && baseUrl !== defaultAnthropicBase;

      if (!authToken) {
        // Subscription mode — clear API key, keep native auth
        settings['apiProvider'] = 'anthropic';
        delete settings['apiKey'];
        delete settings['anthropicBaseUrl'];
        if (primaryModel) settings['apiModelId'] = primaryModel;
      } else if (isCustomEndpoint) {
        // LiteLLM or other OpenAI-compatible proxy
        settings['apiProvider'] = 'openai';
        settings['openAiBaseUrl'] = baseUrl;
        settings['openAiApiKey'] = authToken;
        if (primaryModel) settings['openAiModelId'] = primaryModel;
        delete settings['apiKey'];
        delete settings['anthropicBaseUrl'];
      } else {
        // Direct Anthropic API
        settings['apiProvider'] = 'anthropic';
        settings['apiKey'] = authToken;
        if (baseUrl && baseUrl !== defaultAnthropicBase) {
          settings['anthropicBaseUrl'] = baseUrl;
        } else {
          delete settings['anthropicBaseUrl'];
        }
        if (primaryModel) settings['apiModelId'] = primaryModel;
        delete settings['openAiBaseUrl'];
        delete settings['openAiApiKey'];
        delete settings['openAiModelId'];
      }

      const dir = path.dirname(settingsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = settingsPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
      fs.renameSync(tmp, settingsPath);
    } catch {
      process.stderr.write('Warning: Could not update Roo Code settings\n');
    }
  },
};
