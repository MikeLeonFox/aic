import * as fs from 'fs';
import * as path from 'path';
import type { Target, ApplyOptions } from './index.js';
import { getExtensionStorageRoot } from './index.js';

const EXTENSION_ID = 'saoudrizwan.claude-dev';
// Cline stores API provider config in its own settings file within globalStorage
const SETTINGS_RELATIVE = path.join('settings', 'clineSettings.json');

function getSettingsPath(): string | null {
  const root = getExtensionStorageRoot();
  if (!root) return null;
  return path.join(root, EXTENSION_ID, SETTINGS_RELATIVE);
}

function getExtensionDir(): string | null {
  const root = getExtensionStorageRoot();
  if (!root) return null;
  return path.join(root, EXTENSION_ID);
}

export const clineTarget: Target = {
  id: 'cline',
  label: 'Cline for VSCode',

  isInstalled(): boolean {
    const dir = getExtensionDir();
    return dir !== null && fs.existsSync(dir);
  },

  apply({ env, model }: ApplyOptions): void {
    const settingsPath = getSettingsPath();
    if (!settingsPath) return;

    try {
      let settings: Record<string, unknown> = {};
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(raw) as Record<string, unknown>;
      }

      const authToken = env['ANTHROPIC_AUTH_TOKEN'];
      const baseUrl = env['ANTHROPIC_BASE_URL'];
      const primaryModel = model || env['ANTHROPIC_MODEL'];
      const defaultAnthropicBase = 'https://api.anthropic.com';
      const isCustomEndpoint = baseUrl && baseUrl !== defaultAnthropicBase;

      if (!authToken) {
        // Subscription mode
        settings['apiProvider'] = 'anthropic';
        delete settings['apiKey'];
        if (primaryModel) settings['apiModelId'] = primaryModel;
      } else if (isCustomEndpoint) {
        // OpenAI-compatible custom endpoint
        settings['apiProvider'] = 'openai';
        settings['openAiBaseUrl'] = baseUrl;
        settings['openAiApiKey'] = authToken;
        if (primaryModel) settings['openAiModelId'] = primaryModel;
        delete settings['apiKey'];
      } else {
        // Direct Anthropic
        settings['apiProvider'] = 'anthropic';
        settings['apiKey'] = authToken;
        if (primaryModel) settings['apiModelId'] = primaryModel;
        delete settings['openAiBaseUrl'];
        delete settings['openAiApiKey'];
      }

      const dir = path.dirname(settingsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = settingsPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
      fs.renameSync(tmp, settingsPath);
    } catch {
      process.stderr.write('Warning: Could not update Cline settings\n');
    }
  },
};
