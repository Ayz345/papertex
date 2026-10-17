# Round 5 · D · ordinary user · Haiku · port 8856 (about 200 browser actions)

Summary of the tester's report. As in earlier rounds, the score comes from the archived document, not from this self-report.

## 1. Coverage (as reported)
1. Title: done, by triple-click on the page and typing.
2. Second author: done, with "+ author".
3. Sentence + equation (4): done with friction. Used the "+" handle → Paragraph, typed the sentence with `$…$`, then Ctrl+Enter for a display equation. "/" took the whole "(T_1 − T_0)x" as the numerator. Fixed with Backspace, typing x, Shift+Left, and the palette's Fraction tile. Escape left an extra empty paragraph under (4).
4. Live reference: done with Ctrl+K → "cross" → Reference to an equation… → (4). The first attempt put "(4)" right against "state" with no space; undone, a space typed, and reinserted.
5. Table: done (double-click, "+ row", Tab between cells).
6. Caption: done, with t in inline maths.
7. Discussion: partly. Used a "LaTeX code" block, found through the "+" handle's search, and typed Mira's LaTeX into it verbatim. **The block's placeholder "% raw LaTeX passed straight through" stayed in front of the text, so `\section` was commented out until the tester deleted it.** The line breaks typed in the block looked collapsed after it lost focus. Added Crank with "+ reference": typing put everything in the first field until the fields were found and Tab used. The key was auto-generated as "ref3" and couldn't be edited, so the tester changed `\cite{crank1975}` to `\cite{ref3}`.

## 2. Problems (as reported, most severe first)
- Major: couldn't check the PDF beyond the top half of page 1. The embedded PDF frame ignored clicks, wheel and keys (a harness limit, but "a user could not tell whether the viewer was broken").
- Major: "/" grabs the whole preceding term as the numerator (about 6 attempts).
- Major: reference fields. With no visible hint, typing into the first field stored everything there; the key "ref3" looked editable but wasn't (about 8 attempts).
- Moderate: the LaTeX-code block's placeholder comment silently commented out `\section`; line breaks collapsed.
- Minor: a cross-reference is inserted right after the previous character with no space; Escape after an equation left an empty paragraph; the number of (4) disappeared from a screenshot after Escape.

## 3. Discoverability
Opened the editor from the home page; it loaded the paper directly. Saw the LaTeX pane change live but did not type in it, and "did not find a way to paste Mira's LaTeX into the LaTeX pane". Found the "+" handle, Ctrl+K (guessed), "+ author" and "+ row". Never found how to edit a reference key.

## 7. How it felt
- a. SUS: 3, 3, 3, 4, 3, 4, 3, 4, 2, 4.
- b. Intuitive: 5/10.
- d. Most lost: "/" grabbing the wrong numerator, and the reference fields. Most pleased: the reference picker and editing the caption and title in place.
- f. Would use it for drafts only.
- g. One change: fractions with an explicit numerator (or select, then fraction), and visible, editable reference keys.
