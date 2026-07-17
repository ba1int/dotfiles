# Shared Protocol Ops runtime primitives. Bash 3.2 compatible.

if [[ ${OPS_RUNTIME_LOADED:-0} == 1 ]]; then
    return 0
fi
OPS_RUNTIME_LOADED=1

OPS_PROGRAM=${OPS_PROGRAM:-ops}
OPS_CONFIG_HOME=${OPS_CONFIG_HOME:-"${XDG_CONFIG_HOME:-$HOME/.config}/protocol-ops"}
OPS_FZF_BIN=${OPS_FZF_BIN:-fzf}
OPS_SSH_BIN=${OPS_SSH_BIN:-ssh}
OPS_TMP_BASE=
OPS_TMPDIR=
OPS_TMP_ACTIVE=0

readonly OPS_BG='#171815'
readonly OPS_FG='#E8E1D2'
readonly OPS_PAPER='#F3F0E7'
readonly OPS_RULE='#44463F'
readonly OPS_META='#8D8F86'
readonly OPS_TEAL='#78B8B3'
readonly OPS_TEAL_DARK='#426B68'
readonly OPS_CORAL='#EF5B4C'
readonly OPS_CITRON='#E1EC58'
readonly OPS_MINT='#70DDAA'

readonly OPS_ANSI_RESET=$'\033[0m'
readonly OPS_ANSI_FG=$'\033[38;2;232;225;210m'
readonly OPS_ANSI_PAPER=$'\033[38;2;243;240;231m'
readonly OPS_ANSI_META=$'\033[38;2;141;143;134m'
readonly OPS_ANSI_TEAL=$'\033[38;2;120;184;179m'
readonly OPS_ANSI_CORAL=$'\033[38;2;239;91;76m'
readonly OPS_ANSI_CITRON=$'\033[38;2;225;236;88m'
readonly OPS_ANSI_MINT=$'\033[38;2;112;221;170m'

ops_die() {
    printf '%s: %s\n' "$OPS_PROGRAM" "$*" >&2
    exit 1
}

ops_warn() {
    printf '%s: warning: %s\n' "$OPS_PROGRAM" "$*" >&2
}

ops_need() {
    command -v "$1" >/dev/null 2>&1 || ops_die "missing required command: $1"
}

ops_color_active() {
    case ${OPS_COLOR:-auto} in
        1) return 0 ;;
        0) return 1 ;;
        auto)
            [[ -z ${NO_COLOR:-} && ${TERM:-} != dumb && -t 1 ]]
            ;;
        *) return 1 ;;
    esac
}

ops_tone() {
    case ${1:-normal} in
        accent) printf '%s' "$OPS_ANSI_TEAL" ;;
        critical) printf '%s' "$OPS_ANSI_CORAL" ;;
        warning) printf '%s' "$OPS_ANSI_CITRON" ;;
        ok) printf '%s' "$OPS_ANSI_MINT" ;;
        paper) printf '%s' "$OPS_ANSI_PAPER" ;;
        meta) printf '%s' "$OPS_ANSI_META" ;;
        *) printf '%s' "$OPS_ANSI_FG" ;;
    esac
}

ops_field() {
    local label value tone width
    label=$1
    value=$2
    tone=${3:-normal}
    width=${OPS_LABEL_WIDTH:-15}

    if ops_color_active; then
        printf '%s' "$OPS_ANSI_META"
    fi
    printf "%-${width}s" "$label"
    if ops_color_active; then
        ops_tone "$tone"
    fi
    printf '%s' "$value"
    if ops_color_active; then
        printf '%s' "$OPS_ANSI_RESET"
    fi
    printf '\n'
}

ops_heading() {
    if ops_color_active; then
        printf '%s%s%s\n' "$OPS_ANSI_TEAL" "$1" "$OPS_ANSI_RESET"
    else
        printf '%s\n' "$1"
    fi
}

ops_age() {
    local changed now delta
    changed=${1:-0}
    case $changed in
        ''|*[!0-9]*) printf -- '-'; return ;;
    esac
    now=$(date +%s)
    (( changed > 0 && changed <= now )) || { printf -- '-'; return; }
    delta=$((now - changed))
    if (( delta < 60 )); then
        printf '<1m'
    elif (( delta < 3600 )); then
        printf '%dm' "$((delta / 60))"
    elif (( delta < 86400 )); then
        printf '%dh' "$((delta / 3600))"
    else
        printf '%dd' "$((delta / 86400))"
    fi
}

ops_tmp_cleanup() {
    local candidate
    trap - EXIT HUP INT TERM
    if [[ ${OPS_TMP_ACTIVE:-0} != 1 ]]; then
        OPS_TMPDIR=
        return 0
    fi
    candidate=${OPS_TMPDIR:-}
    [[ -n $candidate ]] || return 0
    case $candidate in
        "${OPS_TMP_BASE%/}"/protocol-ops."$OPS_PROGRAM".*)
            rm -rf -- "$candidate" 2>/dev/null || true
            ;;
    esac
    OPS_TMPDIR=
    OPS_TMP_ACTIVE=0
}

ops_tmp_exit() {
    local status
    status=$1
    ops_tmp_cleanup
    exit "$status"
}

ops_tmp_open() {
    local previous_umask
    [[ ${OPS_TMP_ACTIVE:-0} != 1 ]] || return 0
    OPS_TMP_BASE=${TMPDIR:-/tmp}
    OPS_TMP_BASE=${OPS_TMP_BASE%/}
    [[ -n $OPS_TMP_BASE ]] || OPS_TMP_BASE=/
    [[ -d $OPS_TMP_BASE && -w $OPS_TMP_BASE ]] \
        || ops_die "temporary directory is not writable: $OPS_TMP_BASE"
    previous_umask=$(umask)
    umask 077
    OPS_TMPDIR=$(mktemp -d \
        "${OPS_TMP_BASE%/}/protocol-ops.${OPS_PROGRAM}.XXXXXX") || {
        umask "$previous_umask"
        ops_die 'could not create a private temporary directory'
    }
    umask "$previous_umask"
    OPS_TMP_ACTIVE=1
    trap 'ops_tmp_exit "$?"' EXIT
    trap 'exit 130' HUP INT TERM
}
