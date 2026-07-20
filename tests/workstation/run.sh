#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
pi_tools_dir=${PI_TOOLS_DIR:-"$(dirname -- "$repo_root")/pi-tools"}
study_room_dir=${STUDY_ROOM_DIR:-"$(dirname -- "$repo_root")/study-room"}
image_name=${WORKSTATION_SMOKE_IMAGE:-protocol-workstation-smoke:local}
platform=${WORKSTATION_SMOKE_PLATFORM:-linux/amd64}

if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker is required for the workstation smoke test.\n' >&2
    exit 1
fi
if [ ! -f "$pi_tools_dir/install.sh" ]; then
    printf 'Set PI_TOOLS_DIR to a pi-tools checkout (looked in %s).\n' \
        "$pi_tools_dir" >&2
    exit 1
fi
if [ ! -f "$study_room_dir/install.sh" ]; then
    printf 'Set STUDY_ROOM_DIR to a Study Room checkout (looked in %s).\n' \
        "$study_room_dir" >&2
    exit 1
fi

docker build \
    --platform "$platform" \
    --build-context "dotfiles=$repo_root" \
    --build-context "pi_tools=$pi_tools_dir" \
    --build-context "study_room=$study_room_dir" \
    -t "$image_name" \
    -f "$repo_root/tests/workstation/Dockerfile" \
    "$repo_root"
if [ "${WORKSTATION_SMOKE_ONLINE:-0}" = 1 ]; then
    docker run --rm --platform "$platform" \
        -e DOTFILES_REPO=https://github.com/ba1int/dotfiles.git \
        -e PI_TOOLS_REPO=https://github.com/ba1int/pi-tools.git \
        -e STUDY_ROOM_REPO=https://github.com/ba1int/study-room.git \
        "$image_name"
else
    docker run --rm --platform "$platform" "$image_name"
fi
