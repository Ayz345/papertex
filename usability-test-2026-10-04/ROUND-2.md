# Re-evaluation: round 2, after the fixes

**Date:** 4 October 2026, evening
**Compared with:** round 1, the same afternoon ([REPORT.md](REPORT.md))
**Per-item scores:** [scoring.md](scoring.md)
**Final documents** (`.tex`, saved document as `.json`, compiled PDF): [results/](results/)
**Next:** [ROUND-3.md](ROUND-3.md). Everything listed here was fixed overnight, and round 3 confirmed the compile fixes.

## Summary

The same four testers were rerun on the fixed editor. The same models, personas, prompts and PDF were used. This time I scored every final document myself against a 27-item checklist, instead of relying on the testers' own estimates.

| | Round 1 | Round 2 |
|---|---|---|
| A, LaTeX veteran (Sonnet) | 21/27 (78%) | **26.5/27 (98%)** |
| B, Word user (Sonnet) | 17.5/27 (65%) | **25.5/27 (94%)** |
| C, keyboard-first (Sonnet) | 21.5/27 (80%) | **23.5/27 (87%)** |
| D, ordinary user (Haiku) | 2/27 (7%) | 4.5/27 (17%) |
| **Sonnet testers together** | **74%** | **93%** |

- **The fixes worked.** The three things that stopped every tester in round 1 were done by all three Sonnet testers in round 2:
  - the footnote;
  - the third row of the cases display;
  - the derivation inside the proof.

  So were live cross-references and inline slashes. The best round-2 document compiles to a PDF almost identical to the original; only the figure image is missing, which can't be uploaded in this setup.
- **Two new bugs each stop a whole document from compiling.** Both are easy to trigger, and the error dialog then gives false advice:
  1. One empty display equation fails the compile with "Missing $ inserted".
  2. One "≥" typed or pasted into ordinary text fails it with "Unicode character … not set up".

  Neither was caught because no tester checked a full compile in round 1. Both are confirmed and are the top priority now.
- **The test itself needed correcting.**
  - The Haiku tester's self-reports are unreliable: it claimed 60–70% and then about 60%, against real scores of 7% and 17%, and it said a document compiled when it can't.
  - Round 1's report leaned on Haiku in a few places, and one of my own "corrections" of a tester was wrong.
  - Corrections are listed below.

## What changed between the rounds

Between about 18:45 and 20:45 the other sessions changed `js/doc.js`, `app.js`, `math.js`, `latex.js`, `keys.js`, `palette.js` and `sanitize.js`. These changes are uncommitted. They addressed all 13 round-1 problems:
- footnotes;
- adding rows to cases and matrices;
- equations inside theorems and proofs;
- desktop text input in formulas;
- `//` for a plain slash;
- Ctrl+A and Backspace;
- Esc from an equation;
- menu ranking;
- plain theorem numbering;
- the bibliography's full stop;
- typed `\cite`/`\ref`/`\emph`;
- a reference picker in Ctrl+K.

Round 2 tested the working tree as it was at 21:15.

## How round 2 differed from round 1

**Kept the same:**
- the four personas and models (Sonnet 5.5 ×3, Haiku 4.5);
- the prompts, word for word except the port ([tester-prompts.md](tester-prompts.md));
- the PDF;
- the budget, about 200 actions;
- the rules (no source code, no JavaScript, browser only).

**Changed:**
- **Fresh ports (8811–8814).** Round 1's ports still held round 1's documents and "seen the intro" flags, so reusing them would have given the new testers a non-fresh start.
- **The report folder was hidden from tester ports.** It now sits inside the served site and contains the answers.
- **Organiser scoring.** Every final document, from both rounds, was pulled out of the browser's storage. I scored its generated LaTeX with the checklist in [scoring.md](scoring.md) and compiled it myself, so each page of the output could be read. That closes round 1's biggest gap: nobody had checked the compiled PDF past page 1.

**Not controlled (see "Limits"):**
- **Window size:** the browser pane had shrunk to 547×411 by the time round 2 started.
  - A worked in the site's narrow phone layout.
  - B emulated 1100×688.
  - C switched between sizes.
  - Round 1 mostly worked at 800–1024 px wide.
- **Starting template:** each tester chose its own: Article, or Blank.

## Results

### The round-1 blockers

| Element | Round 1 (3 Sonnet testers) | Round 2 |
|---|---|---|
| Footnote | 0 of 3 | **3 of 3**, found through Ctrl+K "footnote" |
| Cases display with three rows | 0 of 3 | **3 of 3** had three rows; 1 exactly right (B squeezed them into two rows with `\quad`; C had the conditions wrong) |
| Derivation inside the proof, ∎ at its end | 0 of 3 | **3 of 3** |
| All cross-references live | 0 of 3 | **3 of 3** |
| Inline k/m, c/(2m), 10/h with a slash | 0 of 3 | **3 of 3**, with `//` or Backspace after `/` |
| Theorem numbered "1" | 0 of 3 | **3 of 3**, now the default |

The improvement is consistent across all three Sonnet personas: +20, +29 and +7 percentage points. Every element that blocked everyone now works for everyone, so the direction of the result is solid. The exact size is less certain: there is one run per persona, and the window size wasn't controlled.

### Effort

The round-2 testers spent about as long as round 1's, 23–25 minutes each. Two of them made more tool calls:

| Tester | Round 1 | Round 2 |
|---|---|---|
| A | 382 calls | 714 calls |
| B | 529 calls | 744 calls |
| C | 295 calls | 284 calls |

Most of the extra went on screenshots and re-reading in the cramped window. In round 1 the effort went on recovering from mistakes. No round-2 Sonnet tester gave up on any element. Round 1's testers gave up on 3 to 6 each.

## Status of round 1's problems

Statuses come from the round-2 testers' reports, the documents they produced, and my own checks where the testers didn't exercise a fix.

| Round-1 problem | Status | Evidence and what remains |
|---|---|---|
| 1 No footnote | **Fixed** | All three Sonnet testers made one through Ctrl+K. *Remaining:* after inserting it, the caret sits *before* the mark, and Backspacing past the mark silently deletes the footnote and its text; Ctrl+Z restores it (C). |
| 2 Can't add cases/matrix rows | **Fixed** | Enter in the last cell adds a row; I reproduced it (`a & b \\ c & d \\ e & f`). The ⋮ menu has "Add a row below". *Remaining:* Tab in the last cell, or End, leaves the structure, and the next Enter makes a new equation instead (A, B). |
| 3 No maths inside a proof | **Fixed** | All three Sonnet documents have `align*` inside `proof` with `\qedhere`. *Remaining:* equations made inside a proof are numbered by default and had to be un-numbered by hand (A, C). |
| 4 Formulas ignore text input | **Fixed** | Checked directly: text sent as text input into a formula now arrives (`$\alpha+\beta$`). The `/` block menu and the `$` formula trigger still react only to key presses; that matters only for input methods and dictation. |
| 5 `/` always a fraction | **Fixed** | All three used `//` or Backspace; the documents have `\sqrt{k/m}`, `c/(2m)`, `10/h`. |
| 6 Ctrl+A, Backspace deletes the equation | **Fixed, with a side effect** | Checked directly: the equation now stays, empty. **An empty equation breaks compiling** (new problem 1), so this fix makes that bug easier to hit. |
| 7 Esc from an equation merges text | **Fixed** | Esc makes a new paragraph (C). |
| 8 "numbered" finds Section | **Fixed, similar cases remain** | `/` "numbered" now gives the numbered list (C). *Still:* `/` "table" ranks Table of contents above Table (C), and typing "Figure" in the reference picker still lists Table 1 first (C). |
| 9 Typing LaTeX doesn't work | **Fixed for backslash commands** | `\ddot{x}`, `\text{…}`, `\top`, `\mathbf`, `\in` all work (A, B, C), and `\cite`/`\ref` in text convert. *Still:* names typed *without* a backslash straight after a letter stay as letters, and braces are literal: `mddot{x}` stays as typed, and `cdot{x}` becomes "·{x}" (reproduced; Haiku's equations came out this way). `\pmsqrt` needs a Space between the commands (C). |
| 10 Cross-references hard to find | **Fixed** | All three found Ctrl+K "reference" / "cite". The picker lists unlabelled items and adds "Table" or "Figure" itself. *Still:* citing needs the References block to exist first ("Nothing matches"), and the list is long, with tables and figures at the bottom (B). |
| 11 Caret stays inside slots | **Unchanged** (learning curve) | Still the most common friction for B: Space leaves a slot rather than typing a space, so words in maths need the Abc button. Testers learned it from the help. |
| 12 "Theorem 2.1" | **Fixed** | "Theorem 1" in every round-2 document; "Number theorems by section" is now a setting. |
| 13 Reference fields | **Partly fixed** | The doubled full stop is gone. **Still:** C typed each whole entry into one field (Journal/publisher) in *both* rounds, and the italics applied there were silently dropped. The fields look like one line of text. A floating "Year" label overlaps the text being typed (A). |

## New problems found in round 2

Ranked by severity. "Status" uses the same terms as round 1: confirmed in code, reproduced in the browser, or reported only.

### 1. One empty display equation makes the whole document fail to compile

- **Status:** confirmed and reproduced.
- **What happens:**
  1. Ctrl+Enter, then Esc (or Ctrl+A, Backspace in an equation) leaves an empty equation.
  2. Compile PDF fails with "Missing $ inserted. <inserted text> $ l.16".
- **Cause:** [latex.js:154](../js/latex.js#L154) writes a one-line equation as `\begin{equation}\n  ` + body. With an empty body that leaves a line of only spaces, which TeX reads as a paragraph break inside maths.
- **Why it matters:**
  - Empty equations are easy to create, and since round 1's fix 6 they are left behind on purpose.
  - Tester B also found that an un-numbered empty equation is **invisible on the page**. So a user can be stuck with a document that won't compile, a cryptic error, and nothing visible to delete.
  - Round 1's Haiku document fails for this reason (it has three empty equations).
- **Suggested fix:** write nothing for an empty equation, as already happens for empty paragraphs ([latex.js:315](../js/latex.js#L315)). Also show an empty equation as a visible empty box, even when it has no number.

### 2. A Unicode maths symbol typed in ordinary text breaks the compile

- **Status:** reproduced.
- **What happens:** "c ≥ 0" typed (or pasted) into a paragraph fails with "LaTeX Error: Unicode character ^^e2^^89^^a5 (U+2265) not set up for use with LaTeX".
- **Cause:** the preamble uses pdfLaTeX with `\usepackage[utf8]{inputenc}` ([latex.js:342](../js/latex.js#L342)). Symbols typed in *formulas* are now mapped to commands (round 1 fix 4); text isn't.
- **Why it matters:** pasting a sentence from a PDF or a web page is how most people write. ≥, ≤, ±, ×, →, ∞, Greek letters and so on all break it. Round 2's Haiku document fails for this reason.
- **Suggested fix:** map common maths and Greek characters in text runs to `\ensuremath{\geq}` and so on (or `\textgreater`-style text commands), or declare them with `\DeclareUnicodeCharacter` in the preamble.

### 3. The compile error dialog gives false advice

- **Status:** reproduced. The text is at [app.js:1176](../js/app.js#L1176).
- **What happens:** after both failures above, the dialog says "The .tex itself is still valid — Export .tex and compile it anywhere. A missing .sty usually means the package is outside the engine's bundled set." Neither is true here: the `.tex` fails in any pdfLaTeX.
- **Suggested fix:**
  - Say that only when the error really is a missing package or file.
  - For errors like these, point at the block that caused it, e.g. "An empty equation on page 1", "The character ≥ in section 2".

### 4. The Blank template has no abstract, and there's no command to add one

- **Status:** confirmed: [templates.js:50](../js/templates.js#L50) sets `showAbstract: false`, and the only switch is Document → Front matter → "Show abstract" ([app.js:775](../js/app.js#L775)).
- **Reported by:** C.
- **What happens:** `/` "abstract" gives "Nothing matches"; Ctrl+K "abstract" finds only "New: Article". It took about four attempts to find the checkbox.
- **Suggested fix:** an "Abstract" item in the `/` menu and Ctrl+K that switches it on and puts the caret in it.

### 5. Typing lands outside popups

- **Status:** mostly a test-tool effect.
- **Reported by:** A, B and C.
- **What happens:** after Ctrl+K → "footnote" or "reference" → Enter, the keys typed straight away went into the paragraph rather than the popup.
- **Cause:** the palette runs its command in `setTimeout(…, 0)` ([palette.js:175](../js/palette.js#L175)). Chrome throttles timers in background tabs to about once a second, and the testers' tabs were in the background. A person typing at normal speed in a foreground tab will rarely hit this.
- **Suggested fix:** cheap: run the command synchronously, or keep focus in the palette until the popup has opened.

### 6. Focus is lost after several actions

- **Status:** reported (C).
- **What happens:** after each of these, the next keys went nowhere until the tester clicked back into the text:
  - clicking a side-panel tab;
  - clicking an equation number to un-number it;
  - Ctrl+Z;
  - closing the footnote popup.
- **Why it matters:** a keyboard user loses keystrokes without noticing.

### 7. Smaller problems (reported only)

| Problem | Reported by |
|---|---|
| The chart editor's x-range fields are formula fields, so Ctrl+A and triple-click don't select their contents; typing appends to "−2π". | B, C |
| The table editor's header cells start with real text "Header 1/2/3"; typing appends to it ("Header 1Step h"). | C |
| Inserting a block leaves the empty paragraph it was inserted from. A References block lands at the caret, not at the end of the document. | B |
| The Blank template's sentence "Delete this text and start on your own document." prints if not deleted. It is in B's compiled PDF. | B |
| A paragraph after a list is indented in the PDF ("Table 1 lists the results…"); the original continues the paragraph. | A, confirmed in the compiled PDF |
| A mouse click on a row of the reference picker inserted nothing (keyboard worked), and a hovered row and the keyboard-selected row were highlighted at the same time. | A |
| Bare-name pitfalls in formulas: `cdot` is the centred dot, so "c·dot" can't be typed as a name. | Reproduced |
| Jargon in visible labels: "Raw LaTeX", "Sub-subsection", "Binomial", "Contour integral", "Book rules", "Smoothness", "Relations", "Sets & logic", "Number theorems by section". | B |

### Not reproduced, or the tester's mistake

| Claim | Finding |
|---|---|
| "+ Add a block does nothing" (Haiku) | It opens the insert menu. |
| "Enter in the last cases cell doesn't add a row" (A) | It does; Tab or End had already left the cell. |
| "The full stop in eq. (3) sits under the root" (A) | It doesn't, on the page or in the PDF. |
| "The references have no final full stop" (B) | They do. |
| "/ didn't open the block menu" (B) | A and C opened it with the `/` key. B's paragraph probably wasn't empty, or the text-input action was used. |

## What the re-evaluation says about the test

1. **Self-reports from Sonnet testers are usable; Haiku's are not.**

   | | Sonnet self-estimates vs score | Haiku self-estimates vs score |
   |---|---|---|
   | Round 1 | 75/78, 55–60/65, 75/80 | 60–70 vs **7** |
   | Round 2 | 90/98, 90/94, 90/87 | ~60 vs **17** |

   Sonnet's estimates are within about 10 points, and the testers tend to undersell themselves. Haiku claimed elements that don't exist and a compile that can't succeed. **Haiku testers should be dropped, or their reports never used without checking the document.**
2. **Round 1's report leaned on Haiku in places.** Its "Ctrl+K took 15 minutes to find" and "the affiliation is a new line after the author" were Haiku observations. They are now low-confidence.
3. **One of my round-1 "corrections" was wrong.** I wrote that tester C's claim "bibliography titles aren't italic in the LaTeX" was false because the writer uses `\emph`. In C's actual document the titles *aren't* italic: C typed each whole entry into the Journal field, and formatting there is dropped. C was right, and it happened again in round 2. [REPORT.md](REPORT.md) is now corrected.
4. **Checking the output was the biggest gap.** Neither round's testers could scroll the PDF viewer, and no tester noticed that their own document failed to compile (Haiku said it compiled). Compiling every final document myself found both new blockers. **Future rounds should always compile and read the final documents**, as this round did.
5. **The window size has to be fixed for the run.**
   - Emulating 1280×800 in a pane that is 800 or 547 px wide gives screenshots too small to read, so testers drop the emulation and work at whatever size the pane happens to be.
   - Round 2's A worked in the phone layout, so its layout findings (cramped table editor, clipped tooltips) belong to that layout.
   - Next time: set the pane to a known size before starting, and use a size that fits it, e.g. 1024×640.
6. **The testers couldn't see the original properly.** The PDF-reading tool can't render pages in the subagents' environment, so testers fell back on PyMuPDF images or `pdftotext`. Round 2's C read text only, lost the Greek letters, and wrote Δ in the cases display. **Next time: hand out PNG renders of the pages along with the PDF.**
7. **One run per persona.** Variance isn't measured. The direction of the change is robust: all personas improved, and every universal blocker flipped. The exact percentages are not.

## Limits of round 2

- Window size and starting template weren't controlled (above).
- I wrote the checklist after seeing round 1's documents, and I'm the only scorer. Every deduction is explained in [scoring.md](scoring.md).
- Image figures are still untested, since the browser tool can't upload files.
- Only Chromium was tested. Firefox and Safari still haven't been.
- The tested code is an uncommitted working tree, which may have changed since 21:15.

## Run statistics (round 2)

| Tester | Tool calls | Run time | Tokens |
|---|---|---|---|
| A, LaTeX veteran | 714 | 23.3 min | 405,947 |
| B, Word user | 744 | 25.0 min | 482,915 |
| C, keyboard-first | 284 | 24.1 min | 458,757 |
| D, Haiku | 116 | 8.5 min | 120,286 |
| **Total** | **1,858** | **80.8 min of agent time, ~25 min wall clock** | **1,467,905** |

Scoring, archiving and the checks above were done by the organiser, outside these figures.

## Suggested next steps

**For the product, in order:**
1. Empty equations: write nothing, and keep them visible on the page.
2. Unicode symbols in text: map them to commands.
3. The compile error dialog: honest wording, and point at the block that caused the error.
4. An "Abstract" command.
5. The reference-field and footnote-caret issues.

The first three are in `latex.js` and `app.js` (owned by the backend session) and are small.

**For the test (round 3):**
- Fix the pane size before starting.
- Hand out PNG renders of the original's pages.
- Drop the Haiku tester, or replace it with a second Sonnet run of one persona to measure variance.
- Keep organiser scoring and compiling of every final document.
- Add one image-upload check by hand.
