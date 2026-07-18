" Portable clipboard transport for remote Protocol Ink sessions.
" Prefer a machine-native provider. Fall back to Neovim's built-in OSC 52
" provider only when SSH/Zellij would otherwise have no clipboard at all.

if exists('g:loaded_protocol_clipboard')
  finish
endif
let g:loaded_protocol_clipboard = 1

function! s:has_native_clipboard() abort
  if executable('pbcopy')
        \ || executable('win32yank')
        \ || executable('win32yank.exe')
        \ || executable('clip.exe')
        \ || executable('lemonade')
        \ || executable('doitclient')
        \ || executable('termux-clipboard-set')
    return 1
  endif

  if !empty($WAYLAND_DISPLAY)
        \ && (executable('wl-copy') || executable('waycopy'))
    return 1
  endif

  if !empty($DISPLAY) && (executable('xsel') || executable('xclip'))
    return 1
  endif

  if !empty($TMUX) && executable('tmux')
    return 1
  endif

  return 0
endfunction

if has('nvim')
      \ && (exists('$SSH_TTY') || exists('$ZELLIJ'))
      \ && !s:has_native_clipboard()
  let g:clipboard = 'osc52'
endif

delfunction s:has_native_clipboard
