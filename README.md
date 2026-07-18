# Protocol Ink terminal setup

A portable Protocol Paper terminal layer for Ghostty, Zellij, Neovim, and the
Pi coding agent. The visual system uses TX-02, a deep ink surface, warm paper
text, ruled structure, structural teal, and coral only for intervention states.

## Clone and run

### macOS or Linux with Ghostty

```sh
git clone git@github.com:ba1int/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install-terminal.sh
```

The linked tools expect Neovim, Zellij, fzf, ripgrep, jq, curl, and OpenSSH.
On macOS, `brew install neovim zellij fzf ripgrep jq` supplies everything not
already included by the operating system; the installer reports anything
still missing without installing packages behind your back.

The installer detects Ghostty's platform-specific main config location, links
its custom theme into the XDG theme search path, backs up conflicting live
files, installs the portable shell layer, and keeps this repository as the
source of truth. Use `./install-terminal.sh --no-shell` when a machine should
keep its existing prompt.

### WSL 2 with Windows Terminal

TX-02 must be installed in Windows. Inside WSL, the complete suite uses Neovim,
Zellij, fzf, ripgrep, curl, jq, and OpenSSH. On Ubuntu/Debian, install the small
base-tool set with `sudo apt-get install fzf ripgrep curl jq openssh-client`;
install Neovim and Zellij at the versions you prefer. Then run:

```sh
git clone git@github.com:ba1int/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install-wsl.sh
```

That one command:

- links the Neovim and Zellij configuration inside WSL;
- links `hop`, `peek`, `kb`, and `pulse` plus their shared runtime;
- installs the Bash/Zsh index prompt and matching GNU `LS_COLORS` semantics;
- installs a modular Windows Terminal JSON fragment for Protocol Ink;
- creates a dedicated `Protocol Ink / WSL` profile using TX-02; and
- makes that profile the Windows Terminal default.

Conflicting dotfiles and Windows Terminal settings are backed up before they
are changed. Rerunning the installer is safe. To add the profile without
changing the default profile, run `./install-wsl.sh --no-default`.

Close every Windows Terminal window after installation, then reopen it. The
profile uses `wsl.exe`, so it opens the default WSL distribution. Change the
default distribution with `wsl --set-default <Distribution>` in Windows when
needed.

### Pi coding agent

Pi is an optional, self-contained module. It requires Node.js 22.19 or newer;
the installer puts the version recorded in `pi/version.txt` in `~/.local`
without `sudo`, links the Protocol Ink theme, merges only the owned theme/editor
keys, and installs a small version-pinned operations package set without
replacing unrelated Pi packages:

```sh
./install-pi.sh
```

Then start `pi`, enter `/login`, choose `ChatGPT Plus/Pro (Codex)`, and use
`/model` (or `Ctrl-l`) to select one of the models exposed by that account. The
model can match Codex, but Pi remains a different agent harness with different
tools and instructions.

The operations set combines `@ogulcancelik/pi-ssh-tools` with
`pi-permission-system`. The repository owns the policy while authentication,
sessions, package storage, and model selection remain machine-local:

| Operation | Global baseline |
|---|---|
| Local read, grep, find, ls | allow |
| Local write, edit, Bash | ask |
| Remote `ssh_read` | allow |
| Remote `ssh_write`, `ssh_edit` | deny |
| Remote `ssh_bash` | ask |
| Protocol Ops task/checkpoint state | allow |
| Protocol Ops audited observation batches | allow |
| Protocol Ops typed Icinga object/check queries | allow |
| Unknown registered tools, MCP, external paths | ask |

The policy allows the exact Protocol Ops tool names, but `ops_task` has its own
interactive gate: you approve every literal host before it creates a 12-hour
audited-read scope. An inventory filter is expanded before that dialog and
cannot silently add later hosts. The scope never includes arbitrary shell or
any mutation.

Start Pi and explicitly enter one remote context:

```text
/ssh hermes
/ssh status
```

The active host and remote working directory remain visible in Pi's status
area. `/ssh off` returns to local mode. A bare `/ssh` opens a picker for literal
`Host` entries in `~/.ssh/config`; the upstream package does not expand
`Include` files, so included aliases should be entered directly, for example
`/ssh lab-prod-app01`.

This is a testable approval layer, not a remote sandbox. Open
`/permission-system` before the trial and leave YOLO mode off. Always choose
**Allow Once** for `ssh_bash`: the upstream **Allow Always** choice covers every
later `ssh_bash` call in that Pi session, and its approval dialog shows the
command but not the active host. `ssh_read` can read anything the SSH account
can read and its output can be sent to the selected model provider. The
permission extension also treats an absolute remote path as an external local
path, so an absolute `ssh_read` can produce one extra approval while a relative
remote path does not.

The `ask` entries are defaults, not a non-bypassable floor: an agent/project
policy can relax them, and YOLO mode auto-approves them. The approval dialog
cannot relax the global `ssh_write`/`ssh_edit` denies, though user-owned global
agent policy can intentionally override them. Also, the permission package can
continue advertising the allowed/ask SSH tools after `/ssh off`; calls then fail
closed because no SSH target is active. Keep project and agent permission files
absent or audited, use least-privileged SSH accounts, and do not treat this
profile as production-safe until host plus exact command are enforced by one
non-overridable gate.

`pi-safe` remains the hard-simple local inspection profile. It limits the agent
to `read`, `grep`, `find`, and `ls` while disabling every extension, project
trust, and context-file loading. It is not a process sandbox: a shell command
you manually enter with Pi's `!command` escape still runs as your user.

### Protocol Ops task engine

The Pi installer also links one dependency-free, repository-owned extension.
It borrows the useful parts of Tura's command batches and runtime manuals while
keeping remote mutation completely outside the new path:

- `ops_task` declares an exact task type, objective, ticket, and either literal
  inventory hosts or one exact `environment`/`role`/`site` filter. Filters use
  AND matching, resolve in inventory order, and must produce at most eight
  hosts. The dialog shows and binds only the expanded literal list for 12 hours;
  the filter is never persisted as authority.
- `ops_observe` expands audited profile/check IDs, validates the complete batch,
  and then runs independent SSH reads in parallel across at most four hosts;
  checks remain sequential on each host. It accepts no command text and does
  not require `/ssh HOST` first.
- `ops_monitoring` queries the configured Icinga API for the exact host object,
  service checks, state/attempt metadata, and bounded last-result output for
  declared targets. The model cannot supply an endpoint, credentials, HTTP
  method, filter expression, attribute list, or request body.
- `ops_checkpoint` stores the compact phase, confirmed facts, blockers, recent
  observation receipts, and next steps in Pi's append-only session tree. The
  state survives compaction, resume, and tree navigation.

You use it through normal conversation. For example:

```text
Wire lab-dev-app01 into Icinga. First inspect it and prepare the plan.
```

Pi can declare an `icinga-onboard` task, run the inherited `baseline` and
`icinga`/`icinga_config` observations against that exact inventory alias, and
checkpoint the plan without a manual `/ssh` mode switch. `/ops status`,
`/ops catalog`, and `/ops reset` expose the small human control surface.

Fleet phrasing can stay natural. For example, “inspect disk on all PROD
middleware hosts” may produce an exact `environment=PROD, role=middleware`
filter. If it matches nine or more hosts, task declaration fails rather than
silently truncating or widening scope; narrow the site/role or split the work.

The auto-allowed boundary is the outer tool, so the extension performs its own
all-or-nothing preflight before starting SSH. Every target must be both in the
inventory and in the confirmed, unexpired task scope; `done` and `blocked`
phases close reads until a new task is declared. Every operation must resolve
to a named check in `pi/extensions/protocol-ops/checks/catalog.json`; one
unknown target, check, profile, extra field, or size-limit violation means zero
SSH processes start. Default incident profiles are deliberately compact. Log,
socket, and recursive configuration observations are explicit incident
follow-ups (onboarding runbooks include the relevant configuration profile);
sensitive log checks trigger a second exact-host/check confirmation.

Icinga API reads share that same confirmed target scope. Requests use HTTPS,
TLS 1.2 or newer, no redirects, a fixed read-only object-query shape, exact
targets in `filter_vars`, a 10-second default deadline, and a 512 KiB raw
response limit. Returned host names are revalidated against the confirmed
scope before any API data is rendered. At most 128 services per host and 64 KiB
per rendered batch enter model context. `PULSE_ICINGA_INSECURE=1` is visibly
reported as `tls_verified: false` and is appropriate only for the disposable
self-signed lab.

Reads run through `ssh` with agent/X11 forwarding, all configured forwards,
local commands, and host-key updates disabled. Strict host-key checking is on,
so establish a new host key deliberately with normal `ssh` before using the
batch tool. Each check is capped at 8 KiB, the rendered batch at 128 KiB, and a
stuck client escalates from TERM to KILL with a hard settlement deadline.
Results retain request order and are recorded under a receipt ID.
`collection_ok` means only that the named SSH command or API retrieval completed
as documented; it does not mean that a process, unit, monitoring object,
application, configuration, or host is healthy. Empty, omitted, or truncated
output cannot prove absence or recovery.

Remote output is untrusted. It becomes Pi tool-result/session content and is
sent to the selected model provider; only bounded receipt metadata is copied
into Protocol Ops checkpoint state. Session/tree changes are blocked while a
batch is active, and task identity is rechecked before its receipt is attached.

This is deliberately not a generic read-only shell classifier. The catalog's
commands are trusted executable configuration reviewed with the dotfiles, while
the model can choose only their IDs. Add machine-specific named reads by copying
`checks/local.example.json` to
`${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops/agent/checks.json`, changing its
IDs and commands, and keeping the file owned by the current user and not
group/world writable. Local additions cannot replace bundled IDs or profiles
and default to sensitive unless explicitly reviewed and marked otherwise.

Runbooks live under `pi/extensions/protocol-ops/runbooks/` and use explicit
parent inheritance. Unknown parents, cycles, missing profiles, and path escapes
fail extension loading. Each task snapshots the manual and check-catalog hashes;
after a catalog change, observation fails until the task is declared again.
Manuals can contribute knowledge only: they never add tools or relax policy.
The confirmed task state establishes only the expiring named-read scope.
Checkpoint prose, facts, receipts, and phases are non-authorizing;
`awaiting_approval` is just a workflow label. A checkpoint generated in the
same model turn as an observation is rejected so pre-generated “facts” cannot
outrun the evidence. `ssh_bash` remains `ask`,
`ssh_write`/`ssh_edit` remain denied, and this first version intentionally has
no apply tool.

Run the focused regression suite after changing the extension, catalogs, or
policy:

```sh
cd pi/extensions/protocol-ops
npm test
```

On a fresh machine, skip installing the third-party operations packages while
retaining the theme and Pi base install:

```sh
./install-pi.sh --no-ops-packages
```

This switch does not uninstall packages that are already present; use Pi's
package removal command when intentionally retiring an existing installation.

The installer bridges only the user-owned `design-protocol-paper` Codex skill
when it exists; Codex's hidden system skills and plugin cache are never exposed.
Select additional audited user skills without editing the installer:

```sh
PI_CODEX_SKILLS='design-protocol-paper icinga-ops nagios-ops' \
  ./install-pi.sh --config-only
```

Keep Codex installed for now as the skill-authoring and validation workshop.
Pi understands standard `SKILL.md` packages, but Codex's built-in Skill Creator
itself is harness-specific. This lets both agents share finished domain skills
without copying credentials or committing machine state.

## Modules

- `ghostty/themes/protocol-ink` owns color semantics only.
- `ghostty/modules/protocol-paper.ghostty` owns portable typography, spacing,
  and interaction.
- `ghostty/platform/` contains small operating-system frame overrides.
- `ghostty/local.example.ghostty` documents unmanaged per-machine overrides.
- `windows-terminal/protocol-ink.json` is a self-contained profile and color
  scheme fragment for Windows Terminal.
- `windows-terminal/install.ps1` installs that fragment without folding it
  into the repository or replacing the user's complete settings file.
- `pi/themes/protocol-ink.json` maps Pi's complete semantic TUI palette onto
  the same ink, paper, teal, coral, diagnostics, and diff semantics.
- `pi/version.txt` pins the Pi runtime validated with the operations package set;
  bump it deliberately after testing a newer Pi release.
- `pi/settings.fragment.json` owns only Pi's theme and external editor; the
  installer merges it without replacing provider, model, package, or session
  state.
- `pi/packages.txt` is the small audited and exact-version-pinned Pi operations
  package set; the installer adds it without replacing unrelated packages.
- `pi/pi-permissions.jsonc` is the portable baseline policy for local and SSH
  tools plus the exact-name Protocol Ops state/read tools; denied remote
  mutation cannot be approved through the UI.
- `pi/extensions/protocol-ops/` owns the inventory-bounded task router, audited
  parallel read batches, inherited runbooks, append-only checkpoints, and its
  dependency-free regression tests. It has no mutation capability.
- `pi/permission-system.config.fragment.json` keeps the permission extension
  enabled with debug logging and YOLO auto-approval disabled.
- `bin/pi-safe` is the explicit read-only-agent-tools Pi profile for
  inspection work; it disables all extensions and documents the remaining
  manual shell escape.
- `install-pi.sh` is the standalone Mac/Linux/WSL installer and curated Codex
  skill bridge; it never touches `~/.pi/agent/auth.json`.
- `shell/protocol-ink.dircolors` maps GNU file categories onto the same ANSI
  semantics used by Ghostty.
- `shell/protocol-ink-prompt.sh` renders the current command as a Manual /
  Index record using real history, path, Git, dirty, and exit-status metadata.
- `shell/protocol-ink.sh` composes the portable prompt and GNU color adapter.
- `bin/lab` is a location-independent launcher for the optional standalone
  monitoring lab and keeps its implementation out of the dotfiles repository.
- `bin/hop` is a portable, inventory-backed SSH host index with local route
  previews and no background reachability probes.
- `bin/peek` runs replaceable, named read-only checks through one SSH session
  and renders a host record.
- `bin/kb` indexes one machine-local Markdown cheatsheet folder without an
  Obsidian plugin, database, or background indexer.
- `bin/pulse` normalizes active hard-state problems through replaceable
  monitoring adapters; the supplied adapters support Icinga and Nagios.
- `lib/protocol-ops/` owns the shared Bash 3.2 inventory validation, private
  temp lifecycle, responsive fzf frame, palette, check profiles, and adapters.
- `bin/zellij-help` renders the editable `zellij/cheatsheet.md` as an
  on-demand floating key index; `Ctrl-o ?` opens it and `q` closes it.
- `zellij/config.kdl` selects the portable layout, suppresses generated
  session names, and routes scrollback editing into Protocol Ink Neovim.
- `zellij/layouts/protocol-index.kdl` replaces the compact footer with one
  persistent top-row tab index and deliberately omits the full status bar.
- `zellij/themes/protocol-ink.kdl` is reusable independently of the full
  Zellij configuration and defines the quiet tab ledger plus explicit
  list/table selection states for keyboard-driven plugins such as the session
  manager.
- `Ctrl-o d` detaches from the current Zellij session without destroying it,
  which is also how the isolated monitoring workstation returns to the host.
- `nvim/colors/protocol-ink.vim` carries the editor palette, Treesitter/LSP
  groups, diagnostic semantics, and the shared ANSI colors.
- `nvim/init.vim` adds the ledger statusline, square FZF record window, and
  clean Neovim-specific interaction layer.
- `vim/vimrc` preserves the existing shared keybindings and keeps Everforest
  as a Vim-only fallback; Neovim explicitly opts into Protocol Ink.

## Shell record

The Bash/Zsh prompt treats each command as an index entry:

```text
421 / ~/Documents/setup / git:main*
    $
```

The first field is the shell's real history number. Git context appears only
inside a repository, `*` marks a dirty worktree, and `exit:N` appears only
after a failed command. Set `PROTOCOL_INK_PROMPT=0` before loading
`protocol-ink/shell.sh` to keep the shared GNU file colors without replacing
an existing prompt.

Ghostty loads an optional `local.ghostty` last. Put it in the live Ghostty
config directory when a machine needs a different font size or padding; it
will not be touched by the installer.

## Monitoring lab launcher

The installer links `lab` into `~/.local/bin` and adds one optional SSH include
for the monitoring lab's ten explicit host aliases. The actual containers remain
in a separate repository at `~/Documents/monitoring-lab` on macOS or
`~/monitoring-lab` on Linux/WSL.
Override either location without editing these dotfiles:

```sh
export MONITORING_LAB_HOME=/path/to/monitoring-lab
lab
```

To keep the lab on a remote Linux host, put one normal SSH destination in the
machine-local config instead:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/monitoring-lab"
printf '%s\n' 'operator@your-lab-host' \
  > "${XDG_CONFIG_HOME:-$HOME/.config}/monitoring-lab/remote"
lab
```

`MONITORING_LAB_REMOTE` overrides that file; setting it to an empty value forces
local mode for one command. A bare `lab` uses `ssh -tt`, opens the remote
`~/.local/bin/lab`, and keeps local-only tunnels for Icinga on
`https://127.0.0.1:15665` and Nagios on
`http://127.0.0.1:18081/nagios/`. When launched from Zellij, the outer session
is locked while the remote workstation is active so its `Ctrl-o` bindings pass
through; leaving the workstation restores the outer session to normal mode.
Subcommands such as `lab status` still run remotely, but skip the short-lived
web tunnels and Zellij handoff.

If the standalone lab is absent, the terminal setup behaves normally; only the
`lab` command reports that the optional project has not been found.

## Protocol Ops

`hop`, `peek`, `kb`, and `pulse` share one small runtime linked at
`${XDG_DATA_HOME:-$HOME/.local/share}/protocol-ops`. Machine-specific
configuration remains outside the repository in
`${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops`. There is no daemon, database,
shell telemetry, or background polling.

### SSH host index

Run `hop` to filter hosts by alias, environment, role, or site, inspect the
resolved local SSH route, and connect with Enter. `Ctrl-/` toggles the record
preview and Escape cancels. Queries can start at the prompt:

```sh
hop prod middleware
```

The picker reads one authoritative tab-separated inventory. Set its location
per machine so the dotfiles remain unchanged:

```sh
export OPS_INVENTORY="$HOME/work-inventory/hosts.tsv"
```

The required schema is deliberately small and scales to a fleet export:

```text
name<TAB>environment<TAB>role<TAB>site
app01.example.net<TAB>PROD<TAB>middleware<TAB>dc1
```

`--print` returns a selection for scripts without connecting, while
`--select HOST --print` is a noninteractive validation seam. SSH configuration
remains the source of truth for usernames, ports, keys, and jump hosts.

`HOP_INVENTORY` remains a compatibility fallback, but `OPS_INVENTORY` is shared
by the complete suite.

### Host record

`peek HOST` renders inventory metadata, the resolved SSH route, an optional
`pulse` summary, and named remote checks through one SSH connection. With no
host it opens `hop` first:

```sh
peek
peek app01.example.net
```

Checks are strict TSV data files with the schema
`id<TAB>label<TAB>command`. To customize them without changing the clone, copy
the defaults and edit `common.tsv`; an optional file named after the inventory
role is appended automatically:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops/peek.d"
cp "${XDG_DATA_HOME:-$HOME/.local/share}/protocol-ops/peek.d/common.tsv" \
  "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops/peek.d/common.tsv"
```

Portable role-profile names may contain letters, numbers, spaces, dots,
underscores, and hyphens; `common` is reserved for the mandatory base profile.

`--checks-dir` and `PEEK_CHECKS_DIR` can select a completely different profile
folder. Check commands are trusted local configuration, so keep them
read-only and version controlled.

### Cheatsheet index

Point `kb` at the exact Obsidian subfolder—or any Markdown folder—you want it
to search:

```sh
kb --set-root "/mnt/c/Users/you/Documents/Obsidian/Vault/Cheatsheets"
kb rabbitmq timeout
```

The saved path is machine-local. `--root DIR` and `KB_ROOT` provide temporary
overrides. Enter opens the selected note with `KB_EDITOR`, `VISUAL`, or
`EDITOR`; `--print` returns its absolute path for an Obsidian wrapper. Paths
are represented inside fzf by numeric IDs, so spaces and shell punctuation are
never evaluated.

### Monitoring problem index

`pulse` reads active hard-state service problems on demand. Enter hands a host
to `peek`, `Ctrl-s` opens SSH, `Ctrl-/` toggles the problem record, and
`--list` emits normalized TSV.

Copy the strict, non-executable configuration example and protect credentials:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops"
cp "${XDG_DATA_HOME:-$HOME/.local/share}/protocol-ops/pulse.conf.example" \
  "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops/pulse.conf"
chmod 0600 "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops/pulse.conf"
```

Environment variables such as `PULSE_ICINGA_URL`, `PULSE_ICINGA_USER`, and
`PULSE_ICINGA_PASSWORD` override file values. Replace the whole adapter folder
with `PULSE_ADAPTER_DIR`; each executable adapter has the intentionally small
`name` / `fetch` contract used by the supplied Icinga and Nagios scripts.
`name` prints one uppercase source key. `fetch` prints zero or more strict rows
as `source<TAB>severity<TAB>host<TAB>service<TAB>output<TAB>epoch`; exit `10`
means unconfigured and any other nonzero status marks the index incomplete.
TLS verification stays enabled unless `icinga_insecure=1` is explicitly set,
which is used only by the self-signed mock lab.

`ops_monitoring` reads the same Icinga settings and path precedence:
`PULSE_CONFIG`, then `${OPS_CONFIG_HOME}/pulse.conf`, then the default shown
above. When the extension initializes, it captures and removes an inherited
`PULSE_ICINGA_PASSWORD` before any Protocol Ops tool can start a subprocess.
Keep the private `pulse.conf` as the durable source because an environment-only
password survives only for the current extension lifetime. After changing that
file, use `/reload` or restart Pi. Production should use a dedicated API user
limited to read-only object queries rather than the lab's intentionally broad
disposable credential. The
minimum permissions for this tool are `objects/query/Host`,
`objects/query/Service`, and—when the master enforces it—`filter-expression`.
Icinga introduced the last permission in 2.16.2 and plans to enforce it by
default from 2.17. Its own documentation warns that advanced filter evaluation
can be abused for denial of service, so keep this credential private, use only
the tool's fixed equality query, and keep the master patched; see the
[Icinga API permission and filter notes](https://icinga.com/docs/icinga-2/latest/doc/12-icinga2-api/).

The lab's isolated Ubuntu workstation installs this same configuration with
`./install-terminal.sh --no-ghostty --with-shell --no-lab`. That internal mode
keeps the Linux editor, multiplexer, and Bash setup while leaving container
lifecycle control on the host; it does not install a broken recursive `lab`
launcher inside the workstation.

## Validate

```sh
XDG_CONFIG_HOME="$PWD" \
  /Applications/Ghostty.app/Contents/MacOS/ghostty +validate-config \
  --config-file=ghostty/config.ghostty
zellij --config zellij/config.kdl --config-dir zellij setup --check
nvim --headless '+colorscheme protocol-ink' '+qall'
sh -n install-terminal.sh install-wsl.sh install-pi.sh bin/pi-safe
jq empty windows-terminal/protocol-ink.json \
  pi/settings.fragment.json pi/themes/protocol-ink.json \
  pi/pi-permissions.jsonc pi/permission-system.config.fragment.json
```
