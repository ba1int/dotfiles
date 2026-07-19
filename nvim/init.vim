let g:protocol_ink_nvim = 1
let g:netrw_silent = 1

let s:protocol_nvim_dir = fnamemodify(resolve(expand('<sfile>:p')), ':h')
let s:protocol_clipboard = s:protocol_nvim_dir . '/protocol-clipboard.vim'
if filereadable(s:protocol_clipboard)
  execute 'source ' . fnameescape(s:protocol_clipboard)
endif

set runtimepath^=~/.vim
set runtimepath+=~/.vim/after
let &packpath = &runtimepath
packloadall

let s:shared_vimrc = get(g:, 'protocol_shared_vimrc', expand('~/.vimrc'))
execute 'source ' . fnameescape(s:shared_vimrc)

" Protocol Paper / technical-dense instrument mode.
set background=dark
set laststatus=3
if exists('+winborder')
  set winborder=single
endif
if exists('+pumborder')
  set pumborder=single
endif
set pumblend=0
set winblend=0
set cursorlineopt=number,line
set guicursor=n-v-c:block,i-ci-ve:ver25,r-cr:hor20,o:hor50
set fillchars=vert:│,horiz:─,horizup:┴,horizdown:┬,vertleft:┤,vertright:├,verthoriz:┼,fold:·,eob:\ 
set listchars=tab:│\ ,trail:·,extends:>,precedes:<,nbsp:+

colorscheme protocol-ink

function! ProtocolStatusFlags() abort
  let l:flags = []
  if &modified
    call add(l:flags, 'MOD')
  endif
  if &readonly
    call add(l:flags, 'RO')
  endif
  if !&modifiable
    call add(l:flags, 'LOCK')
  endif
  return empty(l:flags) ? '' : '  ' . join(l:flags, ' ')
endfunction

function! ProtocolStatusEncoding() abort
  return empty(&fileencoding) ? &encoding : &fileencoding
endfunction

set noshowmode
set statusline=%#ProtocolFolio#\ %{toupper(mode(1))}\ %n\ 
set statusline+=%#StatusLine#│\ %f%{ProtocolStatusFlags()}%=
set statusline+=%#ProtocolMeta#\ %Y\ │\ %{ProtocolStatusEncoding()}\ │\ %l:%c\ %P\ 

let g:fzf_layout = {
      \ 'window': {
      \   'width': 0.92,
      \   'height': 0.82,
      \   'border': 'sharp'
      \ }
      \ }

let g:fzf_colors = {
      \ 'fg':      ['fg', 'Normal'],
      \ 'bg':      ['bg', 'Normal'],
      \ 'hl':      ['fg', 'ProtocolTeal'],
      \ 'fg+':     ['fg', 'CursorLine'],
      \ 'bg+':     ['bg', 'CursorLine'],
      \ 'hl+':     ['fg', 'ProtocolCoral'],
      \ 'info':    ['fg', 'ProtocolMeta'],
      \ 'border':  ['fg', 'WinSeparator'],
      \ 'prompt':  ['fg', 'Normal'],
      \ 'pointer': ['fg', 'ProtocolCoral'],
      \ 'marker':  ['fg', 'ProtocolTeal'],
      \ 'spinner': ['fg', 'ProtocolTeal'],
      \ 'header':  ['fg', 'Comment']
      \ }

let $FZF_DEFAULT_OPTS = '--layout=reverse --border=sharp --info=inline --prompt="FIND / " --pointer=">" --marker="+"'

lua << EOF
vim.diagnostic.config({
  severity_sort = true,
  signs = {
    text = {
      [vim.diagnostic.severity.ERROR] = "E",
      [vim.diagnostic.severity.WARN] = "W",
      [vim.diagnostic.severity.INFO] = "I",
      [vim.diagnostic.severity.HINT] = "H",
    },
  },
  underline = true,
  virtual_text = {
    current_line = true,
    source = "if_many",
    spacing = 2,
    prefix = "·",
  },
  float = {
    border = "single",
    header = "",
    prefix = "",
    source = "if_many",
  },
})
EOF

command! ProtocolInk colorscheme protocol-ink
