#!/bin/bash
set -Eeuo pipefail

fail() {
    printf 'FAIL  %s\n' "$*" >&2
    exit 1
}

pass() {
    printf 'PASS  %s\n' "$*"
}

assert_link() {
    local path=$1
    local expected=$2
    [[ -L "$path" ]] || fail "$path is not a symlink"
    [[ $(readlink "$path") == "$expected" ]] \
        || fail "$path points to $(readlink "$path"), expected $expected"
}

printf '\n== clean WSL workstation smoke test ==\n'
cd "$HOME/dotfiles"
./install-workstation.sh
pass 'one-shot workstation bootstrap completed'

# A rerun represents updating the same workstation after a future git pull.
./install-workstation.sh
pass 'one-shot bootstrap is idempotent'

PATH="$HOME/.local/bin:$PATH"
export PATH

for command_name in git nvim zellij fzf rg ssh scp node npm; do
    command -v "$command_name" >/dev/null 2>&1 \
        || fail "missing command: $command_name"
done
pass 'all workstation commands are available'

assert_link "$HOME/.config/nvim/init.vim" "$HOME/dotfiles/nvim/init.vim"
assert_link "$HOME/.config/zellij/config.kdl" "$HOME/dotfiles/zellij/config.kdl"
assert_link "$HOME/.local/bin/rvi" "$HOME/dotfiles/bin/rvi"
assert_link "$HOME/.local/bin/pi-ledger" "$HOME/pi-tools/bin/pi-ledger"
assert_link "$HOME/.pi/agent/extensions/ssh-direct" \
    "$HOME/pi-tools/extensions/ssh-direct"
pass 'portable configuration links are correct'

node - "$HOME/.pi/agent/settings.json" "$HOME/.pi/agent/models.json" <<'NODE'
const fs = require('node:fs');
const [settingsPath, modelsPath] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
if (settings.theme !== 'protocol-ink') throw new Error('Pi theme was not applied');
if (settings.externalEditor !== 'nvim') throw new Error('Pi editor was not applied');
if ('packages' in settings) throw new Error('third-party Pi packages remain configured');
if (!JSON.stringify(models).includes('272000')) {
  throw new Error('Sol context budget was not merged');
}
NODE
pass 'Pi settings and context budget are correct'

mapfile -t extensions < <(find "$HOME/.pi/agent/extensions" -mindepth 1 -maxdepth 1 \
    -printf '%f\n' | sort)
expected_extensions=(side-task ssh-direct task-ledger thinking-router)
[[ ${extensions[*]} == "${expected_extensions[*]}" ]] \
    || fail "unexpected extension set: ${extensions[*]}"
pass 'only repository-owned Pi extensions are active'

grep -Fx -- '-File' "$HOME/.cache/protocol-ink-powershell-argv" >/dev/null \
    || fail 'Windows Terminal installer was not invoked'
grep -F 'windows-terminal/install.ps1' \
    "$HOME/.cache/protocol-ink-powershell-argv" >/dev/null \
    || fail 'Windows Terminal installer path was not forwarded'
pass 'WSL-to-Windows handoff was invoked'

nvim_output=$(nvim --headless \
    '+set termguicolors' '+colorscheme protocol-ink' '+quitall' 2>&1) \
    || fail "Neovim startup failed: $nvim_output"
[[ $nvim_output != *'Error detected'* ]] \
    || fail "Neovim reported a startup error: $nvim_output"
pass 'Neovim starts headlessly with Protocol Ink'

zellij setup --check >/dev/null
pass 'Zellij accepts the installed configuration'

pi --version >/dev/null
pi-ledger --help >/dev/null
rvi --help >/dev/null
pass 'Pi and workstation entrypoints launch without authentication'

bash -lic '
    command -v pi >/dev/null
    command -v pi-ledger >/dev/null
    command -v rvi >/dev/null
' || fail 'login shell did not load the workstation PATH'
pass 'fresh Bash login shell loads the workstation layer'

printf '\nCLEAN INSTALL READY\n'
printf 'Only provider authentication and machine-local work skills remain.\n'
