" Protocol Ink — a Protocol Paper colorscheme for Neovim.
" Institutional Manual + Computational Schematic.

set background=dark
highlight clear
if exists('syntax_on')
  syntax reset
endif
let g:colors_name = 'protocol-ink'

" Surfaces and structure
highlight Normal guifg=#E8E1D2 guibg=#171815 gui=NONE cterm=NONE
highlight NormalNC guifg=#D4CDBF guibg=#171815 gui=NONE cterm=NONE
highlight NormalFloat guifg=#E8E1D2 guibg=#20211D gui=NONE cterm=NONE
highlight FloatBorder guifg=#44463F guibg=#20211D gui=NONE cterm=NONE
highlight FloatTitle guifg=#F3F0E7 guibg=#20211D gui=bold cterm=bold
highlight FloatFooter guifg=#8D8F86 guibg=#20211D gui=NONE cterm=NONE
highlight WinSeparator guifg=#44463F guibg=#171815 gui=NONE cterm=NONE
highlight VertSplit guifg=#44463F guibg=#171815 gui=NONE cterm=NONE
highlight Folded guifg=#8D8F86 guibg=#20211D gui=NONE cterm=NONE
highlight FoldColumn guifg=#666960 guibg=#171815 gui=NONE cterm=NONE
highlight SignColumn guifg=#8D8F86 guibg=#171815 gui=NONE cterm=NONE
highlight ColorColumn guibg=#20211D gui=NONE cterm=NONE
highlight CursorLine guibg=#20211D gui=NONE cterm=NONE
highlight CursorColumn guibg=#20211D gui=NONE cterm=NONE
highlight LineNr guifg=#666960 guibg=#171815 gui=NONE cterm=NONE
highlight LineNrAbove guifg=#666960 guibg=#171815 gui=NONE cterm=NONE
highlight LineNrBelow guifg=#666960 guibg=#171815 gui=NONE cterm=NONE
highlight CursorLineNr guifg=#EF5B4C guibg=#20211D gui=bold cterm=bold
highlight Cursor guifg=#171815 guibg=#EF5B4C gui=NONE cterm=NONE
highlight lCursor guifg=#171815 guibg=#EF5B4C gui=NONE cterm=NONE
highlight TermCursor guifg=#171815 guibg=#EF5B4C gui=NONE cterm=NONE
highlight TermCursorNC guifg=#171815 guibg=#666960 gui=NONE cterm=NONE

" Selection and navigation
highlight Visual guifg=#171815 guibg=#E8E1D2 gui=NONE cterm=NONE
highlight VisualNOS guifg=#171815 guibg=#AAA89F gui=NONE cterm=NONE
highlight Search guifg=#F3F0E7 guibg=#31504D gui=NONE cterm=NONE
highlight CurSearch guifg=#171815 guibg=#EF5B4C gui=bold cterm=bold
highlight IncSearch guifg=#171815 guibg=#EF5B4C gui=bold cterm=bold
highlight Substitute guifg=#171815 guibg=#EF5B4C gui=bold cterm=bold
highlight MatchParen guifg=#EF5B4C guibg=#20211D gui=bold,underline cterm=bold,underline
highlight QuickFixLine guifg=#F3F0E7 guibg=#31504D gui=bold cterm=bold
highlight qfLineNr guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight Directory guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight Underlined guifg=#78B8B3 guibg=NONE gui=underline cterm=underline
highlight Italic guifg=NONE guibg=NONE gui=NONE cterm=NONE

" Menus and ledgers
highlight Pmenu guifg=#E8E1D2 guibg=#20211D gui=NONE cterm=NONE
highlight PmenuSel guifg=#F3F0E7 guibg=#31504D gui=bold cterm=bold
highlight PmenuKind guifg=#8D8F86 guibg=#20211D gui=NONE cterm=NONE
highlight PmenuKindSel guifg=#F3F0E7 guibg=#31504D gui=bold cterm=bold
highlight PmenuExtra guifg=#8D8F86 guibg=#20211D gui=NONE cterm=NONE
highlight PmenuExtraSel guifg=#E8E1D2 guibg=#31504D gui=NONE cterm=NONE
highlight PmenuMatch guifg=#78B8B3 guibg=#20211D gui=bold cterm=bold
highlight PmenuMatchSel guifg=#F3F0E7 guibg=#31504D gui=bold,underline cterm=bold,underline
highlight PmenuBorder guifg=#44463F guibg=#20211D gui=NONE cterm=NONE
highlight PmenuSbar guibg=#292A25 gui=NONE cterm=NONE
highlight PmenuThumb guibg=#666960 gui=NONE cterm=NONE
highlight WildMenu guifg=#F3F0E7 guibg=#31504D gui=bold cterm=bold

" Status and classification strips
highlight StatusLine guifg=#E8E1D2 guibg=#20211D gui=NONE cterm=NONE
highlight StatusLineNC guifg=#666960 guibg=#171815 gui=NONE cterm=NONE
highlight TabLine guifg=#8D8F86 guibg=#171815 gui=NONE cterm=NONE
highlight TabLineFill guifg=#44463F guibg=#171815 gui=NONE cterm=NONE
highlight TabLineSel guifg=#F3F0E7 guibg=#31504D gui=bold cterm=bold
highlight WinBar guifg=#E8E1D2 guibg=#171815 gui=bold cterm=bold
highlight WinBarNC guifg=#666960 guibg=#171815 gui=NONE cterm=NONE
highlight ProtocolFolio guifg=#171815 guibg=#EF5B4C gui=bold cterm=bold
highlight ProtocolMeta guifg=#8D8F86 guibg=#20211D gui=NONE cterm=NONE
highlight ProtocolTeal guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight ProtocolCoral guifg=#EF5B4C guibg=NONE gui=bold cterm=bold

" Messages and invisible structure
highlight Title guifg=#F3F0E7 guibg=NONE gui=bold cterm=bold
highlight Conceal guifg=#666960 guibg=NONE gui=NONE cterm=NONE
highlight NonText guifg=#44463F guibg=NONE gui=NONE cterm=NONE
highlight EndOfBuffer guifg=#171815 guibg=#171815 gui=NONE cterm=NONE
highlight Whitespace guifg=#44463F guibg=NONE gui=NONE cterm=NONE
highlight SpecialKey guifg=#44463F guibg=NONE gui=NONE cterm=NONE
highlight MsgArea guifg=#E8E1D2 guibg=#171815 gui=NONE cterm=NONE
highlight ModeMsg guifg=#EF5B4C guibg=NONE gui=bold cterm=bold
highlight MoreMsg guifg=#86AD8B guibg=NONE gui=bold cterm=bold
highlight Question guifg=#78B8B3 guibg=NONE gui=bold cterm=bold
highlight WarningMsg guifg=#C9B76F guibg=NONE gui=bold cterm=bold
highlight ErrorMsg guifg=#EF5B4C guibg=NONE gui=bold cterm=bold

" Diffs and records of change
highlight Added guifg=#86AD8B guibg=NONE gui=NONE cterm=NONE
highlight Changed guifg=#C9B76F guibg=NONE gui=NONE cterm=NONE
highlight Removed guifg=#D85B50 guibg=NONE gui=NONE cterm=NONE
highlight DiffAdd guifg=#9CC7A0 guibg=#213029 gui=NONE cterm=NONE
highlight DiffChange guifg=#E1D08A guibg=#2B2B23 gui=NONE cterm=NONE
highlight DiffDelete guifg=#D85B50 guibg=#31221F gui=NONE cterm=NONE
highlight DiffText guifg=#F3F0E7 guibg=#31504D gui=bold cterm=bold

" Syntax: hierarchy first, hue second
highlight Comment guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight Constant guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight String guifg=#9ACEC9 guibg=NONE gui=NONE cterm=NONE
highlight Character guifg=#9ACEC9 guibg=NONE gui=NONE cterm=NONE
highlight Number guifg=#C8C5BB guibg=NONE gui=NONE cterm=NONE
highlight Boolean guifg=#C8C5BB guibg=NONE gui=bold cterm=bold
highlight Float guifg=#C8C5BB guibg=NONE gui=NONE cterm=NONE
highlight Identifier guifg=#E8E1D2 guibg=NONE gui=NONE cterm=NONE
highlight Function guifg=#F3F0E7 guibg=NONE gui=bold cterm=bold
highlight Statement guifg=#AAA89F guibg=NONE gui=bold cterm=bold
highlight Conditional guifg=#AAA89F guibg=NONE gui=bold cterm=bold
highlight Repeat guifg=#AAA89F guibg=NONE gui=bold cterm=bold
highlight Label guifg=#AAA89F guibg=NONE gui=bold cterm=bold
highlight Operator guifg=#C8C5BB guibg=NONE gui=NONE cterm=NONE
highlight Keyword guifg=#AAA89F guibg=NONE gui=bold cterm=bold
highlight Exception guifg=#D85B50 guibg=NONE gui=bold cterm=bold
highlight PreProc guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight Include guifg=#AAA89F guibg=NONE gui=bold cterm=bold
highlight Define guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight Macro guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight PreCondit guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight Type guifg=#C8C5BB guibg=NONE gui=bold cterm=bold
highlight StorageClass guifg=#C8C5BB guibg=NONE gui=bold cterm=bold
highlight Structure guifg=#C8C5BB guibg=NONE gui=bold cterm=bold
highlight Typedef guifg=#C8C5BB guibg=NONE gui=bold cterm=bold
highlight Special guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight SpecialChar guifg=#9ACEC9 guibg=NONE gui=NONE cterm=NONE
highlight Tag guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight Delimiter guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight SpecialComment guifg=#8D8F86 guibg=NONE gui=bold cterm=bold
highlight Debug guifg=#EF5B4C guibg=NONE gui=bold cterm=bold
highlight Todo guifg=#171815 guibg=#EF5B4C gui=bold cterm=bold
highlight Ignore guifg=#666960 guibg=NONE gui=NONE cterm=NONE
highlight Error guifg=#EF5B4C guibg=NONE gui=bold,underline cterm=bold,underline

" Diagnostics always pair hue with a textual E/W/I/H sign.
highlight DiagnosticError guifg=#EF5B4C guibg=NONE gui=NONE cterm=NONE
highlight DiagnosticWarn guifg=#C9B76F guibg=NONE gui=NONE cterm=NONE
highlight DiagnosticInfo guifg=#78B8B3 guibg=NONE gui=NONE cterm=NONE
highlight DiagnosticHint guifg=#8D8F86 guibg=NONE gui=NONE cterm=NONE
highlight DiagnosticOk guifg=#86AD8B guibg=NONE gui=NONE cterm=NONE
highlight DiagnosticUnderlineError guisp=#EF5B4C gui=undercurl cterm=underline
highlight DiagnosticUnderlineWarn guisp=#C9B76F gui=undercurl cterm=underline
highlight DiagnosticUnderlineInfo guisp=#78B8B3 gui=undercurl cterm=underline
highlight DiagnosticUnderlineHint guisp=#8D8F86 gui=undercurl cterm=underline
highlight DiagnosticUnnecessary guifg=#666960 guibg=NONE gui=NONE cterm=NONE
highlight DiagnosticDeprecated guifg=#8D8F86 guibg=NONE gui=strikethrough cterm=strikethrough
highlight LspReferenceText guibg=#292A25 gui=NONE cterm=NONE
highlight LspReferenceRead guibg=#292A25 gui=NONE cterm=NONE
highlight LspReferenceWrite guibg=#31504D gui=NONE cterm=NONE
highlight LspInlayHint guifg=#666960 guibg=#20211D gui=NONE cterm=NONE

" Spelling marks are editorial, not atmospheric.
highlight SpellBad guisp=#EF5B4C gui=undercurl cterm=underline
highlight SpellCap guisp=#7E9EAE gui=undercurl cterm=underline
highlight SpellLocal guisp=#78B8B3 gui=undercurl cterm=underline
highlight SpellRare guisp=#A98DA0 gui=undercurl cterm=underline

" Treesitter and semantic-token continuity
highlight! link @comment Comment
highlight! link @comment.documentation SpecialComment
highlight! link @comment.todo Todo
highlight! link @constant Constant
highlight! link @constant.builtin Boolean
highlight! link @number Number
highlight! link @number.float Float
highlight! link @string String
highlight! link @string.escape SpecialChar
highlight! link @character Character
highlight! link @boolean Boolean
highlight! link @variable Identifier
highlight! link @variable.builtin Special
highlight! link @variable.parameter Identifier
highlight! link @property Identifier
highlight! link @field Identifier
highlight! link @function Function
highlight! link @function.call Function
highlight! link @function.builtin Function
highlight! link @function.method Function
highlight! link @constructor Type
highlight! link @keyword Statement
highlight! link @keyword.function Keyword
highlight! link @keyword.return Keyword
highlight! link @keyword.exception Exception
highlight! link @operator Operator
highlight! link @type Type
highlight! link @type.builtin Type
highlight! link @attribute PreProc
highlight! link @tag Tag
highlight! link @tag.attribute Identifier
highlight! link @punctuation Delimiter
highlight! link @markup.heading Title
highlight! link @markup.strong Bold
highlight! link @markup.italic Italic
highlight! link @markup.link Underlined
highlight! link @markup.link.url Underlined
highlight! link @markup.raw String
highlight! link @diff.plus Added
highlight! link @diff.delta Changed
highlight! link @diff.minus Removed
highlight! link @lsp.type.variable Identifier
highlight! link @lsp.type.parameter Identifier
highlight! link @lsp.type.property Identifier
highlight! link @lsp.type.function Function
highlight! link @lsp.type.method Function
highlight! link @lsp.type.class Type
highlight! link @lsp.type.struct Type
highlight! link @lsp.type.interface Type
highlight! link @lsp.type.enum Type
highlight! link @lsp.type.keyword Keyword
highlight! link @lsp.type.comment Comment
highlight! link @lsp.type.string String
highlight! link @lsp.type.number Number

" ANSI colors shared with Ghostty.
let g:terminal_color_0 = '#292A25'
let g:terminal_color_1 = '#D85B50'
let g:terminal_color_2 = '#86AD8B'
let g:terminal_color_3 = '#C9B76F'
let g:terminal_color_4 = '#7E9EAE'
let g:terminal_color_5 = '#A98DA0'
let g:terminal_color_6 = '#78B8B3'
let g:terminal_color_7 = '#E8E1D2'
let g:terminal_color_8 = '#666960'
let g:terminal_color_9 = '#EF5B4C'
let g:terminal_color_10 = '#9CC7A0'
let g:terminal_color_11 = '#E1D08A'
let g:terminal_color_12 = '#97B9C8'
let g:terminal_color_13 = '#C4A9BB'
let g:terminal_color_14 = '#9ACEC9'
let g:terminal_color_15 = '#F3F0E7'
