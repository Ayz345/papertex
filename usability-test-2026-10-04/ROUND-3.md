# Round 3: third run, after the round-2 fixes

**Date:** 5 October 2026, 00:20–01:30
**Previous rounds:** [REPORT.md](REPORT.md) (round 1), [ROUND-2.md](ROUND-2.md)
**Scores:** [scoring.md](scoring.md)
**Final documents** (`.tex`, `.json`, compiled `.pdf`): [results/](results/), files `round3-*`

## Summary

| Tester | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| A, LaTeX veteran | 78% | 98% | **89%** |
| B, Word user | 65% | 94% | **100%** |
| C, keyboard-first | 80% | 87% | **48%** |
| B2, second Word user (new) | | | **94%** |
| A + B + C together | 74% | 93% | **79%** |

1. **The round-2 compile bugs are fixed.** All four round-3 documents compile. So do all eight documents from rounds 1 and 2, including the two that failed before (on an empty equation, and on a "≥" in text).
2. **The Word-user persona is now reliable:** 94%, 100% and 94% across three runs. B scored 27/27, the first perfect document in the test. It even rebuilt the figure as a plot.
3. **The drop in the total is mostly one run.** C, the keyboard-first tester, spent about 100 actions fighting `\text{…}` cells in the cases display and ran out of budget before Section 3. The trap it hit is real (problem 6 below), but in round 2 the same persona scored 87%. One run per persona is too little to treat C's 48% as a regression.
4. **A lost points to one LaTeX habit.** Spaces typed inside braces end the group: `\sqrt{\gamma^2 - \omega_0^2}` became `\sqrt{\gamma^{2}-}\omega_{0}^{2}`. That is wrong maths, produced silently. It's the most important new finding for LaTeX users.
5. **Three new structural bugs were confirmed:**
   - A proof silently loses its equation if any block is ever inserted between them.
   - "+ reference" leaves the caret where it was, so typing lands in the title and author fields. Three testers hit this.
   - A Ctrl+K search can run "New: Article" and replace the open document without asking.

## What changed since round 2

Overnight, between 21:30 and 00:00, the other sessions fixed every item in [ROUND-2.md](ROUND-2.md):
- empty equations;
- Unicode symbols in text;
- the error dialog;
- an Abstract command;
- rich-text bibliography fields;
- "+ New work…" in the citation picker;
- bare names with braces.

Round 3 tested the working tree as it was at 00:16 on 5 October, with no edits after 00:00. It's still uncommitted.

## How round 3 differed

Round 2 recommended four method fixes; all four were applied:

| Fix | What was done | Did it work? |
|---|---|---|
| Fix the window size | The pane was hidden, which makes 1280×800 render cleanly into an 800×500 frame. Every tester was told to work at that size the whole time and re-apply it if the frame changed. | **Yes, until the interruption.** No tester complained about size before it. Afterwards the emulation drew into a corner again for A and B, who adapted. |
| Page images of the original | The handout became a folder with the PDF plus `page-1.png` … `page-3.png`. | **Yes.** All four read the images, and no Greek letters were lost. |
| Drop the Haiku tester | Replaced with B2, a second Word user with B's prompt word for word. | **Yes.** Its results measure run-to-run variance (below). |
| Organiser scores and compiles every document | As in round 2. | **Yes.** All 12 documents from rounds 1–3 were compiled. |

Fresh ports were used (8821–8824). The prompts changed only in those points ([tester-prompts.md](tester-prompts.md)).

**What went wrong with the run:**
- **Usage limit.** About 15 minutes in, A and B were cut off by the account's usage limit. When it reset, I resumed them with their context intact.
  - The browser pane had closed and stopped the test server; I restarted it.
  - Both testers had to open their document in a new tab. Autosave had kept it.
  - Their run times and call counts can't be compared with the others'.
- **Keystrokes in the wrong tab.** Twice each, A and B left out their tab ID, and their keystrokes went into my organiser tab (about 48 characters each). That tab was then showing other ports' documents. I searched every archived round-3 document for their stray text and found none, but this is a hole in the method: **next time the organiser should keep no tab open in the shared browser during the run.**

## Results

### Run-to-run variance

| | Score | Main difference |
|---|---|---|
| B | 27/27 (100%) | It rebuilt the figure as a plot. |
| B2 | 25.5/27 (94%) | Its derivation ended up outside the proof (new problem 1); it dropped the ᵀ; its figure is a placeholder. |
| Round 2 Word user | 25.5/27 (94%) | |

The persona replicates within about 6 points. C's swing between rounds (87% → 48%) shows the opposite case: one tester who sinks its budget into a single element can lose half its score. Treat any single-run number with that in mind.

### Self-estimates

All four were within about 10 points of my score:

| Tester | Own estimate | Score |
|---|---|---|
| A | ~90% | 89% |
| B | ~90% | 100% |
| C | ~40% | 48% |
| B2 | ~90% | 94% |

As before, Sonnet testers slightly undersell themselves.

### Effort

| Tester | Tool calls | Run time | Tokens | Notes |
|---|---|---|---|---|
| A | ~330 (its own count) | — | 530,963 | Interrupted and resumed |
| B | a little over 200 (its own count) | — | 533,389 | Interrupted and resumed |
| C | 460 | 15.4 min | 306,067 | Ran out of action budget |
| B2 | 368 | 16.2 min | 351,043 | |

Tool-call totals and run times for A and B were split across the interruption and couldn't be measured. Their token counts are as reported when they finished.

C and B2 needed about 15–16 minutes, against 23–25 in round 2.

## Status of round 2's problems

| Round-2 problem | Status in round 3 |
|---|---|
| 1 An empty equation fails the compile | **Fixed.** Checked directly; round 1's D document now compiles. |
| 2 "≥" in text fails the compile | **Fixed.** Checked directly (`\ensuremath{\geq}`); round 2's D document now compiles. |
| 3 False advice in the error dialog | Not re-checked. No round-3 document failed. |
| 4 No Abstract command | Not exercised: every tester started from a template with an abstract. |
| 5 Typing lands outside popups | **Still seen by all four**, now mostly with `$` and `/` typed in the same burst as what follows. Probably the test setup (background-tab timer throttling), but four out of four is a lot; making the triggers synchronous would rule it out. |
| 6 Focus lost after actions | **Partly.** New and confirmed: "+ reference" (new problem 3). |
| Reference fields | **Much better.** All four used the fields correctly through "+ New work…", with titles italic. |
| Equations inside a proof numbered by default | **Fixed** (A, B). |
| Cases and matrix rows | **Fixed** for Enter in the last cell (A, B, B2). `\text` cells are still a trap (problem 6). |
| Chart range fields don't select on Ctrl+A or triple-click | **Still** (A, B). |
| Table header cells append to "Header n" | **Still** (A, B2). |

## New problems found in round 3

### 1. A proof permanently loses its equation if a block is ever inserted between them

- **Status:** confirmed in code and in B2's document.
- **What happens:** B2 used the "+" handle beside the Proof block to add a Section. The section landed between the proof's lead-in and its equation. B2 moved the section away again, but the derivation stayed outside the proof (`\end{proof}` followed by `align*`). The ∎ sits after "Differentiate E and use (1):".
- **Cause:** `envChain()` ([doc.js:222](../js/doc.js#L222)) runs on every render. When an equation flagged `inEnv` has no owner directly above it, it *deletes* the flag. One render with an intruding block is enough, and nothing restores it.
- **Suggested fix:**
  - Compute membership without mutating the blocks, or keep the flag and simply ignore it while the chain is broken.
  - Also: the "+" handle on a proof should insert *after* the whole proof group.

### 2. Spaces inside an explicit `{…}` end the group

- **Status:** reproduced.
- **What happens:** typing `$\sqrt{a - b} + c$` gives `$\sqrt{a}-b+c$`. Space means "leave this slot", even though the user typed the brace. Parentheses behave the same, according to A: `(\cos\omega_d t + …)` and `\dot{x}(m\ddot{x} + kx)`.
- **Why it matters:** it is wrong maths, produced silently. A LaTeX user types spaces in maths all the time, because LaTeX ignores them. A's equation (3) and its ω_d both came out wrong this way.
- **Suggested fix:**
  - After a typed `{` (or `\left(`), let Space insert nothing and stay inside until the matching `}`.
  - Or ignore Space entirely in a slot opened by a typed brace.

### 3. "+ reference" doesn't put the caret in the new entry

- **Status:** reproduced; [doc.js:1765](../js/doc.js#L1765).
- **Hit by:** A, C, B2.
- **What happens:** clicking "+ reference" adds an empty entry, but focus stays where it was. Typing goes nowhere, and Tab walks the page from the top. All three testers' text ended up in the **title, author and affiliation**. Ctrl+Z repairs it, but A had to fix the fields by hand.
- **Related:**
  - **Duplicate keys:** that button makes keys as `'ref' + (bib.length + 1)`, so after a deletion it can repeat an existing key. The "+ New work…" path avoids this ([app.js:711](../js/app.js#L711)); A ended up with two `ref2` entries.
  - **Empty entries print:** an empty entry is written as `\bibitem{ref2} .` and prints "[2] .".
  - **Dangling citations:** deleting a cited entry leaves a "??" citation behind.
- **Suggested fix:**
  - After adding, focus the new entry's Author field.
  - Use the de-duplicating key code.
  - Skip empty entries when writing the LaTeX.

### 4. A Ctrl+K search can replace the open document without asking

- **Status:** the result list is reproduced; the rest is reported by B.
- **What happens:**
  1. With the caret outside text, Ctrl+K "refer" lists exactly two results: "References — Insert block" and "**New: Article** — New document". "proof" also matches "New: Lecture notes".
  2. B pressed Down and Enter expecting "Reference to…", which only appears when the caret is in text.
  3. Its document was replaced by the sample article, with Undo greyed out.
- **Not lost:** the previous document is kept under Open, and a notice says so. B recovered it from there.
- **Why it matters:** results that change with the caret's position, plus an unconfirmed "New: …" command in fuzzy matches, add up to an easy accident.
- **Suggested fix:**
  - Match "New: …" templates only on their own names.
  - Make a new document undoable, or confirm first.

### 5. Leaving a slot with Right arrow only leaves the innermost one

- **Status:** reported (C, B2); C's equation (4) shows it.
- **What happens:** typing γ/ω_d puts the caret in the subscript. The first Right leaves the subscript, not the fraction, so the next text ("sin ω_d t") goes into the denominator. C's (4) came out as `\frac{\gamma}{\omega_{d}\sin}\omega_{d}t`. This is the same family as round 1's problem 11, and it still produces wrong maths silently.
- **Suggested fix:** highlight the active slot clearly. Optionally, after a single-character subscript, let the next operator or letter typed leave both levels when the subscript is "soft".

### 6. `\text{…}` cells inside cases are hard to move out of

- **Status:** reported (C; round 2's B described the same).
- **What happens:**
  - Tab out of a `\text` slot jumps to after the whole cases display, so stray text lands outside the brace.
  - Up arrow leaves the equation and types into the previous paragraph.
  - An empty cell is 3–4 px wide and clicking it puts the caret at the start of the formula.
- **Cost:** about 100 actions for C, ending in an incomplete display.
- **Suggested fix:** Tab and Shift+Tab should treat a `\text` slot as part of its cell. Also give empty cells a clickable minimum width.

### 7. Smaller problems (reported)

| Problem | Reported by |
|---|---|
| After a command with a suggestion popup (`\top`), Esc only closes the popup; the following words go into the formula. Space then Esc works. | B, B2 |
| Ctrl+A next to an inline formula selects the formula's contents; typing then goes into the maths. In an equation, Ctrl+A sometimes selects the whole paragraph. | B, A |
| Enter at the end of a figure or chart caption doesn't start a new paragraph. | B |
| Blocks added from the palette or "+ Add a block" go to the end of the document, after References. | B |
| The bibliography is numbered in list order, with no way to reorder entries. | A |
| A chart's legend can't hide a curve (an empty legend entry shows the raw formula), and legend text isn't maths. | A, B, and round 2's B |
| The cases display is numbered by default and must be un-numbered by hand. | A, B, B2 |
| The first-run help dialog opened over the first typing; Ctrl+A then selected the page behind it. | B2 |
| A single click on a table cell doesn't allow typing; it needs a double-click. | A |
| Jargon: "\includegraphics" on the Figure block, "\ref" in the label hint, "Through 0", "Structures", "Blocks", "Accents", "Unnumbered (starred)". The difference between "Compile PDF" and "Print / PDF" is unclear. | B, B2 |

### Not reproduced

| Claim | Finding |
|---|---|
| `\ge` isn't recognised (A) | `x \ge 0` gives `x\ge0`. A probably didn't end the command with a space. |
| The home page is blank (B, B2, C) | The hero animates with `requestAnimationFrame`, which doesn't run in hidden or background tabs. A test-setup effect. |

## What round 3 says about the product

The core writing flow works for a newcomer. Two Word users who had never used LaTeX produced near-perfect documents in about 15 minutes, and a LaTeX user reached 89%. What's left is two kinds of problem:
1. **Silent wrong maths:**
   - spaces inside braces (problem 2);
   - leaving slots (problem 5).

   These matter most, because the editor gives no sign that anything is wrong. Users only notice if they compare the output closely.
2. **Focus and placement bugs:**
   - proof membership (problem 1);
   - "+ reference" (problem 3);
   - the palette's "New:" commands (problem 4);
   - `\text` cells (problem 6).

   These lose or misplace work. They are mostly small fixes in `doc.js`, `math.js` and `app.js`, which the backend session owns.

## Suggestions for round 4

- Keep: page images, the fixed window size, organiser scoring and compiling.
- Close the organiser's tab during the run.
- Run **two testers per persona.** C's swing shows that one run is not enough for the keyboard persona.
- Raise the action budget a little (to about 300) so a tester can't run out before reaching half the document.
