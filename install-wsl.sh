#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
set_default=1

usage() {
    cat <<'EOF'
Usage: ./install-wsl.sh [--no-default]

Links the Neovim, Zellij, and GNU dircolors modules inside WSL, installs the
Protocol Ink fragment into Windows Terminal, and makes its WSL profile the
Windows Terminal default.

Options:
  --no-default  Install the Windows Terminal profile without making it default.
  -h, --help    Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
    case $1 in
        --no-default)
            set_default=0
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

if [ "$(uname -s)" != Linux ] || { [ -z "${WSL_DISTRO_NAME:-}" ] && ! grep -qi microsoft /proc/sys/kernel/osrelease; }; then
    printf 'install-wsl.sh must be run from inside WSL.\n' >&2
    exit 1
fi

"$repo_root/install-terminal.sh" --no-ghostty --with-shell

if command -v powershell.exe >/dev/null 2>&1; then
    powershell_command=powershell.exe
elif command -v pwsh.exe >/dev/null 2>&1; then
    powershell_command=pwsh.exe
else
    printf '\nProtocol Ink is linked inside WSL, but Windows PowerShell interop was not found.\n' >&2
    printf 'Run windows-terminal/install.ps1 from Windows to finish the terminal profile.\n' >&2
    exit 1
fi

windows_script=$(wslpath -w "$repo_root/windows-terminal/install.ps1")
if [ "$set_default" -eq 1 ]; then
    "$powershell_command" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$windows_script"
else
    "$powershell_command" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$windows_script" -NoDefault
fi

missing_tools=''
for tool_name in nvim zellij; do
    if ! command -v "$tool_name" >/dev/null 2>&1; then
        missing_tools="$missing_tools $tool_name"
    fi
done

if [ -n "$missing_tools" ]; then
    printf '\nwarn    install these WSL programs before use:%s\n' "$missing_tools" >&2
fi

printf '\nProtocol Ink is installed for WSL + Windows Terminal.\n'
printf 'Close every Windows Terminal window, reopen it, and start a new shell.\n'
