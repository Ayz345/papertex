# Round 5 · A2 · LaTeX veteran · Sonnet · port 8852 (about 95 browser actions)

## 1. Coverage
1. Title: done. Triple-clicked the title on the page and typed the new one; the PDF-title metadata in the LaTeX updated by itself.
2. Second author: done. A faint "+ author" button next to the author block gave Author name and Affiliation placeholders; Tab moved between them. The LaTeX shows `\and`.
3. Sentence + equation (4): done, with friction. After clicking into equation (3), the "+" handle at the left margin opened an insert menu. Added a Paragraph and typed the sentence with `$t \to \infty$`, which converted to inline math. Added an Equation block through the "+" menu; the empty paragraphs it left above and below had to be deleted by hand. It came out as equation (4), with x/L as a real fraction (thin-space trick, see problem 1).
4. Live reference "(4)": done. Typed " (4)" before the period, selected it; the floating toolbar's last button opened a cross-reference picker listing equations, tables, figures and sections; chose (4). The source shows `\eqref{eq:4}`. Typing `\ref{` or `\eqref{` in the text was not understood and stayed as literal text.
5. Table: done. Double-clicked "3.91" and typed 3.19. Clicked the last cell, then "+ row", and typed 0.0125 and 0.20.
6. Caption: done. Clicked the end of the caption, replaced the final period with the new text, using `$t=0$`.
7. Discussion: done. Clicked in the LaTeX panel at the end of `\end{figure}` and typed Mira's LaTeX verbatim. The page updated after a pause of about 2 s; the section, the footnote and the bullet list all rendered. `\cite{crank1975}` first showed "??" and the site created an empty reference entry [3]. The email said the Crank reference was already in the .bib, but there was nothing to pick from, so the tester typed the details from Mira's page-2 image.

Existing content intact, checked in the compiled PDF: equations (1)–(3), theorem ("Theorem 1 (Maximum principle).") and proof with the square, table, figure with its image, [1] and [2], the reference list, the "Section 2" reference and the footnote.

## 2. Problems, most severe first
1. Equation editor: `\frac` swallows the preceding group (major, about 6 attempts). `u_s(x) = …` put all of `_s(x)` into the subscript, because Space is what leaves an index. `\frac` after `(T_1-T_0)` made (T1−T0) the numerator with an empty denominator; `x/` grabbed "(T1−T0)x"; the palette fraction button also grabbed the preceding group. Workaround: type `\,` before `x/` so the fraction takes only x, which left a stray `\,` in the source. The hint chip is small and only shows once inside. A LaTeX user typing `\frac{x}{L}` literally would expect it to work.
2. Mouse-wheel scrolling did nothing (probably a tooling artefact); scrolled by dragging scrollbars.
3. Citation with no source data (major): the brief said the reference was in the .bib, but the site created a blank [3] and the details had to be retyped. No bibliography import or search is visibly offered. A Tab sent through the `type` action went into a reference field as a literal tab (the real Tab key moved fields fine).
4. The insert menu left stray empty paragraphs (minor, 2 deletions) above and below an inserted equation.
5. Slash menu not obvious (minor): typed "/equ" and saw no popup in the screenshot, so used the "+" handle instead.
6. The status chip "Page updated · 1 note" is not clickable, so the note was never seen (minor).
7. Cosmetic: the page shows "Theorem 1. Maximum principle The largest…" without parentheses; the PDF is correct.
8. Screenshots failed intermittently (tooling).

## 3. Discoverability
- Finding the paper: "Open the editor" on the home page opened the editor with the paper already loaded.
- Mira's LaTeX: typed straight into the LaTeX panel, after testing in the first minute that the panel is editable. It re-rendered the page after about 2 s: "by far the easiest route".
- Found by exploring: "+ author", the "+" and "⋮" margin handles, the cross-reference picker, the Space-to-leave hints.
- Partly explored: the "LaTeX code" block, the Outline and Document tabs, the unclickable "1 note".
- Never found: any BibTeX import or lookup.

## 4. What worked well
The editable LaTeX panel staying in sync; the cross-reference picker with previews; citing an unknown key creating a reference stub; the PDF in about 9 s with no upload; "+ row" and "+ author".

## 5. Tooling artefacts
Mouse wheel; screenshots timing out; clicks and scrolling inside the embedded PDF viewer blocked (enlarged the viewport to 1280×1700 to see both pages); a typed Tab character inserting a literal tab.

## 6. Final state
About 98%. Page breaks match. Differences: a thin space before x/L in (4); the Crank reference retyped from the page image.

## 7. How it felt
- a. SUS: 3, 3, 3, 2, 4, 2, 3, 2, 3, 3.
- b. Intuitive: 6/10.
- c. Expected a Word-like toy; found a page editor with a live LaTeX pane; the paper was loaded straight away.
- d. Most lost: the equation editor's fractions. Most pleased: the cross-reference picker writing `\eqref`, and Mira's section working first time in the source pane.
- e. Versus Overleaf: better for quick structured edits (tables, authors, references, no compile wait, local PDF); worse for the maths box, which is "almost LaTeX but not quite", the scroll wheel, and having no bibliography import.
- f. Would use it for small papers, mostly in the source pane; would recommend it with caveats to colleagues who dislike LaTeX.
- g. One change: make the equation editor's fractions and subscripts behave like real LaTeX.
