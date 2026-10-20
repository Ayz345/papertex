# Round 5 · B2 · Word user · Fable · port 8854 (about 120 browser actions, plus about 20 waiting for a free tab)

## 1. Coverage
1. Title: done (triple-click the line, type; the LaTeX pane updated live).
2. Second author: done. A faint "+ author" appears next to Mira's name once you click into the title area.
3. Sentence + (4): done, the hardest item (about 12 attempts). Clicking beside (3) landed inside it; Right then Esc gave a fresh paragraph with the hint 'Type "/" for blocks, "$" for a formula'. "As ", "$", "t", → from the Arrows palette tab, ∞ from Operators (had to hunt), Esc, the rest; Enter, "/" → Equation. Underscores gave subscripts (Right leaves them). Fraction: see problem 1.
4. Live "(4)": done, learned from the Shortcuts help: Ctrl+K → "Reference to an equation…" → picked (4).
5. Table: done (double-click 3.91, type; "+ row" under the table; Tab across).
6. Caption: done (" at ", "$t=0", Esc, the rest).
7. Discussion: done, but not as Mira intended. **Pasting Mira's LaTeX never worked** (see section 5). Rebuilt by hand: "/" Section; the paragraph with "$Delta x^2"; Ctrl+K "Cite a work": **Crank was not in the list**, so "+ New work…" (the first mouse click on it just closed the palette; Enter worked), fields filled with Tab; Ctrl+K Footnote; "/" Bulleted list.

Pre-existing content intact, checked on the page and in the PDF.

## 2. Problems, most severe first
1. Fraction grabs the wrong numerator (major, about 8 attempts). With the caret after ")", the Fraction button wrapped all of "(T_1 − T_0)"; typing "x/L" made "(T_1−T_0)x" over L. Workaround: insert the fraction right after "+", then Left ×5 to get in front of it and type the bracket. Backspace on an empty "()" removed only ")", leaving an open bracket that swallowed the fraction; had to clear the equation and retype.
2. A stray invisible "u" after clearing an equation gave "uu_s" (minor, found only through page text).
3. Crank missing from the citation picker (major for the task); new key "ref3".
4. Entering and leaving equations is unguessable at first (major, 3–4 attempts): clicking beside an equation goes inside it; Enter there adds an equation line; Esc to get out is only in the small hint that shows once inside.
5. "+ author" nearly invisible (minor).
6. ∞ is under "Operators", not "Misc" or "Sets & logic"; the palette has no search box (minor).
7. No right-click menu anywhere on the page (minor; a Word user expects Copy/Paste there).
8. Esc from an equation always creates an empty paragraph (cosmetic).
9. The PDF viewer stopped scrolling (maybe the harness).
10. The home page hero is blank until you scroll (cosmetic; maybe the harness).

## 3. Discoverability
Found the paper under "Continue where you left off" after scrolling. Tried copy from the email + Ctrl+V on an empty paragraph, as the help promises; nothing happened. Knew the LaTeX pane was editable (from the help) but didn't use it: "I don't know LaTeX and the page tools covered everything". Found only through the "? Shortcuts" help: Ctrl+K (reference, cite, footnote), Enter vs Esc in equations, Greek names, ^ and _, Space through a fraction. Unclear words: "LaTeX", ".tex", "Copy LaTeX", "Download .tex", "Compile"/"typeset", "blocks".

## 5. Tooling artefacts (as reported)
Tab cap: tabs_create failed about 10 times; one tab used for email and site. **Clipboard: Ctrl+C in the email then Ctrl+V in the editor did nothing; even copying a word within the editor and pasting it did nothing.** The PDF viewer took no clicks and stopped scrolling.

## 6. Final state
About 97%. Both PDF pages match Mira's; the only deviation is the key "ref3" (invisible in the PDF).

## 7. How it felt
- a. SUS: 4, 2, 3, 2, 4, 2, 3, 2, 3, 3.
- b. Intuitive: 6/10.
- c. Expected a Word-like toolbar; found a bare page with a symbol strip on the left and "a wall of code on the right that I ignored". Clicking text and typing just worked.
- d. Most lost: the fraction "eating my bracket". Most pleased: Ctrl+K → reference → "(4)" as a link, and the PDF looking exactly like Mira's.
- e. Worse than Word for the first ten minutes (hidden keyboard rules, no right-click); better once learned (numbering and references take care of themselves).
- f. Would use it again and recommend it, "read the Shortcuts page first".
- g. One change: the fraction button should insert an empty fraction at the cursor instead of silently swallowing what is to its left.
