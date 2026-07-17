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

The installer detects Ghostty's platform-specific main config location, links
its custom theme into the XDG theme search path, backs up conflicting live
files, installs the portable shell layer, and keeps this repository as the
source of truth. Use `./install-terminal.sh --no-shell` when a machine should
keep its existing prompt.

### WSL 2 with Windows Terminal

TX-02 must be installed in Windows, while Neovim and Zellij must be installed
inside WSL. From the cloned repository inside WSL, run:

```sh
git clone git@github.com:ba1int/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install-wsl.sh
```

That one command:

- links the Neovim and Zellij configuration inside WSL;
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

## SSH host index

Run `hop` to filter hosts by alias, environment, role, or site, inspect the
resolved local SSH route, and connect with Enter. `Ctrl-/` toggles the record
preview and Escape cancels. Queries can start at the prompt:

```sh
hop prod middleware
```

The picker reads one authoritative tab-separated inventory. Set its location
per machine so the dotfiles remain unchanged:

```sh
export HOP_INVENTORY="$HOME/work-inventory/hosts.tsv"
```

The required schema is deliberately small and scales to a fleet export:

```text
name<TAB>environment<TAB>role<TAB>site
app01.example.net<TAB>PROD<TAB>middleware<TAB>dc1
```

`--print` returns a selection for scripts without connecting, while
`--select HOST --print` is a noninteractive validation seam. SSH configuration
remains the source of truth for usernames, ports, keys, and jump hosts.

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
