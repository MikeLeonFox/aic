import chalk from 'chalk';
import prompts from 'prompts';
import { addProvider, setApiKey, setActiveProvider } from '../config/manager.js';
import { Provider, ProviderOptions, validateProviderName } from '../types/provider.js';
import { readClaudeCodeConfig, type DiscoveredConfig } from '../targets/claudeCode.js';
import { readRooCodeConfig, rooCodeTarget } from '../targets/rooCode.js';
import { claudeCodeTarget } from '../targets/claudeCode.js';

interface DiscoverCommandOptions {
  name?: string;
}

interface DiscoverSource {
  label: string;
  read: () => DiscoveredConfig | null;
  isAvailable: () => boolean;
}

const SOURCES: DiscoverSource[] = [
  {
    label: 'Claude Code (~/.claude/settings.json)',
    read: readClaudeCodeConfig,
    isAvailable: () => claudeCodeTarget.isInstalled(),
  },
  {
    label: 'Roo Code (VSCode extension globalStorage)',
    read: readRooCodeConfig,
    isAvailable: () => rooCodeTarget.isInstalled(),
  },
];

function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.substring(0, 8) + '***';
}

function printDiscovered(cfg: DiscoveredConfig): void {
  console.log(`  API Key:  ${cfg.apiKey ? maskApiKey(cfg.apiKey) : chalk.yellow('none (subscription mode)')}`);
  console.log(`  Endpoint: ${cfg.endpoint || 'https://api.anthropic.com'}`);
  if (cfg.model) console.log(`  Model:    ${cfg.model}`);
  if (cfg.smallModel) console.log(`  Small model: ${cfg.smallModel}`);
  if (cfg.alwaysThinking !== undefined) console.log(`  Always thinking: ${cfg.alwaysThinking}`);
  if (cfg.disableTelemetry) console.log(`  Disable telemetry: true`);
  if (cfg.disableBetas) console.log(`  Disable betas: true`);
  if (cfg.customHeaders && Object.keys(cfg.customHeaders).length > 0) {
    console.log(`  Custom headers:`);
    for (const [k, v] of Object.entries(cfg.customHeaders)) {
      console.log(`    ${chalk.cyan(k)}: ${v}`);
    }
  }
  if (cfg.customEnvs && Object.keys(cfg.customEnvs).length > 0) {
    console.log(`  Custom envs:`);
    for (const [k, v] of Object.entries(cfg.customEnvs)) {
      console.log(`    ${chalk.cyan(k)}=${v}`);
    }
  }
}

export async function discoverCommand(options: DiscoverCommandOptions): Promise<void> {
  try {
    // Collect available sources
    const available = SOURCES.filter(s => s.isAvailable());

    if (available.length === 0) {
      console.error(chalk.red('Error: No supported AI tools detected on this system.'));
      console.log(chalk.gray('Checked: Claude Code (~/.claude/settings.json), Roo Code (VSCode extension)'));
      process.exit(1);
    }

    // Pick source (skip picker if only one available)
    let source: DiscoverSource;
    if (available.length === 1) {
      source = available[0];
      console.log(chalk.gray(`Discovering from: ${source.label}`));
    } else {
      const sourceResponse = await prompts({
        type: 'select',
        name: 'source',
        message: 'Import settings from which tool?',
        choices: available.map((s, i) => ({ title: s.label, value: i }))
      });

      if (sourceResponse.source === undefined) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      source = available[sourceResponse.source as number];
    }

    const cfg = source.read();
    if (!cfg) {
      console.error(chalk.red(`Error: Could not read settings from ${source.label}`));
      process.exit(1);
    }

    console.log(chalk.bold(`\nDiscovered settings from ${source.label}:\n`));
    printDiscovered(cfg);
    console.log('');

    // Provider name
    let providerName = options.name;
    if (!providerName) {
      const nameResponse = await prompts({
        type: 'text',
        name: 'name',
        message: 'Save as provider name:',
        initial: 'discovered',
        validate: (value: string) => validateProviderName(value) || 'Invalid name. Use only letters, numbers, hyphens, and underscores.'
      });

      if (!nameResponse.name) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      providerName = nameResponse.name;
    }

    const confirmResponse = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Import as provider '${providerName}' and set as active?`,
      initial: true
    });

    if (!confirmResponse.confirm) {
      console.log(chalk.yellow('Operation cancelled'));
      return;
    }

    // Build Provider object from discovered config
    const providerOptions: ProviderOptions = {};
    if (cfg.alwaysThinking !== undefined) providerOptions.alwaysThinking = cfg.alwaysThinking;
    if (cfg.disableTelemetry) providerOptions.disableTelemetry = true;
    if (cfg.disableBetas) providerOptions.disableBetas = true;

    let provider: Provider;
    const { apiKey, endpoint, model, smallModel, customEnvs, customHeaders } = cfg;

    if (apiKey) {
      provider = {
        name: providerName!,
        type: 'claude',
        endpoint: endpoint || 'https://api.anthropic.com',
        hasApiKey: true,
        ...(model && { model }),
        ...(smallModel && { smallModel }),
        ...(Object.keys(providerOptions).length > 0 && { options: providerOptions }),
        ...(customEnvs && Object.keys(customEnvs).length > 0 && { customEnvs }),
        ...(customHeaders && Object.keys(customHeaders).length > 0 && { headers: customHeaders }),
      };
    } else {
      provider = {
        name: providerName!,
        type: 'subscription',
        tool: 'claude-code',
        ...(model && { model }),
        ...(smallModel && { smallModel }),
        ...(Object.keys(providerOptions).length > 0 && { options: providerOptions }),
        ...(customEnvs && Object.keys(customEnvs).length > 0 && { customEnvs }),
      };
    }

    await addProvider(provider, apiKey);

    if (apiKey && provider.type === 'claude') {
      await setApiKey(providerName!, apiKey);
    }

    await setActiveProvider(providerName!);

    console.log(chalk.green(`\n✓ Provider '${providerName}' imported and set as active`));

  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    } else {
      console.error(chalk.red('An unexpected error occurred'));
    }
    process.exit(1);
  }
}
