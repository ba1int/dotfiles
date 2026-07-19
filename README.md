# Protocol Ink workstation

A deliberately small, portable workstation layer: terminal, shell, Neovim,
and Zellij. The palette follows the Protocol Paper system in dark mode—deep
ink surfaces, warm text, restrained blue structure, and coral only for active
signals. Typography is built around the bundled Commit Mono Regular and Bold
faces, with italic emphasis deliberately kept upright.

This repository contains no agent policy, SSH automation, host inventory, or
monitoring-lab runtime. Those live in the separate sibling `protocol-ops`
project.

## Install

### macOS or Linux

```sh
git clone git@github.com:ba1int/dotfiles.git ~/Documents/setup
cd ~/Documents/setup
./install-terminal.sh
```

Reload Ghostty, start a new shell, and create a new Zellij session.

Useful installer switches:

```sh
./install-terminal.sh --no-ghostty
./install-terminal.sh --no-shell
```

### WSL 2 + Windows Terminal

```sh
git clone git@github.com:ba1int/dotfiles.git ~/setup
cd ~/setup
./install-wsl.sh
```

The WSL installer links the Linux-side configuration, installs Commit Mono and
the bundled Windows Terminal fragment through PowerShell, and selects the
matching WSL profile by default. Use `./install-wsl.sh --no-default` to preserve
the current Windows Terminal default profile.

## What is included

| Module | Files | Purpose |
|---|---|---|
| Fonts | `fonts/commit-mono/` | Commit Mono Regular/Bold plus its OFL 1.1 license |
| Ghostty | `ghostty/` | Commit Mono, Protocol Ink palette, platform-specific behavior |
| Windows Terminal | `windows-terminal/` | Matching WSL color scheme, font, and profile fragment |
| Shell | `shell/` | Portable Bash/Zsh prompt, `dircolors`, and semantic `man`/`less` styling |
| Neovim | `nvim/`, `vim/` | Protocol Ink colorscheme, clipboard behavior, scrollback-safe Vim fallback |
| Zellij | `zellij/`, `bin/zellij-help` | Theme, indexed tab bar, layout, key index, and visible selection states |
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
`Ctrl+o`, then `w` for the session manager.

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

Typing filters the directory currently on screen. Press `Ctrl+F` for recursive
filename search rooted at that directory; from `/`, this searches the remote
system while skipping the virtual `/proc`, `/sys`, and `/dev` trees. `Esc`
returns from search to the directory view.

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
