#!/bin/sh
set -eu

font_root=$(CDPATH= cd -- "$(dirname -- "$0")/commit-mono" && pwd)
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
font_changed=0

case $(uname -s) in
    Darwin)
        font_target_dir="$HOME/Library/Fonts"
        ;;
    Linux)
        font_target_dir="$data_home/fonts"
        ;;
    *)
        printf 'Commit Mono installer does not support this platform.\n' >&2
        exit 1
        ;;
esac

mkdir -p "$font_target_dir"
for font_name in CommitMono-400-Regular.otf CommitMono-700-Regular.otf; do
    font_source="$font_root/$font_name"
    font_target="$font_target_dir/$font_name"

    if [ ! -f "$font_source" ]; then
        printf 'error   bundled font is missing: %s\n' "$font_source" >&2
        exit 1
    fi
    if [ -f "$font_target" ] && cmp -s "$font_source" "$font_target"; then
        printf 'ok      %s\n' "$font_target"
        continue
    fi

    install -m 0644 "$font_source" "$font_target"
    font_changed=1
    printf 'install %s\n' "$font_target"
done

if [ "$font_changed" -eq 1 ] && [ "$(uname -s)" = Linux ]; then
    if command -v fc-cache >/dev/null 2>&1; then
        fc-cache -f "$font_target_dir" >/dev/null
        printf 'refresh fontconfig cache\n'
    else
        printf 'warn    fc-cache not found; restart the desktop session if CommitMono is not visible\n' >&2
    fi
fi
