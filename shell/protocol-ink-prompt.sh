# Protocol Ink / Manual-Index shell prompt
# Real record fields only: history index, cwd, Git state, and failing exit code.

_protocol_ink_read_git() {
    _protocol_ink_git_branch=''
    _protocol_ink_git_dirty=''

    local inside_worktree branch status_line
    inside_worktree=$(command git rev-parse --is-inside-work-tree 2>/dev/null) || return 0
    [ "$inside_worktree" = true ] || return 0

    branch=$(command git symbolic-ref --quiet --short HEAD 2>/dev/null) || \
        branch=$(command git rev-parse --short HEAD 2>/dev/null) || return 0

    # Keep branch metadata literal when it becomes part of PS1/PROMPT.
    branch=$(printf '%s' "$branch" | command tr -c '[:alnum:]_./-' '?')
    status_line=$(GIT_OPTIONAL_LOCKS=0 command git status --porcelain --untracked-files=normal 2>/dev/null | command sed -n '1p')

    _protocol_ink_git_branch=$branch
    [ -n "$status_line" ] && _protocol_ink_git_dirty='*'
}

_protocol_ink_install_zsh_prompt() {
    _protocol_ink_zsh_precmd() {
        local last_status=$?
        local muted rule paper teal coral reset git_record status_record

        muted=$'%{\e[38;2;126;158;174m%}'
        rule=$'%{\e[38;2;102;105;96m%}'
        paper=$'%{\e[38;2;232;225;210m%}'
        teal=$'%{\e[38;2;120;184;179m%}'
        coral=$'%{\e[38;2;239;91;76m%}'
        reset=$'%{\e[0m%}'

        _protocol_ink_read_git
        git_record=''
        status_record=''

        if [ -n "$_protocol_ink_git_branch" ]; then
            git_record="${rule} / ${teal}git:${_protocol_ink_git_branch}"
            [ -n "$_protocol_ink_git_dirty" ] && git_record="${git_record}${coral}*"
        fi
        if [ "$last_status" -ne 0 ]; then
            status_record="${rule} / ${coral}exit:${last_status}"
        fi

        PROMPT="${muted}%h${rule} / ${paper}%~${git_record}${status_record}${reset}"$'\n'"${paper}%(!.#.$)${reset} "
        RPROMPT=''
    }

    autoload -Uz add-zsh-hook
    add-zsh-hook -d precmd _protocol_ink_zsh_precmd 2>/dev/null
    add-zsh-hook precmd _protocol_ink_zsh_precmd
}

_protocol_ink_install_bash_prompt() {
    _protocol_ink_bash_precmd() {
        local last_status=$?
        local muted rule paper teal coral reset git_record status_record

        muted='\[\e[38;2;126;158;174m\]'
        rule='\[\e[38;2;102;105;96m\]'
        paper='\[\e[38;2;232;225;210m\]'
        teal='\[\e[38;2;120;184;179m\]'
        coral='\[\e[38;2;239;91;76m\]'
        reset='\[\e[0m\]'

        _protocol_ink_read_git
        git_record=''
        status_record=''

        if [ -n "$_protocol_ink_git_branch" ]; then
            git_record="${rule} / ${teal}git:${_protocol_ink_git_branch}"
            [ -n "$_protocol_ink_git_dirty" ] && git_record="${git_record}${coral}*"
        fi
        if [ "$last_status" -ne 0 ]; then
            status_record="${rule} / ${coral}exit:${last_status}"
        fi

        PS1="${muted}\\!${rule} / ${paper}\\w${git_record}${status_record}${reset}"$'\n'"${paper}"'\$'"${reset} "
        return "$last_status"
    }

    local prompt_command_declaration hook_found hook
    prompt_command_declaration=$(declare -p PROMPT_COMMAND 2>/dev/null || true)
    case $prompt_command_declaration in
        'declare -a '*|'declare -ax '*)
            hook_found=0
            for hook in "${PROMPT_COMMAND[@]}"; do
                [ "$hook" = _protocol_ink_bash_precmd ] && hook_found=1
            done
            if [ "$hook_found" -eq 0 ]; then
                PROMPT_COMMAND=(_protocol_ink_bash_precmd "${PROMPT_COMMAND[@]}")
            fi
            ;;
        *)
            case ";${PROMPT_COMMAND:-};" in
                *';_protocol_ink_bash_precmd;'*) ;;
                *) PROMPT_COMMAND="_protocol_ink_bash_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
            esac
            ;;
    esac
}

case $- in
    *i*)
        if [ "${TERM:-}" != dumb ]; then
            if [ -n "${ZSH_VERSION:-}" ]; then
                _protocol_ink_install_zsh_prompt
            elif [ -n "${BASH_VERSION:-}" ]; then
                _protocol_ink_install_bash_prompt
            fi
        fi
        ;;
esac
