# Protocol Ink / workstation command completion

if [ -n "${BASH_VERSION:-}" ] && command -v complete >/dev/null 2>&1; then
    _protocol_ink_rvi_complete() {
        local current host candidate
        COMPREPLY=()
        current=${COMP_WORDS[COMP_CWORD]}
        if [ "$COMP_CWORD" -eq 1 ]; then
            while IFS= read -r candidate; do
                COMPREPLY+=("$candidate")
            done < <(compgen -W "$(rvi --complete-hosts 2>/dev/null)" -- "$current")
        elif [ "$COMP_CWORD" -eq 2 ]; then
            host=${COMP_WORDS[1]}
            while IFS= read -r candidate; do
                COMPREPLY+=("$candidate")
            done < <(rvi --complete-path "$host" "${current:-/}" 2>/dev/null)
            compopt -o nospace 2>/dev/null || true
        fi
    }
    complete -F _protocol_ink_rvi_complete rvi
elif [ -n "${ZSH_VERSION:-}" ] && command -v compdef >/dev/null 2>&1; then
    _protocol_ink_rvi_complete() {
        local -a choices
        if (( CURRENT == 2 )); then
            choices=("${(@f)$(rvi --complete-hosts 2>/dev/null)}")
            _describe 'SSH host' choices
        elif (( CURRENT == 3 )); then
            choices=("${(@f)$(rvi --complete-path "${words[2]}" "${words[3]:-/}" 2>/dev/null)}")
            compadd -Q -a choices
        fi
    }
    compdef _protocol_ink_rvi_complete rvi
fi
