#!/bin/bash

set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
tmp_dir=$(mktemp -d)
tmp_dir=$(cd "$tmp_dir" && pwd -P)
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
    printf 'FAIL  %s\n' "$*" >&2
    exit 1
}

mkdir -p "$tmp_dir/bin" "$tmp_dir/home/.config/zellij/layouts" "$tmp_dir/work/project"
ln -s "$repo_root/zellij/layouts/protocol-tab-pi.kdl" \
    "$tmp_dir/home/.config/zellij/layouts/protocol-tab-pi.kdl"
ln -s "$repo_root/zellij/layouts/protocol-tab-shell.kdl" \
    "$tmp_dir/home/.config/zellij/layouts/protocol-tab-shell.kdl"

cat > "$tmp_dir/bin/fzf" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "$@" >> "$PICKER_FZF_ARGS"
input=$(cat)
count=0
[ ! -r "$PICKER_FZF_COUNT" ] || count=$(cat "$PICKER_FZF_COUNT")
count=$((count + 1))
printf '%s\n' "$count" > "$PICKER_FZF_COUNT"
line_number=$(sed -n "${count}p" "$PICKER_FZF_CHOICES")
printf '%s\n' "$input" | sed -n "${line_number}p"
EOF

cat > "$tmp_dir/bin/zellij" <<'EOF'
#!/bin/sh
printf '%s\n' "$@" > "$PICKER_ZELLIJ_ARGS"
EOF

cat > "$tmp_dir/bin/uname" <<'EOF'
#!/bin/sh
printf '%s\n' "$PICKER_UNAME"
EOF

cat > "$tmp_dir/bin/powershell.exe" <<'EOF'
#!/bin/sh
printf '%s\r\n' "$PICKER_APPS_USE_LIGHT"
EOF
chmod +x "$tmp_dir/bin/fzf" "$tmp_dir/bin/zellij" \
    "$tmp_dir/bin/uname" "$tmp_dir/bin/powershell.exe"

run_picker() {
    local choices=$1
    local expected_layout=$2
    local expected_cwd=$3
    local expected_name=$4
    local appearance=$5
    local expected_background=$6
    local platform=${7:-"$(uname -s)"}
    local wsl_distro=${8:-}
    local apps_use_light=${9:-}

    printf '%s\n' "$choices" > "$tmp_dir/choices"
    : > "$tmp_dir/count"
    : > "$tmp_dir/fzf-args"
    (
        cd "$tmp_dir/work/project"
        HOME="$tmp_dir/home" \
        PATH="$tmp_dir/bin:$PATH" \
        ZELLIJ_SESSION_NAME=test \
        PICKER_FZF_COUNT="$tmp_dir/count" \
        PICKER_FZF_CHOICES="$tmp_dir/choices" \
        PICKER_FZF_ARGS="$tmp_dir/fzf-args" \
        PICKER_ZELLIJ_ARGS="$tmp_dir/args" \
        PICKER_UNAME="$platform" \
        PICKER_APPS_USE_LIGHT="$apps_use_light" \
        PROTOCOL_INK_APPEARANCE="$appearance" \
        WSL_DISTRO_NAME="$wsl_distro" \
        WSL_INTEROP="$wsl_distro" \
            "$repo_root/bin/zellij-tab-picker"
    )

    args=$(tr '\n' ' ' < "$tmp_dir/args")
    [[ $args == *"--name $expected_name"* ]] \
        || fail "wrong tab name: $args"
    [[ $args == *"--cwd $expected_cwd"* ]] \
        || fail "wrong cwd: $args"
    [[ $args == *"$expected_layout"* ]] \
        || fail "wrong layout: $args"
    grep -F "bg:$expected_background" "$tmp_dir/fzf-args" >/dev/null \
        || fail "$appearance picker did not use $expected_background"
}

run_picker $'1\n1' protocol-tab-pi.kdl "$tmp_dir/work/project" 'PI DESK' \
    light '#EDEAE1'
run_picker $'2\n2' protocol-tab-shell.kdl "$tmp_dir/home" 'SHELL DESK' \
    dark '#151714'

if [[ $(uname -s) == Darwin ]] \
    && ! defaults read -g AppleInterfaceStyle 2>/dev/null | grep -qi dark; then
    system_background='#EDEAE1'
else
    system_background='#151714'
fi
run_picker $'1\n2' protocol-tab-pi.kdl "$tmp_dir/home" 'PI DESK' \
    '' "$system_background"
run_picker $'1\n1' protocol-tab-pi.kdl "$tmp_dir/work/project" 'PI DESK' \
    '' '#EDEAE1' Linux Ubuntu 1
run_picker $'2\n2' protocol-tab-shell.kdl "$tmp_dir/home" 'SHELL DESK' \
    '' '#151714' Linux Ubuntu 0

for layout in protocol-tab-pi protocol-tab-shell; do
    directions=$(sed -n 's/.*split_direction="\([^"]*\)".*/\1/p' \
        "$repo_root/zellij/layouts/$layout.kdl" | tr '\n' ' ')
    [[ $directions == 'vertical horizontal ' ]] \
        || fail "$layout is not one-left, two-right: $directions"
done

grep -F 'command="pi"' "$repo_root/zellij/layouts/protocol-tab-pi.kdl" >/dev/null \
    || fail 'Pi layout does not launch Pi'
if grep -F 'command=' "$repo_root/zellij/layouts/protocol-tab-shell.kdl" >/dev/null; then
    fail 'shell layout unexpectedly launches a command'
fi

printf 'PASS  Zellij tab picker preserves layout and cwd choices\n'
