# Protocol Ink / GNU shell color adapter
# Uses the terminal's ANSI palette so file semantics stay portable.

protocol_ink_config_home=${XDG_CONFIG_HOME:-"$HOME/.config"}
protocol_ink_dircolors="$protocol_ink_config_home/protocol-ink/dircolors"

if command -v dircolors >/dev/null 2>&1 && [ -r "$protocol_ink_dircolors" ]; then
    eval "$(dircolors -b "$protocol_ink_dircolors")"
fi

if command ls --color=auto -d . >/dev/null 2>&1; then
    alias ls='ls --color=auto'
fi

unset protocol_ink_config_home protocol_ink_dircolors
