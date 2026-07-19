# Protocol Ink workstation

A deliberately small, portable workstation layer: terminal, shell, Neovim,
and Zellij. The palette follows the Protocol Paper system in dark mode—deep
ink surfaces, warm text, restrained blue structure, and coral only for active
signals. Typography is built around TX-02.

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

TX-02 must already be installed in Windows.

```sh
git clone git@github.com:ba1int/dotfiles.git ~/setup
cd ~/setup
./install-wsl.sh
```

The WSL installer links the Linux-side configuration, installs the bundled
Windows Terminal fragment through PowerShell, and selects the matching WSL
profile by default. Use `./install-wsl.sh --no-default` to preserve the current
Windows Terminal default profile.

## What is included

| Module | Files | Purpose |
|---|---|---|
| Ghostty | `ghostty/` | TX-02, Protocol Ink palette, platform-specific behavior |
| Windows Terminal | `windows-terminal/` | Matching WSL color scheme, font, and profile fragment |
| Shell | `shell/` | Portable Bash/Zsh prompt, `dircolors`, and semantic `man`/`less` styling |
| Neovim | `nvim/`, `vim/` | Protocol Ink colorscheme, clipboard behavior, scrollback-safe Vim fallback |
| Zellij | `zellij/`, `bin/zellij-help` | Theme, indexed tab bar, layout, key index, and visible selection states |

The installer creates symlinks instead of copying configuration. Editing the
repository therefore updates the installed setup immediately. Existing target
files are timestamped and backed up before replacement.

## Dependencies

- TX-02 installed on the host system
- Neovim
- Zellij
- `fzf`
- `ripgrep`

Ghostty is optional on systems that use Windows Terminal or another terminal.

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
to open Pi's live task ledger in a floating pane. The view is driven only by
local Pi lifecycle events, adds no model context or tokens, and closes with
`q`. It never opens automatically.

The default `protocol-index` layout remains a blank indexed workspace. Start
the optional named dispatcher desk with:

```sh
zellij --layout protocol-ops
```

It opens `01 / DISPATCH` on the left and stacks `02 / SHELL` above
`03 / WATCH` on the right without adding another status bar or plugin.

## Verify

```sh
readlink ~/.config/nvim/init.vim
readlink ~/.config/zellij/config.kdl
readlink ~/.local/bin/zellij-help
```

On macOS, Ghostty's configuration lives under
`~/Library/Application Support/com.mitchellh.ghostty/`; on Linux it lives under
`${XDG_CONFIG_HOME:-~/.config}/ghostty/`.
