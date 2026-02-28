#!/usr/bin/env node
import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { switchCommand } from './commands/switch.js';
import { currentCommand } from './commands/current.js';
import { envCommand } from './commands/env.js';
import { showCommand } from './commands/show.js';
import { discoverCommand } from './commands/discover.js';
import { completionCommand } from './commands/completion.js';

const program = new Command();

program
  .name('aic')
  .description('CLI tool to manage multiple AI providers')
  .version('1.1.0');

program
  .command('add')
  .description('Add a new AI provider')
  .option('-n, --name <name>', 'Provider name')
  .option('-t, --type <type>', 'Provider type (claude, litellm, subscription)')
  .action(addCommand);

program
  .command('list')
  .description('List all configured providers')
  .option('--names-only', 'Print provider names only, one per line')
  .action(listCommand);

program
  .command('remove <name>')
  .description('Remove a provider')
  .action(removeCommand);

program
  .command('switch [name]')
  .description('Switch to a different provider (omit name for interactive picker, use - for previous)')
  .action(switchCommand);

program
  .command('current')
  .description('Show the current active provider')
  .option('--json', 'Output as JSON')
  .option('--env', 'Output as environment variables')
  .action(currentCommand);

program
  .command('env <name> [target]')
  .description('Manage custom environment variables for a provider (optionally scoped to a target)')
  .action(envCommand);

program
  .command('show [name]')
  .description('Show details for a provider (defaults to active provider)')
  .option('--reveal', 'Show the full API key instead of masked version')
  .action(showCommand);

program
  .command('discover')
  .description('Import provider settings from an installed AI tool')
  .option('--name <name>', 'Name for the imported provider')
  .action(discoverCommand);

program
  .command('completion <shell>')
  .description('Print shell completion script (bash, zsh, fish, pwsh)')
  .action(completionCommand);

// No args: interactive picker on TTY, names-only list when piped
if (!process.argv.slice(2).length) {
  if (process.stdout.isTTY) {
    switchCommand().catch(() => process.exit(1));
  } else {
    listCommand({ namesOnly: true });
  }
} else {
  program.parse(process.argv);
}
