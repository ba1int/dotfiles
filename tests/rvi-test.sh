#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=../bin/rvi
source "$repo_root/bin/rvi"

fail() {
    printf 'not ok - %s\n' "$1" >&2
    exit 1
}

assert_equal() {
    [[ $1 == "$2" ]] || fail "expected '$2', got '$1'"
}

rvi_validate_host 'operator@app01.example.net' || fail 'valid user@host rejected'
! rvi_validate_host 'root@app;evil' || fail 'unsafe host accepted'
rvi_validate_path '/etc/icinga2/zones.d/dc1/hosts.conf' || fail 'valid path rejected'
! rvi_validate_path '../etc/shadow' || fail 'relative path accepted'
! rvi_validate_path '/etc/a path' || fail 'space-containing path accepted'
! rvi_validate_path '/etc//shadow' || fail 'double-slash path accepted'
assert_equal "$(rvi_netrw_url lab-prod-app01 /etc/hosts)" 'scp://lab-prod-app01//etc/hosts'

scratch=$(mktemp -d "${TMPDIR:-/tmp}/rvi-test.XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
target=$scratch/target.conf
link=$scratch/link.conf
upload=$scratch/upload
printf 'before\n' > "$target"
chmod 640 "$target"
ln -s "$target" "$link"
printf 'after\n' > "$upload"
read -r crc bytes _ < <(cksum < "$target")
rvi_emit_apply_script | sh -s -- "$link" "$upload" "$crc" "$bytes"
assert_equal "$(cat "$target")" 'after'
[[ -L $link ]] || fail 'symlink was replaced'
mode=$(stat -c '%a' "$target" 2>/dev/null || stat -f '%Lp' "$target")
assert_equal "$mode" '640'

printf 'version-one\n' > "$target"
printf 'version-two\n' > "$upload"
read -r crc bytes _ < <(cksum < "$target")
printf 'concurrent-change\n' > "$target"
if rvi_emit_apply_script | sh -s -- "$target" "$upload" "$crc" "$bytes" 2>/dev/null; then
    fail 'concurrent remote change was overwritten'
fi
assert_equal "$(cat "$target")" 'concurrent-change'

printf 'linked\n' > "$target"
ln "$target" "$scratch/hardlink.conf"
printf 'replacement\n' > "$upload"
read -r crc bytes _ < <(cksum < "$target")
if rvi_emit_apply_script | sh -s -- "$target" "$upload" "$crc" "$bytes" 2>/dev/null; then
    fail 'hard-linked target was replaced'
fi
assert_equal "$(cat "$target")" 'linked'

printf 'ok - rvi validation and atomic apply invariants\n'
