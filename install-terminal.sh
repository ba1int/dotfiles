#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_home=${XDG_CONFIG_HOME:-"$HOME/.config"}
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
stamp=$(date '+%Y%m%d-%H%M%S')
install_ghostty=1
install_shell=1
install_lab=1

usage() {
    cat <<'EOF'
Usage: ./install-terminal.sh [options]

Options:
  --no-ghostty  Skip Ghostty links (used by WSL/Windows Terminal).
  --no-shell    Skip the portable Bash/Zsh prompt and GNU dircolors adapter.
  --with-shell  Explicitly enable the shell layer (the default).
  --no-lab      Skip the optional monitoring-lab launcher and SSH include.
  -h, --help    Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
    case $1 in
        --no-ghostty)
            install_ghostty=0
            ;;
        --with-shell)
            install_shell=1
            ;;
        --no-shell)
            install_shell=0
            ;;
        --no-lab)
            install_lab=0
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\n\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

link_path() {
    source_path=$1
    target_path=$2

    mkdir -p "$(dirname -- "$target_path")"

    if [ -L "$target_path" ] && [ "$(readlink "$target_path")" = "$source_path" ]; then
        printf 'ok      %s\n' "$target_path"
        return
    fi

    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        backup_path="${target_path}.backup-${stamp}"
        mv "$target_path" "$backup_path"
        printf 'backup  %s -> %s\n' "$target_path" "$backup_path"
    fi

    ln -s "$source_path" "$target_path"
    printf 'link    %s -> %s\n' "$target_path" "$source_path"
}

ensure_shell_source() {
    target_path=$1
    source_line='[ -r "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ink/shell.sh" ] && . "${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ink/shell.sh"'

    if [ -f "$target_path" ] && grep -F "$source_line" "$target_path" >/dev/null 2>&1; then
        printf 'ok      %s\n' "$target_path"
        return
    fi

    if [ -e "$target_path" ]; then
        backup_path="${target_path}.backup-${stamp}"
        cp "$target_path" "$backup_path"
        printf 'backup  %s -> %s\n' "$target_path" "$backup_path"
    else
        mkdir -p "$(dirname -- "$target_path")"
        : > "$target_path"
    fi

    printf '\n# Protocol Ink / portable shell layer\n%s\n' "$source_line" >> "$target_path"
    printf 'source  %s\n' "$target_path"
}

ensure_ssh_include() {
    target_path=$1
    include_path=$2
    escaped_include_path=$(printf '%s' "$include_path" | sed 's/\\/\\\\/g; s/"/\\"/g')
    include_line="Include \"$escaped_include_path\""
    legacy_include_line="Include $include_path"

    if [ -f "$target_path" ] && grep -Fqx "$include_line" "$target_path" >/dev/null 2>&1; then
        printf 'ok      %s\n' "$target_path"
        return
    fi

    mkdir -p "$(dirname -- "$target_path")"
    if [ -L "$target_path" ] && [ ! -e "$target_path" ]; then
        printf 'error   refusing to replace broken SSH config symlink: %s\n' "$target_path" >&2
        exit 1
    fi
    if [ -e "$target_path" ]; then
        backup_path="${target_path}.backup-${stamp}"
        cp -p "$target_path" "$backup_path"
        printf 'backup  %s -> %s\n' "$target_path" "$backup_path"
    fi

    temporary_path="${target_path}.protocol-ink.$$"
    {
        printf '# Optional local monitoring lab aliases\n%s\n\n' "$include_line"
        if [ -f "$target_path" ]; then
            while IFS= read -r existing_line || [ -n "$existing_line" ]; do
                [ "$existing_line" = '# Optional local monitoring lab aliases' ] && continue
                [ "$existing_line" = "$include_line" ] && continue
                [ "$existing_line" = "$legacy_include_line" ] && continue
                printf '%s\n' "$existing_line"
            done < "$target_path"
        fi
    } > "$temporary_path"

    if [ -L "$target_path" ]; then
        cat "$temporary_path" > "$target_path"
        rm -f "$temporary_path"
    else
        chmod 0600 "$temporary_path"
        mv "$temporary_path" "$target_path"
    fi
    printf 'include %s -> %s\n' "$target_path" "$include_path"
}

zellij_dir="$config_home/zellij"
nvim_dir="$config_home/nvim"

if [ "$install_ghostty" -eq 1 ]; then
    case $(uname -s) in
        Darwin)
            ghostty_dir="$HOME/Library/Application Support/com.mitchellh.ghostty"
            ghostty_platform="$repo_root/ghostty/platform/darwin.ghostty"
            ;;
        *)
            ghostty_dir="$config_home/ghostty"
            ghostty_platform="$repo_root/ghostty/platform/linux.ghostty"
            ;;
    esac

    ghostty_theme_dir="$config_home/ghostty/themes"
    link_path "$repo_root/ghostty/config.ghostty" "$ghostty_dir/config.ghostty"
    link_path "$repo_root/ghostty/modules" "$ghostty_dir/modules"
    link_path "$repo_root/ghostty/themes/protocol-ink" "$ghostty_theme_dir/protocol-ink"
    link_path "$ghostty_platform" "$ghostty_dir/platform.ghostty"
fi

link_path "$repo_root/zellij/config.kdl" "$zellij_dir/config.kdl"
link_path "$repo_root/zellij/cheatsheet.md" "$zellij_dir/cheatsheet.md"
link_path "$repo_root/zellij/layouts/protocol-index.kdl" "$zellij_dir/layouts/protocol-index.kdl"
link_path "$repo_root/zellij/themes/protocol-ink.kdl" "$zellij_dir/themes/protocol-ink.kdl"

link_path "$repo_root/vim/vimrc" "$HOME/.vimrc"
link_path "$repo_root/nvim/init.vim" "$nvim_dir/init.vim"
link_path "$repo_root/nvim/protocol-clipboard.vim" "$nvim_dir/protocol-clipboard.vim"
link_path "$repo_root/nvim/colors/protocol-ink.vim" "$nvim_dir/colors/protocol-ink.vim"
link_path "$repo_root/lib/protocol-ops" "$data_home/protocol-ops"
link_path "$repo_root/bin/hop" "$HOME/.local/bin/hop"
link_path "$repo_root/bin/peek" "$HOME/.local/bin/peek"
link_path "$repo_root/bin/kb" "$HOME/.local/bin/kb"
link_path "$repo_root/bin/pulse" "$HOME/.local/bin/pulse"
link_path "$repo_root/bin/zellij-help" "$HOME/.local/bin/zellij-help"

if [ "$install_lab" -eq 1 ]; then
    link_path "$repo_root/bin/lab" "$HOME/.local/bin/lab"
    ensure_ssh_include "$HOME/.ssh/config" "$config_home/monitoring-lab/ssh_config"
fi

if [ "$install_shell" -eq 1 ]; then
    protocol_dir="$config_home/protocol-ink"
    link_path "$repo_root/shell/protocol-ink.dircolors" "$protocol_dir/dircolors"
    link_path "$repo_root/shell/protocol-ink-prompt.sh" "$protocol_dir/prompt.sh"
    link_path "$repo_root/shell/protocol-ink.sh" "$protocol_dir/shell.sh"

    shell_name=$(basename -- "${SHELL:-sh}")
    case $shell_name in
        bash)
            ensure_shell_source "$HOME/.bashrc"
            ;;
        zsh)
            ensure_shell_source "$HOME/.zshrc"
            ;;
        *)
            if [ -f "$HOME/.bashrc" ]; then
                ensure_shell_source "$HOME/.bashrc"
            elif [ -f "$HOME/.zshrc" ]; then
                ensure_shell_source "$HOME/.zshrc"
            else
                printf 'warn    shell adapter linked, but %s has no supported startup file\n' "$shell_name" >&2
            fi
            ;;
    esac
fi

printf '\nProtocol Ink is linked. Restart Neovim and start a new Zellij session.\n'
if [ "$install_ghostty" -eq 1 ]; then
    printf 'Reload Ghostty to apply its profile.\n'
fi
if [ "$install_shell" -eq 1 ]; then
    printf 'Start a new shell to apply the index prompt and GNU file colors.\n'
fi

missing_tools=''
for tool_name in nvim zellij fzf rg curl jq ssh; do
    if ! command -v "$tool_name" >/dev/null 2>&1; then
        missing_tools="$missing_tools $tool_name"
    fi
done
if [ -n "$missing_tools" ]; then
    printf 'warn    install these programs before using every linked module:%s\n' \
        "$missing_tools" >&2
fi
