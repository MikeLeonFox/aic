import * as path from 'path';
import * as os from 'os';
import { claudeCodeTarget } from './claudeCode.js';
import { vscodeClaudeCodeTarget } from './vscodeClaudeCode.js';
import { rooCodeTarget } from './rooCode.js';
import { clineTarget } from './cline.js';

export interface ApplyOptions {
  /** Full env dict to write into the target's config (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, etc.) */
  env: Record<string, string>;
  /** Primary model, if set */
  model?: string;
  /** Whether to enable always-thinking (Claude Code target only) */
  alwaysThinking?: boolean;
  /** Keys previously written by aic, to be cleaned up before writing new ones (Claude Code target only) */
  previousKeys?: string[];
}

export interface Target {
  /** Stable identifier used in provider.targets and targetEnvs */
  id: string;
  /** Human-readable label shown to the user */
  label: string;
  /** Return true if this tool appears to be installed on the system */
  isInstalled(): boolean;
  /**
   * Write the provider config into this target's settings file.
   * All errors should be non-fatal (log a warning, don't throw).
   */
  apply(opts: ApplyOptions): void;
}

/** Ordered registry of all supported targets */
const ALL_TARGETS: Target[] = [
  claudeCodeTarget,
  vscodeClaudeCodeTarget,
  rooCodeTarget,
  clineTarget,
];

export function allTargets(): Target[] {
  return ALL_TARGETS;
}

export function installedTargets(): Target[] {
  return ALL_TARGETS.filter(t => t.isInstalled());
}

export function targetById(id: string): Target | undefined {
  return ALL_TARGETS.find(t => t.id === id);
}

/** Returns the platform-specific VS Code extension globalStorage root */
export function getExtensionStorageRoot(): string | null {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage');
  } else if (platform === 'linux') {
    return path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage');
  } else if (platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (!appData) return null;
    return path.join(appData, 'Code', 'User', 'globalStorage');
  }
  return null;
}
