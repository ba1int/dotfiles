#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
agent_dir=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
npm_prefix=${PI_NPM_PREFIX:-"$HOME/.local"}
stamp=$(date '+%Y%m%d-%H%M%S')
install_package=1
install_ops_packages=1
share_codex_skills=1

usage() {
    cat <<'EOF'
Usage: ./install-pi.sh [options]

Installs Pi into ~/.local and applies the portable Protocol Ink module. Pi's
credentials, sessions, trust decisions, model selection, and package state
remain machine-local. The optional operations package set is version-pinned in
pi/packages.txt and installed without replacing unrelated Pi packages.

Options:
  --config-only      Link and merge configuration without installing Pi.
  --no-ops-packages  Skip the two reviewed third-party operations packages;
                     the repository-owned Protocol Ops extension still links.
  --no-codex-skills  Do not bridge the selected user-owned Codex skills.
  -h, --help         Show this help.

Environment:
  PI_NPM_PREFIX      User-local npm prefix (default: ~/.local).
  PI_CODING_AGENT_DIR
                     Pi state directory (default: ~/.pi/agent).
  PI_CODEX_SKILLS    Space-separated user skill names to bridge from
                     ~/.codex/skills (default: design-protocol-paper).
EOF
}

while [ "$#" -gt 0 ]; do
    case $1 in
        --config-only)
            install_package=0
            install_ops_packages=0
            ;;
        --no-ops-packages)
            install_ops_packages=0
            ;;
        --no-codex-skills)
            share_codex_skills=0
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

pi_package_is_ready() {
    settings_path=$1
    package_source=$2

    if command -v node >/dev/null 2>&1; then
        package_node_command=node
    elif [ -x "$npm_prefix/bin/node" ]; then
        package_node_command="$npm_prefix/bin/node"
    else
        return 1
    fi

    "$package_node_command" - "$settings_path" "$agent_dir" "$package_source" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [settingsPath, agentDir, source] = process.argv.slice(2);
if (!source.startsWith('npm:')) process.exit(1);

const spec = source.slice(4);
const separator = spec.lastIndexOf('@');
if (separator <= 0 || separator === spec.length - 1) process.exit(1);

const name = spec.slice(0, separator);
const expectedVersion = spec.slice(separator + 1);

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch {
  process.exit(1);
}

const configured = Array.isArray(settings.packages)
  && settings.packages.some((entry) =>
    (typeof entry === 'string' ? entry : entry?.source) === source);
if (!configured) process.exit(1);

const manifestPath = path.join(
  agentDir,
  'npm',
  'node_modules',
  ...name.split('/'),
  'package.json',
);

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  process.exit(manifest.name === name && manifest.version === expectedVersion ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

install_pi_packages() {
    package_manifest=$1
    pi_command=$2

    if [ ! -f "$package_manifest" ]; then
        printf 'error   Pi package manifest not found: %s\n' "$package_manifest" >&2
        exit 1
    fi

    while IFS= read -r package_source || [ -n "$package_source" ]; do
        case $package_source in
            ''|'#'*) continue ;;
            npm:*) ;;
            *)
                printf 'error   unsupported Pi package source: %s\n' "$package_source" >&2
                exit 2
                ;;
        esac

        if pi_package_is_ready "$agent_dir/settings.json" "$package_source"; then
            printf 'ok      %s\n' "$package_source"
            continue
        fi

        "$pi_command" install "$package_source" --no-approve
    done < "$package_manifest"
}

pi_core_is_ready() {
    manifest_path=$1
    expected_version=$2

    [ -x "$npm_prefix/bin/pi" ] || return 1
    node - "$manifest_path" "$expected_version" <<'NODE'
const fs = require('node:fs');
const [manifestPath, expectedVersion] = process.argv.slice(2);

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  process.exit(
    manifest.name === '@earendil-works/pi-coding-agent'
      && manifest.version === expectedVersion
      ? 0
      : 1,
  );
} catch {
  process.exit(1);
}
NODE
}

ensure_settings_overlay() {
    fragment_path=$1
    target_path=$2
    temporary_path="${target_path}.protocol-ink.$$"

    mkdir -p "$(dirname -- "$target_path")"

    if command -v node >/dev/null 2>&1; then
        node_command=node
    elif [ -x "$npm_prefix/bin/node" ]; then
        node_command="$npm_prefix/bin/node"
    else
        printf 'error   Node.js is required to merge Pi settings safely\n' >&2
        exit 1
    fi

    if "$node_command" - "$target_path" "$fragment_path" "$temporary_path" <<'NODE'
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');

const [targetPath, fragmentPath, temporaryPath] = process.argv.slice(2);

function readObject(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${path} must contain one JSON object`);
  }
  return value;
}

const current = readObject(targetPath, {});
const fragment = readObject(fragmentPath, null);

if (Object.entries(fragment).every(([key, value]) =>
  isDeepStrictEqual(current[key], value))) {
  process.exit(3);
}

const merged = { ...current, ...fragment };
fs.writeFileSync(temporaryPath, `${JSON.stringify(merged, null, 2)}\n`, {
  mode: 0o600,
});
NODE
    then
        merge_status=0
    else
        merge_status=$?
    fi

    case $merge_status in
        0)
            if [ -e "$target_path" ] || [ -L "$target_path" ]; then
                backup_path="${target_path}.backup-${stamp}"
                if [ -L "$target_path" ]; then
                    mv "$target_path" "$backup_path"
                else
                    cp -p "$target_path" "$backup_path"
                fi
                printf 'backup  %s -> %s\n' "$target_path" "$backup_path"
            fi

            mv "$temporary_path" "$target_path"
            chmod 0600 "$target_path"
            printf 'merge   %s <- %s\n' "$target_path" "$fragment_path"
            ;;
        3)
            rm -f "$temporary_path"
            printf 'ok      %s\n' "$target_path"
            ;;
        *)
            rm -f "$temporary_path"
            printf 'error   could not merge %s into %s\n' "$fragment_path" "$target_path" >&2
            exit "$merge_status"
            ;;
    esac
}

if [ "$install_package" -eq 1 ]; then
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        printf 'error   Pi requires Node.js 22.19+ and npm\n' >&2
        exit 1
    fi

    if ! node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
process.exit(major > 22 || (major === 22 && minor >= 19) ? 0 : 1);
'; then
        printf 'error   Pi requires Node.js 22.19+; found %s\n' "$(node --version)" >&2
        exit 1
    fi

    pi_version_file="$repo_root/pi/version.txt"
    if [ ! -f "$pi_version_file" ]; then
        printf 'error   Pi version file not found: %s\n' "$pi_version_file" >&2
        exit 1
    fi
    IFS= read -r pi_version < "$pi_version_file" || true
    if ! printf '%s\n' "$pi_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        printf 'error   invalid Pi version: %s\n' "$pi_version" >&2
        exit 2
    fi

    mkdir -p "$npm_prefix"
    pi_manifest="$npm_prefix/lib/node_modules/@earendil-works/pi-coding-agent/package.json"
    if pi_core_is_ready "$pi_manifest" "$pi_version"; then
        printf 'ok      @earendil-works/pi-coding-agent@%s\n' "$pi_version"
    else
        npm install --global --prefix "$npm_prefix" --ignore-scripts \
            "@earendil-works/pi-coding-agent@$pi_version"
    fi
fi

link_path "$repo_root/pi/themes/protocol-ink.json" \
    "$agent_dir/themes/protocol-ink.json"
link_path "$repo_root/bin/pi-safe" "$npm_prefix/bin/pi-safe"
link_path "$repo_root/pi/extensions/protocol-ops" \
    "$agent_dir/extensions/protocol-ops"
ensure_settings_overlay "$repo_root/pi/settings.fragment.json" \
    "$agent_dir/settings.json"

if [ "$install_ops_packages" -eq 1 ]; then
    pi_command="$npm_prefix/bin/pi"
    if [ ! -x "$pi_command" ]; then
        printf 'error   Pi executable not found: %s\n' "$pi_command" >&2
        exit 1
    fi

    install_pi_packages "$repo_root/pi/packages.txt" "$pi_command"
fi

permission_package_dir="$agent_dir/npm/node_modules/pi-permission-system"
if [ -d "$permission_package_dir" ]; then
    ensure_settings_overlay "$repo_root/pi/permission-system.config.fragment.json" \
        "$permission_package_dir/config.json"
fi

link_path "$repo_root/pi/pi-permissions.jsonc" \
    "$agent_dir/pi-permissions.jsonc"

if [ "$share_codex_skills" -eq 1 ]; then
    set -f
    for skill_name in ${PI_CODEX_SKILLS:-design-protocol-paper}; do
        case $skill_name in
            *[!a-z0-9-]*|'')
                printf 'error   invalid PI_CODEX_SKILLS entry: %s\n' "$skill_name" >&2
                exit 2
                ;;
        esac

        skill_source="$HOME/.codex/skills/$skill_name"
        if [ -f "$skill_source/SKILL.md" ]; then
            link_path "$skill_source" "$agent_dir/skills/$skill_name"
        else
            printf 'skip    Codex skill not found: %s\n' "$skill_source" >&2
        fi
    done
    set +f
fi

printf '\nPi + Protocol Ink are ready. Authentication remains machine-local.\n'
printf 'Run pi, enter /login, choose ChatGPT Plus/Pro (Codex), then use /model.\n'
case :$PATH: in
    *:"$npm_prefix/bin":*) ;;
    *) printf 'Add %s/bin to PATH, or start a new Protocol Ink shell.\n' "$npm_prefix" ;;
esac
if [ "$install_ops_packages" -eq 1 ]; then
    printf 'Keep /permission-system yolo mode off during SSH work.\n'
    printf 'Use /ssh HOST to enter SSH mode; use Allow Once for every ssh_bash prompt.\n'
    printf 'ssh_write and ssh_edit are policy-denied. /ssh off returns to local mode.\n'
    printf 'Protocol Ops named read batches do not require /ssh; start with an operations task in Pi.\n'
fi
printf 'pi-safe disables extensions and gives the agent read-only local tools; a manual !command still runs.\n'
