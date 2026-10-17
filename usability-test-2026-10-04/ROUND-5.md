# Round 5: continuing a paper that came from Overleaf

**17 October 2026.** Six testers on four models finished a co-author's paper that had been opened in PaperTeX from an Overleaf project. Method, prompts and handout: [round5/PROMPTS.md](round5/PROMPTS.md). Scoring sheet: [round5/SCORING.md](round5/SCORING.md). Every final document (`.json`, `.tex`, compiled PDF) and every tester's report: [round5/results/](round5/results/).

## Summary

- **Task success is near-perfect.** All five strong-model testers finished all seven of Mira's items, and nothing that came from Overleaf broke: 18/18 each. Haiku scored 16.5/18; two of its 1.5 lost points come from PaperTeX bugs (the LaTeX-code block below), not from the tester.
- **It feels better than round 4.** The simulated SUS for the strong models rose from about 52 to **62.5**, and intuitiveness from 5.5 to **6.4/10**. The testers who knew LaTeX were the happiest: the editable LaTeX pane is what they reached for first, and "it worked".
- **Two problems hit almost everyone:**
  1. The `.bib` entry Mira said was "already in our .bib" wasn't there. On import, PaperTeX kept only the works the paper already cited (4 of 6 testers; every tester had to retype Crank).
  2. A fraction takes everything before it as the numerator (5 of 6). `(T₁−T₀)x/L` became one big fraction, and so did the Fraction button and a typed `\frac`.
- **New bugs that change output:** renaming a reference's key doesn't update its citations; a new "LaTeX code" block starts with a real comment line that comments out what you type first, and it loses your line breaks.

## Results

### Task success (18 items)

| Tester | Persona | Model | Score | How Mira's LaTeX section got in |
|---|---|---|---|---|
| A | LaTeX veteran | Opus | **18** | typed into the LaTeX pane (A did everything there) |
| A2 | LaTeX veteran | Sonnet | **18** | typed into the LaTeX pane |
| B | Word user | Sonnet | **18** | rebuilt on the page with blocks (pasting failed: harness) |
| B2 | Word user | Fable | **18** | rebuilt on the page with blocks (pasting failed: harness) |
| C | keyboard-first | Sonnet | **18** | rebuilt on the page with blocks |
| D | ordinary | Haiku | **16.5** | typed into a "LaTeX code" block |

Every document compiles. D lost half a point each for:
- `u_{s(x)}`: the "(x)" went into the subscript;
- the Discussion text, which the LaTeX-code block printed as "Δx²,which" and "Crank–Nicolson[3]" (a PaperTeX bug, below);
- "J. C. Crank" in the reference list.

### How it felt

**SUS:** odd items score their rating minus 1, even items 5 minus the rating, and the sum × 2.5 gives 0–100. As in round 4, these are AI testers answering in character: a direction, not a benchmark.

| | A | A2 | B | B2 | C | D | strong-model mean | round 4 |
|---|---|---|---|---|---|---|---|---|
| SUS | 72.5 | 60 | 50 | 65 | 65 | 37.5 | **62.5** | ≈52 |
| Intuitive (1–10) | 7 | 6 | 6 | 6 | 7 | 5 | **6.4** | 5.5 |

In their own words:
- **A, LaTeX veteran:** "I expected a WYSIWYG toy that would fight my LaTeX… a real source pane next to the page that I could edit, which made me relax."
- **B2, Word user:** "worse for the first ten minutes (hidden keyboard rules, no right-click), better once learned — numbering and references take care of themselves, which Word never does for me."
- **Most pleased (all six):** the reference picker with equation previews, and a live "(4)".
- **Most lost:** the fraction (5 of 6), and the missing .bib entry (A).

### The new features

- **Opening the paper:** everyone found it at once, either under "Continue where you left off" or through "Open the editor", which reopens the last document.
- **The editable LaTeX pane:** all six noticed it. Both LaTeX veterans used it for real work: A for everything, A2 for Mira's section, after checking in the first minute that it was editable. C used it once, to repair a broken citation key. The Word users left it alone ("a wall of code on the right that I ignored"), which is fine.
- **Pasting LaTeX onto the page:** could not be tested. On Ctrl+V the test browser never fires a paste event, which the organiser confirmed. The feature itself was tested by script the same day.

## Problems, most severe first

| # | Problem | Who | Severity |
|---|---|---|---|
| 1 | **Uncited `.bib` entries are dropped on import.** Citing one later gives "??" and an empty entry; the cite picker doesn't offer it either. | A, A2, B, B2, C (+D) | major |
| 2 | **A fraction takes everything before it as the numerator.** `/` after `(T₁−T₀)x` takes all of it; the Fraction button and a typed `\frac` take the preceding bracket. Workarounds found: a thin space first, or building the fraction first and typing in front of it. | A2, B, B2, C, D | major |
| 3 | **Renaming a reference key doesn't update its `\cite`s.** The page keeps showing [3], but the PDF would say [?]. | C | major (wrong output) |
| 4 | **A new "LaTeX code" block's placeholder is real text.** "% raw LaTeX passed straight through" stays in front of what you type and comments out your first line. | D | major (wrong output) |
| 5 | **The LaTeX-code block loses its line breaks.** "…$\Delta x^2$,⏎which" prints "Δx²,which"; a `%` comment would swallow the rest. | D | major (wrong output) |
| 6 | **"+ author" doesn't focus the new field.** Typing goes to the start of the title. The button is also very faint. | C, B2, B | major (first try) |
| 7 | Clicking "+ New work…" in the cite picker with the mouse closes the palette and adds nothing (Enter works). | C, B2 | minor |
| 8 | Esc from a display equation always adds an empty paragraph, leaving stray blocks. | B, B2, C, D, A2 | minor |
| 9 | Getting out of an equation isn't discoverable: clicking beside one goes inside, and Enter adds an aligned line. | B2 | minor |
| 10 | Typing "/section" or "/bullet" quickly doesn't open the block menu; "/" alone does. | B, C | minor |
| 11 | `$` inside one fast `type` call stayed literal. Possibly the harness's typing speed, but fast typists exist. | C | minor |
| 12 | The reference picker brings its own parentheses ("((4)") and leaves a double space before the reference ("state  (4)" in the PDF). | C | minor |
| 13 | "Page updated · 1 note" in the pane: the note can't be opened. | A, A2 | minor |
| 14 | The pane reformats your LaTeX when you leave it (`x^2` → `x^{2}`, reflowed lines). This is by design (the page is the source), but LaTeX users notice. | A | minor |
| 15 | On the page a theorem's title has no parentheses: "Theorem 1. Maximum principle The…". The PDF is right. | A, A2 | cosmetic |
| 16 | "Footnote" is listed as an "Insert block" but inserts an inline mark; jargon: "index", "caret", "compile", "typeset", "blocks". | B, B2 | cosmetic |
| 17 | The symbol palette has no search (∞ is under Operators). | B2 | cosmetic |
| 18 | **Found by the organiser:** a caption above a table touches the table's top rule in the PDF. | — | cosmetic. **Fixed** after the round (latex.js, `\vspace{6pt}`) |

## Tooling artefacts (not PaperTeX)

- **Clipboard:** Ctrl+V never fires a paste event in the test browser, even within one page.
- **Tab cap:** two testers got only one tab.
- **Hidden pane:** screenshots timed out, the mouse wheel didn't scroll, and the home page's reveal animations didn't run.
- **PDF viewer:** its frame takes no clicks or keys.

## What round 5 says

Import works: a project from Overleaf arrives whole, and continuing it is now an editing job, not a rescue job. The two things that hurt are both small to fix and both promised by the task itself:
- keep the whole `.bib`;
- make a fraction take only what a person means as its numerator, and make the Fraction button or `\frac` insert an empty one.

The output bugs (3–5) are worse than they look, because the page looks right while the PDF doesn't. They should be fixed first.

## Limits

- **Simulated SUS:** AI testers in character.
- **Snapshot:** testers used commit `8dac54d`.
- **The task:** it started with the project already imported, and testers could not exercise the Open dialog or real pasting because of browser-tool limits. Both were tested by script.
- **Variance:** one run per model and persona, except the Word user (two).
