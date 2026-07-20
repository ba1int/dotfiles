# Protocol Ink workstation

A deliberately small, portable workstation layer: terminal, shell, Neovim,
and Zellij. Ghostty and Zellij follow the host appearance with paired Protocol
Ink and Protocol Paper palettes—deep ink after dark, warm paper during the day,
structural teal, and coral only for errors or exceptional signals. Typography
is built around the bundled Commit Mono Regular and Bold faces, with italic
emphasis kept upright.

This repository contains no agent policy, SSH automation, host inventory, or
monitoring-lab runtime. Those live in the separate sibling `protocol-ops`
project.

## Install

### macOS or Linux

```sh
git clone https://github.com/ba1int/dotfiles.git ~/Documents/setup
cd ~/Documents/setup
./install-terminal.sh
```

Reload Ghostty, start a new shell, and create a new Zellij session.
The prompt keeps an existing Zellij session aligned with macOS appearance on
the next prompt render; the Pi module provides continuous sync while Pi is open.
To refresh the shell layer in place, source it rather than executing it:
`. ~/.config/protocol-ink/shell.sh`. It never requires `sudo`.

Useful installer switches:

```sh
./install-terminal.sh --no-ghostty
./install-terminal.sh --no-shell
```

### WSL 2 + Windows Terminal

```sh
git clone https://github.com/ba1int/dotfiles.git ~/setup
cd ~/setup
./install-workstation.sh
```

The one-shot bootstrap installs the small Ubuntu package set, pinned user-local
Node and Zellij builds, the Linux-side configuration, Commit Mono, the Windows
Terminal profile, Pi, the separate repository-owned `pi-tools` package, and
the terminal-native Study Room.
After it finishes, restart Windows Terminal and complete Pi's `/login`; work
skills and credentials remain machine-local. The public `pi-tools` and
`study-room` repositories are fetched over HTTPS without GitHub credentials. Use
`./install-workstation.sh --no-default` to preserve the current terminal
default, or use `./install-wsl.sh` when dependencies and Pi are managed
separately.

## What is included

| Module | Files | Purpose |
|---|---|---|
| Fonts | `fonts/commit-mono/` | Commit Mono Regular/Bold plus its OFL 1.1 license |
| Ghostty | `ghostty/` | Commit Mono, automatic Ink/Paper palettes, platform behavior |
| Windows Terminal | `windows-terminal/` | Matching WSL color scheme, font, and profile fragment |
| Shell | `shell/` | Portable Bash/Zsh prompt, `dircolors`, and semantic `man`/`less` styling |
| Neovim | `nvim/`, `vim/` | Protocol Ink colorscheme, clipboard behavior, scrollback-safe Vim fallback |
| Zellij | `zellij/`, `bin/zellij-help` | Paired themes, indexed tabs, key index, visible selections |
| Remote edit | `bin/rvi` | Local themed Neovim over SSH, with narrow passwordless-sudo elevation |

The installer creates symlinks instead of copying configuration. Editing the
repository therefore updates the installed setup immediately. Existing target
files are timestamped and backed up before replacement.

## Dependencies

- Neovim
- Zellij
- `fzf`
- `ripgrep`
- OpenSSH client (`ssh` and `scp`)

Ghostty is optional on systems that use Windows Terminal or another terminal.
The installer puts the bundled font in the current user's font directory; use
`--no-font` when a machine should manage fonts separately.

## Local overrides

Ghostty loads `local.ghostty` last when it exists. Start from:

```sh
cp ghostty/local.example.ghostty ghostty/local.ghostty
```

The file is ignored by Git, so machine-specific font sizing or window behavior
does not leak into the shared workstation configuration.

Set `PROTOCOL_INK_PROMPT=0` before sourcing the shell adapter if you want the
palette and PATH behavior without its prompt.

Set `PROTOCOL_INK_PAGER=0` to leave `man` and `less` styling untouched. The
pager module colors only semantic emphasis, underlines, and standout/search
records; it does not guess at or recolor arbitrary log content.

## Zellij key index

Inside Zellij, press `Ctrl+o`, then `?` to open the themed key index. Press
`Ctrl+o`, then `w` for the session manager. Press `Ctrl+o`, then `n` for the
new-tab template index. It currently offers two matching dispatcher desks:

- `PI DESK` starts Pi in the large left pane with two shells stacked right.
- `SHELL DESK` opens the same geometry as three clean shells.

After choosing the desk, choose `CURRENT` to start every pane in the focused
pane's working directory or `HOME` to start every pane in `~`. The picker is a
local `fzf` view and adds no resident process. Native `Ctrl+t`, then `n` remains
the fast single-pane new-tab action.

When the separate `pi-tools` package is installed, press `Ctrl+o`, then `i`
to open Pi's live task ledger in a floating pane. One agent opens directly;
several agents open as a selectable board. Use `↑`/`↓` to select, `Enter` to
jump to the agent's pane, `d` for its detailed ledger, and `q` to close. The
view is driven only by local Pi lifecycle events, adds no model context or
tokens, and never opens automatically.

The default `protocol-index` layout remains a blank indexed workspace. Start
the optional named dispatcher desk with:

```sh
zellij --layout protocol-ops
```

It opens `01 / DISPATCH` on the left and stacks `02 / SHELL` above
`03 / WATCH` on the right without adding another status bar or plugin.

## Remote Neovim

Use the local Neovim setup against a remote path without copying dotfiles or
logging in as root:

```sh
rvi                              # choose an SSH host, then browse
rvi app01                        # browse this host from /
rvi app01 /etc/icinga2/icinga2.conf
rvi --read-only operator@app01 /var/log/myapp/current.log
```

The picker is a local, themed `fzf` index over the remote filesystem. It makes
one SSH listing request per directory and uses passwordless sudo when available
so protected configuration trees remain navigable. Bash completion—and Zsh
completion when its completion system is initialized—covers SSH aliases and
remote paths. Remote path completion likewise performs one directory listing
when requested.

After `rvi` successfully reaches a concrete SSH destination, it remembers that
name locally and places it above configured aliases in the host picker. This
makes hosts reached through wildcard SSH stanzas discoverable on the next use
without querying a CMDB or scanning the network. The list is private,
newest-first, deduplicated, and capped at 256 destinations.

Typing filters the directory currently on screen. Press `Ctrl+F` for recursive
filename search rooted at that directory; from `/`, this searches the remote
system while skipping the virtual `/proc`, `/sys`, and `/dev` trees. `Esc`
returns from search to the directory view.

The root view also keeps a local six-file `FAST` index for each SSH host. A file
enters the index after Neovim opens it successfully; reopening it moves it to
the top. Entries are validated against the host and stale paths disappear
quietly. This private history lives under `${XDG_STATE_HOME:-~/.local/state}/rvi`
with mode `0600`; it is not stored in dotfiles or copied to remote systems.

Files writable by the SSH user use Neovim's native SSH transport. Protected
files are downloaded into a private local directory and opened with the same
local theme and plugins. On exit, `rvi` shows the exact diff and asks before it
uses remote `sudo -n` to atomically replace the file while retaining its mode,
ownership, ACLs, extended attributes, and symlink path. It detects concurrent
remote changes and refuses files with hard links rather than silently changing
their semantics.

The target needs standard Linux userland tools (`sh`, `sudo`, `realpath`,
`stat`, `cksum`, `cp`, `cmp`, and `mv`) and passwordless sudo for protected
files. SSH remains on the normal account. Directory browsing is deliberately
read-only; for an elevated edit, give `rvi` the exact file path.

## Verify

```sh
readlink ~/.config/nvim/init.vim
readlink ~/.config/zellij/config.kdl
readlink ~/.local/bin/zellij-help
readlink ~/.local/bin/rvi
```

On macOS, Ghostty's configuration lives under
`~/Library/Application Support/com.mitchellh.ghostty/`; on Linux it lives under
`${XDG_CONFIG_HOME:-~/.config}/ghostty/`.

The disposable Ubuntu 24.04 clean-install test uses no model credentials and
makes no model calls. With Docker running and sibling `pi-tools` and
`study-room` checkouts:

```sh
PI_TOOLS_DIR=~/pi-tools STUDY_ROOM_DIR=~/study-room ./tests/workstation/run.sh
```

Set `WORKSTATION_SMOKE_ONLINE=1` to make the container ignore its local fixture
repositories and clone all three public repositories from GitHub over HTTPS.

It defaults to `linux/amd64`, matching ordinary WSL workstations. Set
`WORKSTATION_SMOKE_PLATFORM=linux/arm64` only for an ARM Windows target.
