# Shared strict host-inventory helpers.

if [[ ${OPS_INVENTORY_LOADED:-0} == 1 ]]; then
    return 0
fi
OPS_INVENTORY_LOADED=1

ops_inventory_path() {
    local explicit
    explicit=${1:-}
    if [[ -n $explicit ]]; then
        printf '%s\n' "$explicit"
    elif [[ -n ${OPS_INVENTORY:-} ]]; then
        printf '%s\n' "$OPS_INVENTORY"
    elif [[ -n ${HOP_INVENTORY:-} ]]; then
        printf '%s\n' "$HOP_INVENTORY"
    else
        printf '%s/hop/hosts.tsv\n' "${XDG_CONFIG_HOME:-$HOME/.config}"
    fi
}

ops_inventory_normalize() {
    local source target
    source=$1
    target=$2
    [[ -r $source ]] || ops_die "inventory is not readable: $source"

    LC_ALL=C awk -F '\t' -v OFS='\t' -v program="$OPS_PROGRAM" '
        { sub(/\r$/, "", $0) }
        NR == 1 {
            if ($0 != "name\tenvironment\trole\tsite") {
                printf "%s: inventory header must be name<TAB>environment<TAB>role<TAB>site\n", program > "/dev/stderr"
                fatal = 1
                exit 2
            }
            next
        }
        NF != 4 {
            printf "%s: inventory line %d must contain exactly four tab-separated fields\n", program, NR > "/dev/stderr"
            bad = 1
            next
        }
        $1 !~ /^[A-Za-z0-9][A-Za-z0-9._-]*$/ {
            printf "%s: inventory line %d has an unsafe host alias: %s\n", program, NR, $1 > "/dev/stderr"
            bad = 1
            next
        }
        $1 == "" || $2 == "" || $3 == "" || $4 == "" {
            printf "%s: inventory line %d contains an empty field\n", program, NR > "/dev/stderr"
            bad = 1
            next
        }
        $1 ~ /[[:cntrl:]]/ || $2 ~ /[[:cntrl:]]/ || $3 ~ /[[:cntrl:]]/ || $4 ~ /[[:cntrl:]]/ {
            printf "%s: inventory line %d contains a control character\n", program, NR > "/dev/stderr"
            bad = 1
            next
        }
        seen[$1]++ {
            printf "%s: duplicate host alias on inventory line %d: %s\n", program, NR, $1 > "/dev/stderr"
            bad = 1
            next
        }
        { print $1, $2, $3, $4; records++ }
        END {
            if (fatal || bad) exit 2
            if (records == 0) {
                printf "%s: inventory contains no host records\n", program > "/dev/stderr"
                exit 2
            }
        }
    ' "$source" > "$target"
}

ops_inventory_has() {
    LC_ALL=C awk -F '\t' -v wanted="$2" \
        '$1 == wanted { found = 1; exit } END { exit !found }' "$1"
}

ops_inventory_find() {
    LC_ALL=C awk -F '\t' -v wanted="$2" \
        '$1 == wanted { print; exit }' "$1"
}

ops_inventory_count() {
    LC_ALL=C awk 'END { print NR + 0 }' "$1"
}
