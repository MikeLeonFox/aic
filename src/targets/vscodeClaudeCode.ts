import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Target, ApplyOptions } from './index.js';

function getVSCodeSettingsPath(): string | null {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  } else if (platform === 'linux') {
    return path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
  } else if (platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (!appData) return null;
    return path.join(appData, 'Code', 'User', 'settings.json');
  }
  return null;
}

export const vscodeClaudeCodeTarget: Target = {
  id: 'vscode-claude-code',
  label: 'Claude Code for VSCode (settings.json)',

  isInstalled(): boolean {
    const p = getVSCodeSettingsPath();
    return p !== null && fs.existsSync(p);
  },

  apply({ env, model }: ApplyOptions): void {
    const vscodePath = getVSCodeSettingsPath();
    if (!vscodePath || !fs.existsSync(vscodePath)) return;

    try {
      const raw = fs.readFileSync(vscodePath, 'utf-8');
      const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
      const settings = JSON.parse(cleaned) as Record<string, unknown>;

      const envArray = Object.entries(env)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ({ name, value }));

      settings['claudeCode.environmentVariables'] = envArray;

      if (model) {
        settings['claudeCode.selectedModel'] = model;
      }

      const dir = path.dirname(vscodePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = vscodePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
      fs.renameSync(tmp, vscodePath);
    } catch {
      process.stderr.write('Warning: Could not update VSCode settings\n');
    }
  },
};
