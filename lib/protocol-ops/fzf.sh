# Shared Protocol Ink fzf shell and responsive geometry.

if [[ ${OPS_FZF_LOADED:-0} == 1 ]]; then
    return 0
fi
OPS_FZF_LOADED=1

ops_terminal_geometry() {
    OPS_COLUMNS=${COLUMNS:-}
    OPS_LINES=${LINES:-}
    if [[ ! $OPS_COLUMNS =~ ^[0-9]+$ ]]; then
        OPS_COLUMNS=$(tput cols 2>/dev/null || true)
    fi
    if [[ ! $OPS_LINES =~ ^[0-9]+$ ]]; then
        OPS_LINES=$(tput lines 2>/dev/null || true)
    fi
    [[ $OPS_COLUMNS =~ ^[0-9]+$ ]] || OPS_COLUMNS=120
    [[ $OPS_LINES =~ ^[0-9]+$ ]] || OPS_LINES=30
    OPS_COLUMNS=$((10#$OPS_COLUMNS))
    OPS_LINES=$((10#$OPS_LINES))
}

ops_fzf_base() {
    local border_label record_count chrome max_height
    border_label=$1
    record_count=$2
    chrome=${3:-7}
    ops_terminal_geometry

    if (( OPS_LINES < 18 )); then
        OPS_PICKER_HEIGHT='100%'
    else
        max_height=$((OPS_LINES * 80 / 100))
        (( max_height >= 15 )) || max_height=15
        OPS_PICKER_HEIGHT=$((record_count + chrome))
        (( OPS_PICKER_HEIGHT >= 15 )) || OPS_PICKER_HEIGHT=15
        (( OPS_PICKER_HEIGHT <= max_height )) || OPS_PICKER_HEIGHT=$max_height
    fi

    OPS_PREVIEW_WINDOW='down,45%,hidden,border-sharp'
    if (( OPS_COLUMNS >= 110 && OPS_LINES >= 18 )); then
        OPS_PREVIEW_WINDOW='right,42%,border-sharp'
    fi

    OPS_FZF_COLORS="fg:${OPS_FG},bg:${OPS_BG},hl:${OPS_TEAL}"
    OPS_FZF_COLORS="${OPS_FZF_COLORS},fg+:${OPS_PAPER},bg+:${OPS_TEAL_DARK},hl+:${OPS_PAPER}"
    OPS_FZF_COLORS="${OPS_FZF_COLORS},info:${OPS_META},prompt:${OPS_TEAL},pointer:${OPS_CORAL}"
    OPS_FZF_COLORS="${OPS_FZF_COLORS},marker:${OPS_CORAL},spinner:${OPS_TEAL},header:${OPS_META}"
    OPS_FZF_COLORS="${OPS_FZF_COLORS},border:${OPS_RULE},label:${OPS_META},query:${OPS_FG}"
    OPS_FZF_COLORS="${OPS_FZF_COLORS},gutter:${OPS_BG},preview-bg:${OPS_BG},preview-border:${OPS_RULE}"
    OPS_FZF_COLORS="${OPS_FZF_COLORS},preview-label:${OPS_TEAL},preview-fg:${OPS_FG}"

    OPS_FZF_BASE=(
        "--height=$OPS_PICKER_HEIGHT"
        '--layout=reverse'
        '--border=sharp'
        "--border-label= $border_label "
        '--border-label-pos=2'
        '--no-multi'
        '--info=inline-right'
        '--pointer=›'
        '--marker=•'
        "--color=$OPS_FZF_COLORS"
    )
}
