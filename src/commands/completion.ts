import chalk from 'chalk';

const BASH_COMPLETION = `
# aic bash completion
_aic_complete() {
  local cur prev words cword
  _init_completion || return

  local commands="add list remove switch current env show discover completion"

  case "$prev" in
    switch|remove|show)
      local providers
      providers=$(aic list --names-only 2>/dev/null)
      COMPREPLY=($(compgen -W "$providers -" -- "$cur"))
      return
      ;;
  esac

  if [[ "$cword" -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
  fi
}

complete -F _aic_complete aic
`.trim();

const ZSH_COMPLETION = `
#compdef aic

_aic_complete() {
  local state

  _arguments \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      local commands=(
        'add:Add a new AI provider'
        'list:List all configured providers'
        'remove:Remove a provider'
        'switch:Switch to a different provider'
        'current:Show the current active provider'
        'env:Manage custom environment variables'
        'show:Show provider details'
        'discover:Import provider from ~/.claude/settings.json'
        'completion:Print shell completion script'
      )
      _describe 'command' commands
      ;;
    args)
      case $words[2] in
        switch|remove|show)
          local providers
          providers=($(aic list --names-only 2>/dev/null))
          local special=('-:Switch to previous provider')
          _describe 'provider' providers
          _describe 'special' special
          ;;
        completion)
          local shells=('bash' 'zsh' 'fish' 'pwsh')
          _describe 'shell' shells
          ;;
      esac
      ;;
  esac
}

_aic_complete
`.trim();

const FISH_COMPLETION = `
# aic fish completion

function __fish_aic_complete
  aic list --names-only 2>/dev/null
end

# Main commands
complete -c aic -f -n "__fish_use_subcommand" -a "add"        -d "Add a new AI provider"
complete -c aic -f -n "__fish_use_subcommand" -a "list"       -d "List all configured providers"
complete -c aic -f -n "__fish_use_subcommand" -a "remove"     -d "Remove a provider"
complete -c aic -f -n "__fish_use_subcommand" -a "switch"     -d "Switch to a different provider"
complete -c aic -f -n "__fish_use_subcommand" -a "current"    -d "Show the current active provider"
complete -c aic -f -n "__fish_use_subcommand" -a "env"        -d "Manage custom environment variables"
complete -c aic -f -n "__fish_use_subcommand" -a "show"       -d "Show provider details"
complete -c aic -f -n "__fish_use_subcommand" -a "discover"   -d "Import provider from installed AI tools"
complete -c aic -f -n "__fish_use_subcommand" -a "completion" -d "Print shell completion script"

# Provider name completions for commands that take a provider name
complete -c aic -f -n "__fish_seen_subcommand_from switch remove show" -a "(__fish_aic_complete)"
complete -c aic -f -n "__fish_seen_subcommand_from switch" -a "-" -d "Switch to previous provider"

# Shell completions for completion command
complete -c aic -f -n "__fish_seen_subcommand_from completion" -a "bash zsh fish pwsh"
`.trim();

const POWERSHELL_COMPLETION = `
# aic PowerShell completion
# Add this to your $PROFILE to enable tab completion for aic.

Register-ArgumentCompleter -Native -CommandName aic -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $tokens = $commandAst.CommandElements
    $subcommands = @('add', 'list', 'remove', 'switch', 'current', 'env', 'show', 'discover', 'completion')

    if ($tokens.Count -le 2) {
        # Complete subcommands
        $subcommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    } elseif ($tokens.Count -eq 3) {
        $sub = $tokens[1].Value
        switch ($sub) {
            { $_ -in 'switch', 'remove', 'show' } {
                # Complete provider names
                $providers = (aic list --names-only 2>$null) -split '\n' | Where-Object { $_ -ne '' }
                $providers | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
                if ('switch' -eq $sub -and '-' -like "$wordToComplete*") {
                    [System.Management.Automation.CompletionResult]::new('-', '-', 'ParameterValue', 'Switch to previous provider')
                }
            }
            'completion' {
                @('bash', 'zsh', 'fish', 'pwsh') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
                }
            }
        }
    }
}
`.trim();

export function completionCommand(shell: string): void {
  const supported = ['bash', 'zsh', 'fish', 'pwsh', 'powershell'];

  if (!supported.includes(shell)) {
    console.error(chalk.red(`Error: Unsupported shell '${shell}'. Supported: bash, zsh, fish, pwsh`));
    process.exit(1);
  }

  switch (shell) {
    case 'bash':
      console.log(BASH_COMPLETION);
      break;
    case 'zsh':
      console.log(ZSH_COMPLETION);
      break;
    case 'fish':
      console.log(FISH_COMPLETION);
      break;
    case 'pwsh':
    case 'powershell':
      console.log(POWERSHELL_COMPLETION);
      break;
  }
}
