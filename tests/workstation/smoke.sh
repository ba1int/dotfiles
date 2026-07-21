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
# BuildKit's rootless overlay can report false hardlink identity mismatches when
# cloning the local fixture repository. Real HTTPS/SSH clones are unaffected;
# forcing copies keeps the disposable test equivalent and storage-driver safe.
git clone --no-hardlinks "${DOTFILES_REPO:?}" "$HOME/dotfiles"
pass 'dotfiles cloned into an empty home directory'
cd "$HOME/dotfiles"
./install-workstation.sh
pass 'one-shot workstation bootstrap completed'

# A rerun represents updating the same workstation after a future git pull.
./install-workstation.sh
pass 'one-shot bootstrap is idempotent'

for checkout in dotfiles pi-tools study-room; do
    [[ -d "$HOME/$checkout/.git" ]] || fail "$checkout was not cloned"
done
if [[ -d "$HOME/.pi/agent/retired-extensions" ]] \
    && find "$HOME/.pi/agent/retired-extensions" -mindepth 1 -print -quit \
        | grep -q .; then
    fail 'idempotent rerun retired a repository-owned extension'
fi
pass 'all repositories are real clones and reruns create no extension churn'

PATH="$HOME/.local/bin:$PATH"
export PATH

for command_name in git nvim zellij fzf rg ssh scp node npm; do
    command -v "$command_name" >/dev/null 2>&1 \
        || fail "missing command: $command_name"
done
pass 'all workstation commands are available'

assert_link "$HOME/.config/nvim/init.vim" "$HOME/dotfiles/nvim/init.vim"
assert_link "$HOME/.config/zellij/config.kdl" "$HOME/dotfiles/zellij/config.kdl"
assert_link "$HOME/.config/zellij/layouts/protocol-tab-pi.kdl" \
    "$HOME/dotfiles/zellij/layouts/protocol-tab-pi.kdl"
assert_link "$HOME/.config/zellij/layouts/protocol-tab-shell.kdl" \
    "$HOME/dotfiles/zellij/layouts/protocol-tab-shell.kdl"
assert_link "$HOME/.local/bin/rvi" "$HOME/dotfiles/bin/rvi"
assert_link "$HOME/.local/bin/zellij-tab-picker" \
    "$HOME/dotfiles/bin/zellij-tab-picker"
assert_link "$HOME/.local/bin/study" "$HOME/study-room/bin/study"
assert_link "$HOME/.pi/agent/extensions/ssh-direct" \
    "$HOME/pi-tools/extensions/ssh-direct"
assert_link "$HOME/.pi/agent/extensions/study-learn-emit" \
    "$HOME/study-room/pi/learn-emit"
pass 'portable configuration links are correct'

node - "$HOME/.pi/agent/settings.json" "$HOME/.pi/agent/models.json" <<'NODE'
const fs = require('node:fs');
const [settingsPath, modelsPath] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
if (settings.theme !== 'protocol-paper/protocol-ink') {
  throw new Error('adaptive Pi theme pair was not applied');
}
if (settings.externalEditor !== 'nvim') throw new Error('Pi editor was not applied');
if (settings.defaultProvider !== 'openai-codex') throw new Error('Pi provider default was not applied');
if (settings.defaultModel !== 'gpt-5.6-luna') throw new Error('Luna default was not applied');
if (settings.defaultThinkingLevel !== 'low') throw new Error('low thinking default was not applied');
if ('packages' in settings) throw new Error('third-party Pi packages remain configured');
if (!JSON.stringify(models).includes('272000')) {
  throw new Error('Sol context budget was not merged');
}
NODE
pass 'Pi settings and context budget are correct'

mapfile -t extensions < <(find "$HOME/.pi/agent/extensions" -mindepth 1 -maxdepth 1 \
    -printf '%f\n' | sort)
expected_extensions=(appearance-sync ssh-direct study-learn-emit)
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
rvi --help >/dev/null
zellij-tab-picker --help >/dev/null
study doctor >/dev/null
pass 'Pi and workstation entrypoints launch without authentication'

bash -lic '
    command -v pi >/dev/null
    command -v rvi >/dev/null
    command -v study >/dev/null
' || fail 'login shell did not load the workstation PATH'
pass 'fresh Bash login shell loads the workstation layer'

printf '\nCLEAN INSTALL READY\n'
printf 'Only provider authentication and machine-local work skills remain.\n'
