# Protocol Ink terminal setup

A portable Protocol Paper terminal layer for Ghostty, Zellij, and Neovim. The
visual system uses TX-02, a deep ink surface, warm paper text, ruled structure,
structural teal, and coral only for intervention states.

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
- `zellij/themes/protocol-ink.kdl` is reusable independently of the full
  Zellij configuration and defines explicit list/table selection states for
  keyboard-driven plugins such as the session manager.
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
jq empty windows-terminal/protocol-ink.json
```
