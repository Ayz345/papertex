# Round 5 · C · keyboard-first · Sonnet · port 8855 (about 150 browser actions, one tab)

## 1. Coverage
1. Title: done. Click into the title, Ctrl+A (selects only the title), type.
2. Second author: done after one failed try (see problem 4).
3. Sentence + (4): done. Click into (3), Esc gives a new paragraph below; `As $t->inf`, Space (→ ∞), Esc, the rest; Ctrl+Enter gave a display equation numbered (4). Fraction workarounds needed (problem 2). Esc after the equation left an empty paragraph; Backspace removed it cleanly.
4. Live "(4)": done. Caret before the full stop, Ctrl+K "reference", Down×3, Enter. The inserted reference brings its own parentheses, so a typed "(" gave "((4)"; fixed.
5. Table: done. End, Shift+Home, type; Tab in the last cell creates a row.
6. Caption: done, `at $t=0`, Esc, the rest.
7. Discussion: done on the page. "+" under the figure → Section; the paragraph with `$Delta ` and `x^2`; citation via "+ New work…" (problem 3); footnote via Ctrl+K "footnote"; list via "/" → "bullet"; "Crank--Nicolson" with two hyphens came out right in the PDF.

Everything already there is intact, including "(Maximum principle)" and the □ in the PDF.

## 2. Problems, most severe first
1. **Renaming a reference key breaks its citation (major, possible output loss).** Edited [3]'s key field from `ref3` to `crank1975`. The page still showed [3], but the LaTeX had `\bibitem{crank1975}` and `\cite{ref3}`, which gives "[?]" in the PDF. The field is labelled "the name citations use", and the remove button says it removes "its citations in the text", so a rename was expected to carry through. Repaired in the LaTeX pane: the first attempt produced `\crank1975{ref3}`, and while it was broken the page briefly grew a phantom empty reference and "??"; Ctrl+Z in the pane undid it. About 3 attempts.
2. **A fraction takes everything typed before the slash (major).** `…+(T1-T0)x/L` gave numerator `(T1−T0)x`; a Space before `x/L` made no difference. Workaround: type `…+x/L`, Space, Left ×4, then `(T1-T0)`. It was hard to tell which box the caret was in after Left. Ctrl+Z removed the whole formula in one step.
3. **Crank not in the site (major).** The cite picker listed only Carslaw and Smith; "+ New work…" gave the key `ref3`, which led to problem 1. Clicking "+ New work…" with the mouse once just closed the palette; the keyboard (Down×2, Enter) worked.
4. **Typing lost after "+ author" (major, first try).** "+ author" adds the fields but doesn't focus them. "Sam Rivera", Tab, the affiliation: the name was lost and the affiliation went to the start of the title. Ctrl+Z undid it in one step.
5. `$` sometimes didn't open a formula when typed inside one long `type` call ("$Delta t" stayed literal); typed in pieces it worked. Possibly the harness's typing speed.
6. Typing `/bullet` fast did not open the slash menu; "/" alone did, after a delay (about 3 tries).
7. The reference picker brings its own parentheses ("((4)" if you typed "("), and inserting left double spaces ("state  (4)", "Crank--Nicolson  [3]").
8. Esc out of a formula leaves stray empty paragraphs.
9. "+ author" is very faint until hover.
10. Mouse-wheel scrolling unreliable (likely the harness); the Outline tab jumps fine.

## 3. Discoverability
Opened the editor from the home page, paper loaded. Retyped Mira's LaTeX with the page's own tools; never pasted. Noticed the editable LaTeX pane at once and used it only to repair the citation key ("the page followed in about 2 seconds, which was great"). Found by accident: Ctrl+A in the title, Tab adding table rows, Ctrl+Z reverting a formula, the "⋮" menu (move, duplicate, delete). Never opened the "?" Shortcuts help. Missing: a clear way out of a fraction, a way to stop the fraction taking the numerator.

## 6. Final state
About 97%. Both pages match; (4) and [3] resolve; the table and caption are right. Saw both PDF pages by resizing the tab to 1280×2800.

## 7. How it felt
- a. SUS: 4, 2, 4, 2, 4, 3, 3, 2, 3, 3.
- b. Intuitive: 7/10.
- d. Most lost: the fraction, and the key rename leaving page and LaTeX out of sync. Most pleased: the reference picker with previews; the page following an edit in the LaTeX pane.
- e. Versus Overleaf / VS Code: better for quick prose and formulas; worse for exact control (fractions, keys, spacing).
- f. Yes, for short papers and notes, with a warning about citation keys.
- g. One change: renaming a reference key should update every `\cite` that uses it.
