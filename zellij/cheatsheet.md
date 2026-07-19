# ZELLIJ / KEY INDEX

Custom Protocol Ink map.
Prefix keys enter a mode; `Esc` returns to Normal.

---

## 00 / ENTRY POINTS

`Ctrl-o ?`             open this key index
`q`                    close this index
`/`                    search; `n` / `N` moves between matches
`j` / `k`              scroll this index

Keep the work: `Ctrl-o d` detaches.
End the session: `Ctrl-q` quits Zellij.

## 01 / MODE INDEX

`Ctrl-p`  Pane          `Ctrl-t`  Tab
`Ctrl-n`  Resize        `Ctrl-h`  Move
`Ctrl-s`  Scroll/Search `Ctrl-o`  Session
`Ctrl-b`  tmux          `Ctrl-g`  Lock/unlock
`Esc`                  return to Normal from most modes

## 02 / DIRECT ACTIONS

`Alt-h/l / Alt-Left/Right`  horizontal focus; cross edge to tab
`Alt-j/k / Alt-Down/Up`     vertical focus inside the current tab
`Alt-n`                     new pane
`Alt-f`                     show / hide floating panes
`Alt-+/-/=`                 resize
`Alt-[ / Alt-]`             previous / next swap layout
`Alt-i / Alt-o`             move tab left / right
`Alt-p`                     select pane for group operations
`Alt-Shift-p`               toggle group marking
`Ctrl-q`                    quit Zellij and end the session

## 03 / PANE — Ctrl-p

`h/j/k/l / arrows`         focus pane
`p`                        switch focus
`n`                        new pane
`r / d / s`                new pane right / down / stacked
`f`                        fullscreen
`w`                        show / hide floating panes
`e`                        embed or float focused pane
`i`                        pin floating pane
`c`                        rename pane
`z`                        toggle pane frames
`x`                        close pane
`Ctrl-p`                   leave Pane mode

## 04 / TAB — Ctrl-t

`h/k / Left/Up`            previous tab
`j/l / Down/Right`         next tab
`1 … 9`                    jump to tab
`Tab`                      previous / current tab
`n`                        new tab
`r`                        rename tab
`x`                        close tab
`s`                        toggle synchronized input in tab
`b`                        break pane into a new tab
`[ / ]`                    break pane to a tab on the left / right
`Ctrl-t`                   leave Tab mode

## 05 / RESIZE — Ctrl-n

`h/j/k/l / arrows`         increase the selected edge
`H/J/K/L`                  decrease the selected edge
`+ / =`                    increase overall
`-`                        decrease overall
`Ctrl-n`                   leave Resize mode

## 06 / MOVE — Ctrl-h

`h/j/k/l / arrows`         move pane
`n / Tab`                  rotate forward
`p`                        rotate backward
`Ctrl-h`                   leave Move mode

## 07 / SCROLL + SEARCH — Ctrl-s

`j/k / Down/Up`            line down / up
`d / u`                    half-page down / up
`l/h / Right/Left`         page down / up
`Ctrl-f / Ctrl-b`          page down / up
`PageDown / PageUp`        page down / up
`e`                        edit scrollback in Protocol Ink Neovim
`s`, type, `Enter`         enter a query, then switch to Search
`Esc / Ctrl-c`             cancel query entry; return to Scroll
`n / p`                    next / previous match
`c`                        toggle case sensitivity
`o`                        toggle whole-word matching
`w`                        toggle search wrapping
`Ctrl-c`                   bottom + Normal mode
`Ctrl-s`                   leave Scroll / Search mode

## 08 / SESSION — Ctrl-o

`?`                        this key index
`i`                        Pi task ledger; `q` closes it
`w`                        session manager
`l`                        layout manager
`c`                        configuration
`p`                        plugin manager
`a`                        About Zellij
`s`                        web sharing
`d`                        detach and keep the session
`Ctrl-o`                   leave Session mode

## 09 / TMUX COMPATIBILITY — Ctrl-b

`%`                        split right
`"`                        split down
`h/j/k/l / arrows`         focus pane, then return to Normal
`c`                        new tab
`,`                        rename tab
`n / p`                    next / previous tab
`o`                        next pane
`[`                        Scroll mode
`z`                        fullscreen
`Space`                    next swap layout
`d`                        detach
`x`                        close pane
`Ctrl-b`                   send literal Ctrl-b
