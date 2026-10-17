# Round 5 · A · LaTeX veteran · Opus · port 8851 (about 100 browser actions)

Almost everything was done by typing LaTeX into the LaTeX pane beside the page.

## 1. Coverage
1. Title: done, in the LaTeX pane. The first selection missed the "A" ("AHeat…"); fixed with a double-click and retype. The page and `pdftitle` updated.
2. Second author: done, by adding ` \and Sam Rivera\\ \small Department of Mathematics, Lakeside University` inside `\author{}`. The page showed two authors side by side at once. The "+ author" button on the page was never used.
3. Sentence + equation (4): done. After `\end{align}` typed the sentence and `\begin{equation} u_s(x) = T_0 + (T_1 - T_0)\frac{x}{L}. \label{eq:steady} \end{equation}`. It rendered as (4) with a proper fraction.
4. Live "(4)": done, with `~\eqref{eq:steady}`; the page shows "(4)" in link colour.
5. Table: done in the source (3.91 → 3.19, new row before `\bottomrule`).
6. Caption: done in the source.
7. Discussion: done, partly by hand. Mira's block typed into the source exactly; the section, the en dash, the footnote and the list all came through. `\cite{crank1975}` showed "??" and a blank reference stub appeared. Mira said Crank was "already in our .bib", but no .bib existed anywhere the tester could find; the stub's fields were filled in by hand.

Existing content intact: (1)–(3), theorem and proof (its reference to (1) still works), table, figure with its image, [1] [2], reference list.

## 2. Problems, most severe first
1. The Crank entry from the .bib was missing (major). Searched Commands for "bib", the Open menu and the Document tab: no .bib anywhere. "A user who didn't spot the faint grey stub would ship '??'." About 4 attempts at searching.
2. The theorem name shows no parentheses on the page (cosmetic): "Theorem 1. Maximum principle The largest…"; the target has "(Maximum principle).".
3. The source pane reformats code on leaving it (minor): line breaks reflowed, `$\Delta x^2$` → `$\Delta x^{2}$`, `$r > 0$` → `$r>0$`, `Crank--Nicolson\n\cite` → `Crank--Nicolson~\cite`. "A LaTeX person notices their source being rewritten."
4. A double-click in the source selects the trailing space too (minor).
5. "Page updated · 1 note": clicked and hovered, never found what the note was (minor).
6. Spell-check squiggles on reference fields (cosmetic).
7. The side-pane tab highlight once stayed on "Document" while LaTeX showed (cosmetic, unsure).

## 3. Discoverability
- Finding the paper: "Continue where you left off" on the home page, one click.
- Mira's section: typed straight into the LaTeX pane ("Editing — the page follows when you pause"); the page re-rendered within about a second. Used the source for every task: "the first thing I tried, and it worked".
- Never found: where the .bib went, and what the "1 note" was.

## 4. What worked well
Editable source both ways; `\and`, `\frac`, `\label`/`\eqref`, `\footnote`, itemize, `--` and `\cite` all understood at once; live numbering and references; Computer Modern on the page; Make PDF in 4.9 s.

## 5. Tooling artefacts
Screenshots timing out about 8 times; mouse wheel doing nothing; in the PDF dialog only thumbnails drew, so the PDF could only be checked at thumbnail size.

## 6. Final state
About 95%. Two pages, laid out like the target. Differences: the theorem-name parentheses on screen; the Crank entry typed by hand.

## 7. How it felt
- a. SUS: 4, 2, 4, 1, 3, 2, 3, 2, 4, 2.
- b. Intuitive: 7/10.
- c. Expected a WYSIWYG toy that would fight LaTeX; found an editable source pane beside the page, "which made me relax".
- d. Most lost: the "??" for crank1975, hunting for a .bib that was never imported. Most pleased: `\and Sam Rivera…` giving two authors at once, and `\eqref` giving a live (4).
- e. Versus Overleaf: faster feedback, the visual page is nice for checking; but it rewrites source formatting and lost the .bib, "which Overleaf would never do".
- f. Would use it again for a short paper; would recommend it to co-authors who don't know LaTeX, once bibliography import is fixed.
- g. One change: keep the whole imported .bib so `\cite` of an existing key just works, and keep source formatting as written.
