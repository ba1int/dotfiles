# Protocol Ink / semantic less and man styling
# No arbitrary log coloring: only emphasis, underline, and standout records.

if command -v less >/dev/null 2>&1 \
    && [ "${PROTOCOL_INK_PAGER:-1}" != 0 ] \
    && [ "${TERM:-dumb}" != dumb ] \
    && [ -z "${NO_COLOR+x}" ]; then
    _protocol_ink_escape=$(printf '\033')

    LESS_TERMCAP_mb="${_protocol_ink_escape}[1;38;2;239;91;76m"
    LESS_TERMCAP_md="${_protocol_ink_escape}[1;38;2;243;240;231m"
    LESS_TERMCAP_me="${_protocol_ink_escape}[0m"
    LESS_TERMCAP_mh="${_protocol_ink_escape}[38;2;141;143;134m"
    LESS_TERMCAP_mr="${_protocol_ink_escape}[38;2;243;240;231;48;2;49;80;77m"
    LESS_TERMCAP_so="${_protocol_ink_escape}[1;38;2;243;240;231;48;2;49;80;77m"
    LESS_TERMCAP_se="${_protocol_ink_escape}[0m"
    LESS_TERMCAP_us="${_protocol_ink_escape}[4;38;2;120;184;179m"
    LESS_TERMCAP_ue="${_protocol_ink_escape}[0m"
    export LESS_TERMCAP_mb LESS_TERMCAP_md LESS_TERMCAP_me LESS_TERMCAP_mh
    export LESS_TERMCAP_mr LESS_TERMCAP_so LESS_TERMCAP_se
    export LESS_TERMCAP_us LESS_TERMCAP_ue

    if [ -z "${MANPAGER+x}" ]; then
        MANPAGER='less -R'
        export MANPAGER
    fi

    unset _protocol_ink_escape
fi
