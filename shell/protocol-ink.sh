# Protocol Ink / GNU shell color adapter
# Uses the terminal's ANSI palette so file semantics stay portable.

protocol_ink_config_home=${XDG_CONFIG_HOME:-"$HOME/.config"}
protocol_ink_dircolors="$protocol_ink_config_home/protocol-ink/dircolors"
protocol_ink_less="$protocol_ink_config_home/protocol-ink/less.sh"
protocol_ink_prompt="$protocol_ink_config_home/protocol-ink/prompt.sh"
protocol_ink_completion="$protocol_ink_config_home/protocol-ink/completion.sh"
protocol_ink_local_bin="$HOME/.local/bin"

case ":$PATH:" in
    *":$protocol_ink_local_bin:"*) ;;
    *) PATH="$protocol_ink_local_bin:$PATH" ;;
esac
export PATH

if command -v dircolors >/dev/null 2>&1 && [ -r "$protocol_ink_dircolors" ]; then
    eval "$(dircolors -b "$protocol_ink_dircolors")"
fi

if command ls --color=auto -d . >/dev/null 2>&1; then
    alias ls='ls --color=auto'
fi

if [ -r "$protocol_ink_less" ]; then
    . "$protocol_ink_less"
fi

if [ -r "$protocol_ink_completion" ]; then
    . "$protocol_ink_completion"
fi

if [ "${PROTOCOL_INK_PROMPT:-1}" != 0 ] && [ -r "$protocol_ink_prompt" ]; then
    . "$protocol_ink_prompt"
fi

unset protocol_ink_config_home protocol_ink_dircolors protocol_ink_less
unset protocol_ink_prompt protocol_ink_completion protocol_ink_local_bin
