# Feature Gap Analysis & Implementation Plan
> Comparing `aic` against [`aictx`](https://github.com/IQNeoXen/aictx)
> **Status: All 6 features implemented ✅**

---

## Summary

| Feature | aic | aictx |
|---|---|---|
| Add / remove / list / show providers | ✅ | ✅ |
| Switch by name | ✅ | ✅ |
| Switch to previous (`-`) | ✅ | ✅ |
| Interactive picker (no-arg invocation) | ❌ (shows help) | ✅ |
| `--names-only` on list | ✅ | ✅ |
| `--reveal` on show | ✅ | ✅ |
| Secure OS keychain storage | ✅ | ✅ |
| Claude Code target (`~/.claude/settings.json`) | ✅ | ✅ |
| VSCode / Claude Code extension target | ✅ | ✅ |
| Roo Code VSCode extension target | ❌ | ✅ |
| Cline VSCode extension target | ❌ | ✅ |
| GitHub Copilot CLI target | ❌ | ✅ |
| GitHub Copilot VSCode target | ❌ | ✅ |
| Custom HTTP headers (applied on switch) | ❌ (type exists, never applied) | ✅ |
| Shell completions: bash / zsh / fish | ✅ | ✅ |
| Shell completions: PowerShell | ❌ | ✅ |
| `discover` from multiple installed tools | ❌ (only `~/.claude/settings.json`) | ✅ |
| Per-target env var management | ❌ | ✅ |
| JSON / env-export output formats | ✅ | ✅ |

---

## Features to Implement

### 1. No-arg Interactive Picker

**Priority: High** — This is the primary UX pattern (à la kubectx).

**Current behavior:** `aic` with no args calls `program.help()` and exits.

**Target behavior:** When stdout is a TTY, launch the interactive switch picker. When piped, print provider names one per line (same as `aic list --names-only`).

**Implementation:**
- In `src/index.ts`, replace the `if (!process.argv.slice(2).length)` block.
- Check `process.stdout.isTTY`.
  - If TTY → call `switchCommand()` (no args = interactive picker already implemented).
  - If not TTY (piped) → call `listCommand({ namesOnly: true })`.

```ts
// src/index.ts — replace the current no-arg block
if (!process.argv.slice(2).length) {
  if (process.stdout.isTTY) {
    switchCommand().then(() => process.exit(0));
  } else {
    listCommand({ namesOnly: true }).then(() => process.exit(0));
  }
} else {
  program.parse(process.argv);
}
```

**Files touched:** `src/index.ts`

---

### 2. PowerShell Completion Script

**Priority: Low** — Useful for Windows users.

**Current behavior:** `aic completion <shell>` supports `bash`, `zsh`, `fish` only.

**Target behavior:** Also accept `pwsh` or `powershell` as a shell argument.

**Implementation:**
- In `src/commands/completion.ts`, add a `powershell` / `pwsh` case with a basic completion script.
- The script should use PowerShell's `Register-ArgumentCompleter` to complete provider names by calling `aic list --names-only`.

```powershell
Register-ArgumentCompleter -Native -CommandName aic -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $subcommands = @('add','list','remove','switch','current','env','show','discover','completion')
    $subcommands | Where-Object { $_ -like "$wordToComplete*" } |
        ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
```

**Files touched:** `src/commands/completion.ts`

---

### 3. Custom Headers Applied on Switch

**Priority: Medium** — The `headers` field already exists on `BaseProvider` but is silently ignored.

**Current behavior:** `headers` on a provider is stored but never written to `~/.claude/settings.json`.

**Target behavior:** On switch, any `provider.headers` entries are injected into the `env` block of `~/.claude/settings.json` so that Claude Code will pass them as HTTP headers (some proxies/gateways use env vars for header injection).

> Note: If Claude Code supports a dedicated `headers` key in settings.json in the future this should be updated. For now, injecting as env vars is the safe approach and mirrors what aictx does.

**Implementation:**
- In `src/config/manager.ts` inside `setActiveProvider()`, after applying `customEnvs`, add:

```ts
if (provider.headers) {
  for (const [key, value] of Object.entries(provider.headers)) {
    env[key] = value;
    appliedKeys.push(key);
  }
}
```

- In `src/commands/add.ts`, add a prompt step after the model section that asks if the user wants to add custom headers (KEY=VALUE format, same UX as custom envs).
- In `src/commands/show.ts`, display headers if present (masked or revealed with `--reveal`).

**Files touched:** `src/config/manager.ts`, `src/commands/add.ts`, `src/commands/show.ts`

---

### 4. Multi-Target Support (Roo Code, Cline, GitHub Copilot)

**Priority: Medium** — Expands the tool beyond Claude Code to the broader AI coding tool ecosystem.

**aictx supports:** Claude Code CLI, Claude Code VSCode, Roo Code VSCode, Cline VSCode, GitHub Copilot CLI, GitHub Copilot VSCode.

**Architecture changes needed:**

#### 4a. Target Registry

Create `src/targets/` directory with a registry pattern:

```
src/targets/
  index.ts          — exports all targets + applyTargets()
  claudeCode.ts     — ~/.claude/settings.json (already implemented in manager.ts)
  vscodeClaudeCode.ts — VSCode claudeCode.environmentVariables (already in manager.ts)
  rooCode.ts        — Roo Code VSCode extension settings
  cline.ts          — Cline VSCode extension settings
  githubCopilot.ts  — GitHub Copilot CLI config
```

Each target module exports:
```ts
interface Target {
  id: string;                    // e.g. 'roo-code'
  label: string;                 // e.g. 'Roo Code (VSCode)'
  isInstalled(): boolean;        // detect if target exists on this machine
  apply(env: Record<string, string>, model?: string): void;
  clean(keys: string[]): void;   // remove previously written keys
}
```

#### 4b. Roo Code Target

Roo Code stores settings in the VSCode extension's `globalStorage` or a shared settings block. Research required: check `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/` or a dedicated config file.

Apply by writing `roo-cline.environmentVariables` (or equivalent) in VSCode settings.

#### 4c. Cline Target

Cline stores API config in VSCode extension storage: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/`.

May require writing to the extension's own config format (JSON), not VSCode settings.json.

#### 4d. GitHub Copilot Target

GitHub Copilot CLI config is typically at `~/.config/gh/hosts.yml`. Switching to a different AI provider with Copilot would require knowing the Copilot API structure — this target may be out of scope without more research.

#### 4e. Provider `targets` field

Add `targets?: string[]` to `BaseProvider` so users can opt into specific targets per provider:

```ts
export interface BaseProvider {
  // ...existing fields...
  targets?: string[];  // e.g. ['claude-code', 'vscode-claude-code', 'roo-code']
}
```

During `aic add`, prompt: "Which targets should this provider apply to?" with multi-select showing only installed targets.

**Files touched:** `src/types/provider.ts`, `src/config/manager.ts` (extract target logic), new `src/targets/` files, `src/commands/add.ts`

---

### 5. Multi-Source `discover`

**Priority: Low** — Currently discovers only from `~/.claude/settings.json`.

**Target behavior:** Detect which AI tools are installed and offer to import from each.

**Implementation:**
- In `src/commands/discover.ts`, before reading `~/.claude/settings.json`, scan for installed targets using the target registry from feature 4.
- If multiple sources are found, prompt the user to select which one to import from.
- For each source, implement a reverse-map from its config format back to a `Provider` object.

```
Sources to support:
- ~/.claude/settings.json                          (already done)
- VSCode claudeCode.environmentVariables           (reverse VSCode settings)
- Roo Code / Cline extension globalStorage         (requires per-tool parser)
```

**Files touched:** `src/commands/discover.ts`, `src/targets/` (add `read()` method to each target)

---

### 6. Per-Target Env Var Management

**Priority: Low** — aictx supports `aictx env <ctx> <target>` to manage env vars scoped to a specific target.

**Current behavior:** `aic env <name>` manages a single flat `customEnvs` record applied to all targets.

**Target behavior:** `aic env <name> [target]` — if a target is provided, manage env vars that apply only to that target.

**Implementation:**
- Change `Provider.customEnvs` from `Record<string, string>` to support per-target scoping:

```ts
// Option A: flat (current) — applies to all targets
customEnvs?: Record<string, string>;

// Option B: add per-target env map alongside flat map
targetEnvs?: Record<string, Record<string, string>>;  // targetId -> { KEY: VALUE }
```

- Update `src/commands/env.ts` to accept an optional second argument `[target]`.
- If target is given, read/write from `provider.targetEnvs[target]`.
- During `setActiveProvider()`, merge `targetEnvs[targetId]` into the env before applying each target.

**Files touched:** `src/types/provider.ts`, `src/commands/env.ts`, `src/config/manager.ts`, `src/index.ts` (update command signature)

---

## Recommended Implementation Order

1. **No-arg interactive picker** (30 min) — highest UX impact, trivial change
2. **Apply custom headers on switch** (1 hr) — bug fix, type already exists
3. **PowerShell completion** (30 min) — isolated, no architectural impact
4. **Multi-target support** (3-5 hrs) — requires extracting target logic from `manager.ts`
5. **Multi-source discover** (2-3 hrs) — depends on target registry from step 4
6. **Per-target env vars** (2-3 hrs) — schema change, lower demand
