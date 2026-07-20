#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
pi_tools_dir=${PI_TOOLS_DIR:-"$HOME/pi-tools"}
pi_tools_repo=${PI_TOOLS_REPO:-git@github.com:ba1int/pi-tools.git}
study_room_dir=${STUDY_ROOM_DIR:-"$HOME/study-room"}
study_room_repo=${STUDY_ROOM_REPO:-git@github.com:ba1int/study-room.git}
stamp=$(date '+%Y%m%d-%H%M%S')
set_default=1
install_font=1
temporary_dir=''

# shellcheck disable=SC1091
. "$repo_root/versions.env"

cleanup() {
    if [ -n "$temporary_dir" ] && [ -d "$temporary_dir" ]; then
        rm -rf "$temporary_dir"
    fi
}

trap cleanup EXIT
trap 'cleanup; exit 1' HUP INT TERM

usage() {
    cat <<'EOF'
Usage: ./install-workstation.sh [--no-default] [--no-font]

Bootstraps the complete Protocol Ink workstation inside Ubuntu/Debian WSL:
base packages, pinned user-local Node and Zellij, dotfiles, pi-tools, and the
Study Room.

Options:
  --no-default  Keep the current Windows Terminal default profile.
  --no-font     Do not install Commit Mono in Windows.
  -h, --help    Show this help.

Environment:
  PI_TOOLS_DIR   pi-tools checkout (default: ~/pi-tools)
  PI_TOOLS_REPO  clone source when PI_TOOLS_DIR is absent
  STUDY_ROOM_DIR   Study Room checkout (default: ~/study-room)
  STUDY_ROOM_REPO  clone source when STUDY_ROOM_DIR is absent
EOF
}

while [ "$#" -gt 0 ]; do
    case $1 in
        --no-default) set_default=0 ;;
        --no-font) install_font=0 ;;
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

if [ "$(uname -s)" != Linux ] \
    || { [ -z "${WSL_DISTRO_NAME:-}" ] \
        && ! grep -qi microsoft /proc/sys/kernel/osrelease; }; then
    printf 'install-workstation.sh must be run from inside WSL.\n' >&2
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1 \
    || ! command -v dpkg-query >/dev/null 2>&1; then
    printf 'install-workstation.sh currently supports Ubuntu/Debian WSL.\n' >&2
    exit 1
fi
if ! command -v sudo >/dev/null 2>&1; then
    printf 'sudo is required; install it or run the modular installers manually.\n' >&2
    exit 1
fi

install_apt_dependencies() {
    missing_packages=''
    for package_name in \
        ca-certificates curl fzf git less man-db neovim \
        openssh-client ripgrep xz-utils
    do
        if ! dpkg-query -W -f='${Status}\n' "$package_name" 2>/dev/null \
            | grep -Fqx 'install ok installed'; then
            missing_packages="$missing_packages $package_name"
        fi
    done

    if [ -z "$missing_packages" ]; then
        printf 'ok      Ubuntu workstation packages\n'
        return
    fi

    printf 'install Ubuntu packages:%s\n' "$missing_packages"
    sudo -v
    sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get update
    # The package list is a fixed set assembled above; word splitting is wanted.
    # shellcheck disable=SC2086
    sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
        apt-get install -y --no-install-recommends $missing_packages
}

backup_and_link() {
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

install_node() {
    if command -v node >/dev/null 2>&1 \
        && command -v npm >/dev/null 2>&1 \
        && node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
process.exit(major > 22 || (major === 22 && minor >= 19) ? 0 : 1);
'; then
        printf 'ok      Node %s\n' "$(node --version)"
        return
    fi

    case $(uname -m) in
        x86_64) node_arch=x64 ;;
        aarch64|arm64) node_arch=arm64 ;;
        *)
            printf 'unsupported Node architecture: %s\n' "$(uname -m)" >&2
            exit 1
            ;;
    esac

    archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
    temporary_dir=$(mktemp -d)
    download_dir=$temporary_dir
    node_url="https://nodejs.org/dist/v${NODE_VERSION}"
    curl -fsSLo "$download_dir/$archive" "$node_url/$archive"
    curl -fsSLo "$download_dir/SHASUMS256.txt" "$node_url/SHASUMS256.txt"
    (
        cd "$download_dir"
        grep -F "  $archive" SHASUMS256.txt > SHASUMS256.selected
        sha256sum -c SHASUMS256.selected
    )

    node_target="$HOME/.local/opt/node-v${NODE_VERSION}"
    node_staging="${node_target}.staging.$$"
    mkdir -p "$HOME/.local/opt"
    tar -xJf "$download_dir/$archive" -C "$download_dir"
    mv "$download_dir/node-v${NODE_VERSION}-linux-${node_arch}" "$node_staging"
    if [ -e "$node_target" ]; then
        mv "$node_target" "${node_target}.backup-${stamp}"
    fi
    mv "$node_staging" "$node_target"
    rm -rf "$download_dir"
    temporary_dir=''

    for command_name in node npm npx corepack; do
        if [ -e "$node_target/bin/$command_name" ] \
            || [ -L "$node_target/bin/$command_name" ]; then
            backup_and_link "$node_target/bin/$command_name" \
                "$HOME/.local/bin/$command_name"
        fi
    done
    printf 'install Node v%s (user-local)\n' "$NODE_VERSION"
}

install_zellij() {
    expected_version="zellij $ZELLIJ_VERSION"
    if command -v zellij >/dev/null 2>&1 \
        && [ "$(zellij --version)" = "$expected_version" ]; then
        printf 'ok      %s\n' "$expected_version"
        return
    fi

    case $(uname -m) in
        x86_64) zellij_arch=x86_64 ;;
        aarch64|arm64) zellij_arch=aarch64 ;;
        *)
            printf 'unsupported Zellij architecture: %s\n' "$(uname -m)" >&2
            exit 1
            ;;
    esac

    asset="zellij-${zellij_arch}-unknown-linux-musl"
    release_url="https://github.com/zellij-org/zellij/releases/download/v${ZELLIJ_VERSION}"
    temporary_dir=$(mktemp -d)
    download_dir=$temporary_dir
    curl -fsSLo "$download_dir/$asset.tar.gz" "$release_url/$asset.tar.gz"
    curl -fsSLo "$download_dir/$asset.sha256sum" \
        "$release_url/$asset.sha256sum"
    expected_sha=$(sed -n '1{s/[[:space:]].*//;p;}' \
        "$download_dir/$asset.sha256sum")
    tar -xzf "$download_dir/$asset.tar.gz" -C "$download_dir" zellij
    printf '%s  %s\n' "$expected_sha" "$download_dir/zellij" \
        | sha256sum -c -
    zellij_target="$HOME/.local/opt/zellij-v${ZELLIJ_VERSION}/zellij"
    if [ -e "$(dirname -- "$zellij_target")" ]; then
        mv "$(dirname -- "$zellij_target")" \
            "$(dirname -- "$zellij_target").backup-${stamp}"
    fi
    mkdir -p "$(dirname -- "$zellij_target")"
    install -m 0755 "$download_dir/zellij" "$zellij_target"
    backup_and_link "$zellij_target" "$HOME/.local/bin/zellij"
    rm -rf "$download_dir"
    temporary_dir=''
    printf 'install Zellij %s (user-local)\n' "$ZELLIJ_VERSION"
}

install_pi_tools() {
    if [ ! -e "$pi_tools_dir" ]; then
        git clone "$pi_tools_repo" "$pi_tools_dir"
    elif [ ! -d "$pi_tools_dir" ]; then
        printf 'PI_TOOLS_DIR is not a directory: %s\n' "$pi_tools_dir" >&2
        exit 1
    fi

    if [ ! -x "$pi_tools_dir/install.sh" ]; then
        printf 'pi-tools installer not found: %s/install.sh\n' "$pi_tools_dir" >&2
        exit 1
    fi
    "$pi_tools_dir/install.sh"
}

install_study_room() {
    if [ ! -e "$study_room_dir" ]; then
        git clone "$study_room_repo" "$study_room_dir"
    elif [ ! -d "$study_room_dir" ]; then
        printf 'STUDY_ROOM_DIR is not a directory: %s\n' "$study_room_dir" >&2
        exit 1
    fi

    if [ ! -x "$study_room_dir/install.sh" ]; then
        printf 'Study Room installer not found: %s/install.sh\n' \
            "$study_room_dir" >&2
        exit 1
    fi
    "$study_room_dir/install.sh"
}

install_apt_dependencies
mkdir -p "$HOME/.local/bin"
PATH="$HOME/.local/bin:$PATH"
export PATH
install_node
install_zellij

set --
[ "$set_default" -eq 1 ] || set -- "$@" --no-default
[ "$install_font" -eq 1 ] || set -- "$@" --no-font
"$repo_root/install-wsl.sh" "$@"
install_pi_tools
install_study_room

printf '\nWORKSTATION READY // PROTOCOL INK\n'
printf 'Restart Windows Terminal, run pi, and complete /login.\n'
printf 'Run study inside Zellij to open the Study Room.\n'
printf 'Add machine-local work skills separately; no credentials were copied.\n'
