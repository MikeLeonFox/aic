import prompts from 'prompts';
import chalk from 'chalk';
import { addProvider } from '../config/manager.js';
import { Provider, ProviderOptions, isValidProviderType, validateProviderName } from '../types/provider.js';
import { installedTargets } from '../targets/index.js';

interface AddCommandOptions {
  name?: string;
  type?: string;
}

export async function addCommand(options: AddCommandOptions): Promise<void> {
  try {
    // Provider name
    let providerName = options.name;
    if (!providerName) {
      const nameResponse = await prompts({
        type: 'text',
        name: 'name',
        message: 'Provider name:',
        validate: (value: string) => validateProviderName(value) || 'Invalid name. Use only letters, numbers, hyphens, and underscores.'
      });

      if (!nameResponse.name) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      providerName = nameResponse.name;
    }

    if (!validateProviderName(providerName!)) {
      console.error(chalk.red('Invalid provider name. Use only letters, numbers, hyphens, and underscores.'));
      process.exit(1);
    }

    // Provider type
    let providerType = options.type;
    if (!providerType) {
      const typeResponse = await prompts({
        type: 'select',
        name: 'type',
        message: 'Provider type:',
        choices: [
          { title: 'Claude API', value: 'claude' },
          { title: 'LiteLLM', value: 'litellm' },
          { title: 'Subscription (Claude Code CLI)', value: 'subscription' }
        ]
      });

      if (!typeResponse.type) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      providerType = typeResponse.type;
    }

    if (!isValidProviderType(providerType!)) {
      console.error(chalk.red(`Invalid provider type: ${providerType}. Must be one of: claude, litellm, subscription`));
      process.exit(1);
    }

    let provider: Provider;
    let apiKey: string | undefined;

    // Type-specific config
    if (providerType === 'claude') {
      const response = await prompts([
        {
          type: 'text',
          name: 'endpoint',
          message: 'API endpoint:',
          initial: 'https://api.anthropic.com'
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key:'
        }
      ]);

      if (!response.endpoint || !response.apiKey) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      provider = { name: providerName!, type: 'claude', endpoint: response.endpoint, hasApiKey: true };
      apiKey = response.apiKey;

    } else if (providerType === 'litellm') {
      const response = await prompts([
        {
          type: 'text',
          name: 'endpoint',
          message: 'LiteLLM endpoint:',
          initial: 'http://localhost:4000/v1'
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key:'
        }
      ]);

      if (!response.endpoint || !response.apiKey) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      provider = { name: providerName!, type: 'litellm', endpoint: response.endpoint, hasApiKey: true };
      apiKey = response.apiKey;

    } else {
      // subscription
      const response = await prompts({
        type: 'text',
        name: 'tool',
        message: 'Tool name:',
        initial: 'claude-code'
      });

      if (!response.tool) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }

      provider = { name: providerName!, type: 'subscription', tool: response.tool };
    }

    // Model config
    const modelResponse = await prompts([
      {
        type: 'text',
        name: 'model',
        message: 'Primary model (e.g. claude-opus-4-6), blank to skip:'
      },
      {
        type: 'text',
        name: 'smallModel',
        message: 'Small/haiku model, blank to skip:'
      }
    ]);

    if (modelResponse.model) provider.model = modelResponse.model;
    if (modelResponse.smallModel) provider.smallModel = modelResponse.smallModel;

    // Options
    const optionsResponse = await prompts([
      {
        type: 'confirm',
        name: 'alwaysThinking',
        message: 'Enable always-thinking mode?',
        initial: false
      },
      {
        type: 'confirm',
        name: 'disableTelemetry',
        message: 'Disable telemetry?',
        initial: false
      },
      {
        type: 'confirm',
        name: 'disableBetas',
        message: 'Disable experimental betas?',
        initial: false
      }
    ]);

    const providerOptions: ProviderOptions = {};
    if (optionsResponse.alwaysThinking) providerOptions.alwaysThinking = true;
    if (optionsResponse.disableTelemetry) providerOptions.disableTelemetry = true;
    if (optionsResponse.disableBetas) providerOptions.disableBetas = true;
    if (Object.keys(providerOptions).length > 0) provider.options = providerOptions;

    // Custom HTTP headers (e.g. for proxy authentication)
    const addHeadersResponse = await prompts({
      type: 'confirm',
      name: 'addHeaders',
      message: 'Add custom HTTP headers (e.g. X-Proxy-Auth)?',
      initial: false
    });

    if (addHeadersResponse.addHeaders) {
      const customHeaders: Record<string, string> = {};
      console.log(chalk.gray('Enter Header-Name: value pairs, one per line. Leave blank to finish.'));

      while (true) {
        const headerResponse = await prompts({
          type: 'text',
          name: 'entry',
          message: 'Header-Name: value (blank to finish):'
        });

        if (!headerResponse.entry) break;

        const colonIdx = (headerResponse.entry as string).indexOf(':');
        if (colonIdx <= 0) {
          console.log(chalk.yellow('Invalid format. Use Header-Name: value.'));
          continue;
        }

        const key = (headerResponse.entry as string).substring(0, colonIdx).trim();
        const value = (headerResponse.entry as string).substring(colonIdx + 1).trim();
        customHeaders[key] = value;
        console.log(chalk.gray(`  Set ${key}`));
      }

      if (Object.keys(customHeaders).length > 0) provider.headers = customHeaders;
    }

    // Custom environment variables
    const customEnvsResponse = await prompts({
      type: 'confirm',
      name: 'addEnvs',
      message: 'Add custom environment variables?',
      initial: false
    });

    if (customEnvsResponse.addEnvs) {
      const customEnvs: Record<string, string> = {};
      console.log(chalk.gray('Enter KEY=VALUE pairs, one per line. Leave blank to finish.'));

      while (true) {
        const envResponse = await prompts({
          type: 'text',
          name: 'entry',
          message: 'KEY=VALUE (blank to finish):'
        });

        if (!envResponse.entry) break;

        const eqIdx = (envResponse.entry as string).indexOf('=');
        if (eqIdx <= 0) {
          console.log(chalk.yellow('Invalid format. Use KEY=VALUE.'));
          continue;
        }

        const key = (envResponse.entry as string).substring(0, eqIdx).trim();
        const value = (envResponse.entry as string).substring(eqIdx + 1);
        customEnvs[key] = value;
        console.log(chalk.gray(`  Set ${key}`));
      }

      if (Object.keys(customEnvs).length > 0) provider.customEnvs = customEnvs;
    }

    // Target selection — show multi-select only if more than one target is installed
    const installed = installedTargets();
    if (installed.length > 1) {
      const targetResponse = await prompts({
        type: 'multiselect',
        name: 'targets',
        message: 'Apply this provider to which targets? (space to toggle, all selected = apply to all)',
        choices: installed.map(t => ({ title: t.label, value: t.id, selected: true })),
        hint: '- Space to select, Enter to confirm'
      });

      if (targetResponse.targets && Array.isArray(targetResponse.targets)) {
        // If all are selected, leave targets undefined (= all)
        if ((targetResponse.targets as string[]).length < installed.length) {
          provider.targets = targetResponse.targets as string[];
        }
      }
    }

    await addProvider(provider, apiKey);

    console.log(chalk.green(`✓ Provider '${providerName}' added successfully`));

  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    } else {
      console.error(chalk.red('An unexpected error occurred'));
    }
    process.exit(1);
  }
}
