# First-time-user test: recreating a LaTeX paper in PaperTeX

**Date:** 4 October 2026
**What was tested:** the editor (`app.html`), starting from the home page
**Method:** four AI agents, given no information about the site, each recreated the same three-page LaTeX paper in its own browser tab
**Test document:** [test-document/damped-oscillator.pdf](test-document/damped-oscillator.pdf). Its source is [damped-oscillator.tex](test-document/damped-oscillator.tex) and its plot is [fig1.png](test-document/fig1.png).
**Tester instructions:** [tester-prompts.md](tester-prompts.md)

> **This is round 1.** The problems below were fixed the same evening, and a rerun with the same testers and document is in **[ROUND-2.md](ROUND-2.md)**. A third run, with a fixed window size, page images and a second Word user, is in **[ROUND-3.md](ROUND-3.md)**.
>
> - **Scores:** the three Sonnet testers' combined score rose from 74% to 93% on an organiser-scored checklist ([scoring.md](scoring.md)).
> - **New blockers:** the rerun also found two bugs that each stop a whole document from compiling.
> - **Corrections:** the rerun corrected parts of this report, marked *[corrected]* below.
>   - The Haiku tester's results are unreliable. Its real score was 7%, not the 60–70% it reported.
>   - One "wrong claim" listed below was in fact right.

## Summary

Four AI testers recreated a three-page LaTeX paper in the editor. None of them had been told anything about PaperTeX. None finished it: the two best runs reached about 75% of the paper.

Three parts of the paper stopped every tester:

- **the footnote**, because the editor has no way to make one;
- **the third row of a cases display**, because rows can't be added to a cases display or a matrix;
- **the derivation inside the proof**, because a display equation can't be placed inside a proof or theorem.

Most of the rest was possible but cost the testers many retries. The worst areas were:
- how the caret moves in and out of formulas;
- a few keys that delete or merge more than expected;
- cross-references that are hard to find.

The help dialog, typing symbol names (`alpha`, `sqrt`, `cases`), automatic equation numbering, the table editor and Compile PDF all worked well.

## The experiment

### Question

Can someone who has never seen PaperTeX recreate a typical short LaTeX paper with it? Where do they get stuck? Where do they lose time or work?

This test was about a person meeting the product for the first time. It did not audit the code. The testers were given no hints, and the code was read only afterwards, to check what they reported.

### What was tested

- **Site:** the PaperTeX folder (`C:\dev2\papertex`) served straight from source, not the `dist/web` build.
- **Version:** the working tree as it stood on the afternoon of 4 October 2026, including uncommitted changes to `app.html`, `css/app.css` and other files. It is not tied to a commit.
- **Starting point:** testers began on the home page (`/`) and had to find their own way into the editor.
- **Browser:** the Claude desktop app's built-in browser pane, which is Chromium (Electron), on Windows 11. The pane's default viewport is 800×600 CSS pixels.

### The testers

There were four AI agents, all running at the same time.

| Tester | Model | Persona | Port |
|---|---|---|---|
| A | Claude Sonnet 5.5 | Physics PhD student who has written LaTeX daily for five years. Sceptical of visual editors; reaches for `\frac`, `$…$`, `\cite`, `\label`/`\ref`. | 8801 |
| B | Claude Sonnet 5.5 | Second-year undergraduate who has only used Word and Google Docs. Relies on menus, buttons and right-click; says when jargon is confusing; doesn't type backslash commands unless taught to. | 8802 |
| C | Claude Sonnet 5.5 | Keyboard-first engineer. Prefers shortcuts, palettes, Tab/Enter/arrows, undo/redo and copy/paste. Was told to make mistakes on purpose and fix them. | 8803 |
| D | Claude Haiku 4.5 | No persona ("an ordinary person"). Included to see how a weaker, less patient agent copes. | 8804 |

The personas were chosen to cover three kinds of first-time user:
- **A, the target user:** someone who already knows LaTeX.
- **B, a hoped-for new audience:** someone who doesn't know LaTeX at all.
- **C, the power user:** someone most likely to hit keyboard and focus bugs.

The exact prompts are in [tester-prompts.md](tester-prompts.md).

### What the testers were told, and not told

- **Told:**
  - a URL;
  - the path of the PDF;
  - to recreate the paper "as faithfully as you can";
  - to check the output if the site could produce one;
  - to write a report in a fixed six-part format: coverage per element, problems, discoverability, what worked, test-tool problems, final state.
- **Not told:** the product's name, what it does, how the editor works, any shortcut, or what the test document contained beyond "3 pages".
- **Rules:**
  - Use the browser like a person: screenshots, clicks, typing, keys, scrolling, hovering.
  - Reading the page's text or accessibility tree was allowed, as "looking at the screen".
  - **Forbidden:** running JavaScript in the page, reading any file except the PDF, reading the site's source, and fetching the site outside the browser.
  - Testers were told that anything findable only through the accessibility tree would itself count as a finding.
- **Budget:** about 200 browser actions. After about 10 failed attempts at one element, a tester should note it and move on, "as a real user would".

### Keeping the testers apart

- **Separate ports.** All four used the same browser, but each had its own tab and its own port (8801–8804). A port is a separate origin to the browser, so each tester had its own `localStorage`: its own saved documents, its own "seen the intro" state, and its own compile cache. Every tester saw the first-run help dialog as a new user would.
- **The server.** One small Python script served all five ports: [harness/serve.py](harness/serve.py).
- **Port 8800** was for building the test PDF and for checking findings afterwards. No tester was given it.
- **A preflight check** before launch confirmed that the editor loads in a background tab and that keystrokes reach it there.

### The test document

[damped-oscillator.pdf](test-document/damped-oscillator.pdf), "Energy Decay in a Damped Harmonic Oscillator", is three pages long. It was written for this test so that one short, realistic physics note would exercise most of what a LaTeX paper needs:

| Element in the PDF | What it tests |
|---|---|
| Title, author, affiliation (`\\ \small`), date "October 2026" | Title-block editing; overriding `\today` |
| Abstract | The abstract field |
| Sections 1–3, plus References | Headings and numbering |
| Inline maths: `m>0`, `\omega_0=\sqrt{k/m}`, `\gamma=c/(2m)`, `x=e^{\lambda t}`, `t\in[0,10]`, `16=2^4` | Inline formulas, Greek letters, sub- and superscripts, roots, inline slashes |
| Equations (1)–(5) with `\label` | Display equations and automatic numbering |
| (1) `m\ddot{x}+c\dot{x}+kx=0` | Dot accents |
| (3) `\lambda_{\pm}=-\gamma\pm\sqrt{\gamma^2-\omega_0^2}` | Nested scripts inside a root |
| (4) `x_0 e^{-\gamma t}\left(\cos\omega_d t+\frac{\gamma}{\omega_d}\sin\omega_d t\right)` | Fractions, function names, growing brackets |
| (5) `\dot{\mathbf y}=\begin{pmatrix}0&1\\-\omega_0^2&-2\gamma\end{pmatrix}\mathbf y` | Matrices; bold symbols |
| Unnumbered `cases` display with 3 rows and `\text{}` | Piecewise displays, more than 2 rows, words inside maths, switching numbering off |
| `theorem` (amsthm) with inline `\dfrac{dE}{dt}` | Theorem environment and its numbering |
| `proof` containing a two-line `align*` and `\qedhere` | Display maths inside a proof; aligned lines |
| `\footnote{All quantities are in SI units.}` | Footnotes |
| `\cite{goldstein}`, `\cite{hairer}` + `thebibliography` | Citations and the reference list |
| `\eqref{…}` ×5, `Table~\ref`, `Figure~\ref` | Cross-references |
| `enumerate` (3 items) and `itemize` (2 items, one with `\textbf`) | Lists; bold; list order |
| `\emph{standard form}` | Italics |
| booktabs `table` with caption, 3×3, cells like `$8.51\times10^{-1}$` | The table editor; maths in cells; captions |
| `figure` with `\includegraphics` (a plot) and caption | Figures, or rebuilding the plot with Function plot |
| "N{\o}rsett", "Runge--Kutta" | Non-ASCII letters; en dash |

The content is internally consistent. The table holds real results: [harness/make_figure.py](harness/make_figure.py) integrates the equation with Euler and RK4 and also draws the plot.

The PDF was compiled with **PaperTeX's own TeX engine** (`engine/siglum.js` with the local `engine/texlive`) through [harness/make.html](harness/make.html), in three passes so that references resolve. `booktabs.sty` came from `engine/texmf`. So the target is something PaperTeX's own compiler can produce. The source is [damped-oscillator.tex](test-document/damped-oscillator.tex).

### Checking the reports

Every claim in the four reports was sorted three ways:
- **Confirmed:** I found the cause in the source.
- **Reproduced:** I triggered it myself in a fresh Article template at `http://localhost:8800/app.html#new=article`, at the pane's default 800×600 size, with real key presses.
- **Reported only:** neither of the above.

Three live checks were run:

1. **Typing `t in [0,10]` in an inline formula.** Typed `$`, `t`, Space, `i`, `n`, Space, `[`, `0`, `,`, `1`, `0`, `]`. Result: "t ∈ [0,10]", which is correct. Tester A's "tin" only happens without the space.
2. **Esc from a display equation.** Clicked into equation (1), pressed End then Esc, and typed `QQQ`. Result: "QQQwhere m is the mass…", so the text merged into the next paragraph.
3. **Ctrl+A then Backspace in equation (1).** Result: the whole equation block was gone, the reference "Equation (1)" became "??", and the caret was in the previous paragraph.

Two claims looked wrong; see "Claims that turned out to be wrong". *[corrected]* Round 2 showed one of them was in fact right.

### Run statistics

| Tester | Tool calls (measured) | Browser actions (tester's own estimate) | Run time | Tokens used |
|---|---|---|---|---|
| A, LaTeX veteran | 382 | ~480 | 24.8 min | 452,524 |
| B, Word user | 529 | ~330 | 21.1 min | 366,715 |
| C, keyboard-first | 295 | ~330 | 23.0 min | 412,063 |
| D, Haiku | 134 | not given | 7.6 min | 123,468 |
| **Total** | **1,340** | | **76.5 min of agent time, ~25 min wall clock** | **1,354,770** |

"Tool calls" counts everything an agent did, including reading the PDF. One call can batch several browser actions, which is why the two columns differ. All four ran in parallel, so the whole test took about 25 minutes of real time.

## How far each tester got

| Tester | Their estimate | Main gaps |
|---|---|---|
| A, LaTeX veteran | ~75% | Footnote; third cases row; derivation outside the proof; most cross-references left as placeholder text; slashes became stacked fractions; plot recreated only roughly |
| B, Word user | 55–60% | Footnote; third cases row; derivation outside the proof; table and figure not done; one bullet missing |
| C, keyboard-first | ~75% | Footnote; third cases row; end-of-proof square on the wrong line; "(2)", "(4)", "Table 1", "Figure 1" and citation [2] left as plain text |
| D, Haiku | 60–70% | Skipped the cases display, matrix, table, figure, formatting and cross-references. This was mostly a choice, not a block, so its result says less about the site. *[corrected]* Its saved document actually scores 2/27 (7%): only the title and the date are right, and it doesn't compile. Its report described elements that aren't there. See [scoring.md](scoring.md). |

All three Sonnet testers went well over the ~200-action budget, mostly cleaning up after formula and block-structure mistakes. Haiku stayed under it by skipping the hard parts.

The best runs, A and C, each got all five numbered equations, the table, both lists, the theorem, the proof and the bibliography. No tester produced the footnote, the third cases row, or a proof with its derivation inside it.

## Problems, most serious first

**Status** means one of three things:
- **Confirmed**: I found the cause in the code.
- **Reproduced**: I triggered it myself in the browser.
- **Reported**: only the testers saw it.

**Hit by** counts the testers who ran into it, out of 4.

### 1. There's no way to create a footnote

- **Hit by:** 4 of 4. **Status:** confirmed.
- **What testers tried:**
  - searching "footnote", "foot" and "note" in the Ctrl+K palette and the `\` palette;
  - the `/` block list;
  - the selection toolbar;
  - every block's ⋮ menu.

  Nothing matched. Tester C faked the marker with a superscript ¹ in a formula. Nobody could add the footnote text.
- **Cause:**
  - The document model and the LaTeX writer already support footnotes. A `span.ftnote` is written out as `\footnote{…}` ([latex.js:79](../js/latex.js#L79)).
  - The sanitizer keeps that span ([sanitize.js:14](../js/sanitize.js#L14), [sanitize.js:88](../js/sanitize.js#L88)).
  - But nothing in `doc.js`, `app.js`, `keys.js` or `palette.js` ever creates one.
- **Suggested fix:**
  - add a "Footnote" command to the selection toolbar and the Ctrl+K palette;
  - make typing `\footnote` in running text open it.

### 2. You can't add rows or columns to a cases display or a matrix

- **Hit by:** 3 of 3 Sonnet testers. **Status:** confirmed.
- **What happened:** a new `cases` display starts with 2 rows. Testers tried these keys in the last cell, about 6–12 times each:

  | Key | Result |
  |---|---|
  | Enter | Turned the display into a new aligned line or a new numbered equation |
  | Tab | Left the cases display |
  | Down | Did nothing |
  | Shift+Enter | Made a new paragraph |

  The ⋮ menu has no row options either. All three gave up on "overdamped, γ > ω₀".
- **Cause:** [math.js:2207](../js/math.js#L2207) defines `MathField.prototype.matrixOp('addrow' | 'delrow' | 'addcol' | 'delcol')`, commented "exposed for the equation toolbar". Nothing calls it.
- **Suggested fix:**
  - wire `matrixOp` into the equation's ⋮ menu or a small toolbar shown when the caret is inside a matrix or cases display;
  - also consider making Enter in the last cell of a `cases` display add a row, which is what all three testers expected.

### 3. A display equation can't go inside a proof or theorem

- **Hit by:** 3 of 3. **Status:** confirmed by the generated LaTeX.
- **What happened:** Ctrl+Enter inside a Proof block creates a top-level equation after the proof. The output is:

  ```latex
  \begin{proof} Differentiate $E$ and use (1): \end{proof}
  \begin{align*} … \end{align*}
  ```

  So the end-of-proof square sits after the opening sentence rather than after the derivation. That is visibly wrong next to the original.
- **Cause:** blocks are a flat list, and theorem and proof blocks hold only rich text.
- **Suggested fix:** let theorem and proof blocks contain child blocks, at least equations and lists. If that is too big a change, a cheaper version is to let an equation block carry an "inside the preceding proof" flag. The writer would then emit it before `\end{proof}`, with `\qedhere` on the last line.

### 4. On desktop, formulas ignore anything that isn't a key press

- **Hit by:** 3 of 3, through the test tool. **Status:** confirmed in code; still needs a check on a real keyboard.
- **What happened:** the browser tool's `type` action sends text as a text-input event, the same kind that symbol pickers and input methods produce. That text arrived in normal paragraphs but vanished in formulas. Only individual key presses worked.
  - In paragraphs, a `$` sent that way stayed a literal `$` instead of opening a formula.
  - In table cells, `$8.51 \times 10^{-1}$` stayed literal text.
- **Cause:**
  - On desktop a formula is a focusable `div` that handles only `keydown` ([math.js:1372](../js/math.js#L1372)).
  - The hidden text box that turns `beforeinput`/`input` events into keys only exists when `pointer: coarse` is true ([math.js:1415](../js/math.js#L1415), [math.js:1386](../js/math.js#L1386)).
- **Real users probably affected:**
  - the Windows emoji/symbol panel (Win+.);
  - Chinese, Japanese and Korean input methods;
  - dictation;
  - handwriting input on 2-in-1 laptops;
  - possibly "dead-key" characters such as `^` on Turkish-Q, German or French layouts. On those layouts `^` makes a superscript in a formula, so that case needs a check on a real keyboard.
- **Suggested fix:** use the same hidden text box on desktop too, or listen for `beforeinput` on the formula itself.

### 5. `/` always builds a stacked fraction

- **Hit by:** 3. **Status:** confirmed ([math.js:2130](../js/math.js#L2130)).
- **What happened:** there's no way to write an inline slash, so √(k/m), c/(2m) and 10/h all became stacked fractions. Backspace on a fraction takes it back to separate letters, without the slash. `\slash` isn't recognised either.
- **Suggested fix:** some escape for a literal slash, for example:
  - typing `\/`;
  - typing `//`;
  - making Backspace right after a new fraction turn it back into a plain `/`.

### 6. Ctrl+A then Backspace inside an equation deletes the whole block

- **Hit by:** 3. **Status:** reproduced.
- **What happened:** with the caret in equation (1) of the Article template, Ctrl+A then one Backspace removed the whole equation block, not just its contents.
  - The paragraph's reference to it immediately turned into **??**.
  - The caret jumped into the previous paragraph, so whatever is typed next lands there. Tester C got "textregime" in the wrong paragraph.
  - Ctrl+Z restores the block.
- **Suggested fix:** the first Backspace should empty the formula. Only a Backspace in an already-empty formula should remove the block, as in the rest of the editor.

### 7. Esc from a display equation types into the next paragraph

- **Hit by:** 2. **Status:** reproduced.
- **What happened:** Esc moves the caret to the *start* of the following paragraph. Typing "QQQ" after Esc on equation (1) of the template gave "QQQwhere m is the mass…".
- **Cause:** [doc.js:873](../js/doc.js#L873), `exitEq`. If the next block is a paragraph, it focuses that paragraph. If not, it makes a new empty paragraph. The same key therefore does two different things.
- **Suggested fix:** always make (or reuse) an *empty* paragraph after the equation. Alternatively, keep the current behaviour but show the caret clearly at the start of the next paragraph.

### 8. Searching the block menu for "numbered" inserts a section heading

- **Hit by:** 2. **Status:** confirmed.
- **What happened:** typing "numbered" in the `/` or + menu and pressing Enter inserted a Section, because its description is "Numbered heading" ([doc.js:107](../js/doc.js#L107)). The numbered list only matches its LaTeX name, "enumerate" ([doc.js:123](../js/doc.js#L123)). Both testers got a stray "4 integrated from t…" heading and needed about 10 actions to clean up.
- **Suggested fix:**
  - rank matches on the label above matches on the description;
  - add "numbered", "bullet" and "list" as search words for the two list blocks.

### 9. Typing LaTeX doesn't work, and nothing says so

- **Hit by:** tester A. **Status:** reported.
- **What happened:**
  - `\cite{…}`, `\ref{…}` and `\emph{…}` typed in running text appear as literal text.
  - `m\ddot{x}` typed in a formula gave `m{}`: the accent was silently dropped.
  - Pasting LaTeX into a formula does work, because paste goes through `parseTex` ([math.js:1379](../js/math.js#L1379)). Typing LaTeX does not.
- **Suggested fix:**
  - When `\` is followed by a known command name, convert it. For example, `\cite` would open the citation picker, `\ref` the reference picker, `\emph` would turn on italics, and `\ddot` would add the accent.
  - At the least, show a hint the first time a literal `\command{` appears in text.

### 10. Cross-references are hard to find and easy to get wrong

- **Hit by:** 3 of 3; all three left some references as plain text. **Status:** reported.
- **What happened:**
  - **Only labelled items appear in the picker.** Nothing tells you how to give something a label; each tester found ⋮ → Label by accident.
  - **The picker is hard to reach.** Its button (↪) is only in the selection toolbar, so it appears only when text is selected. It isn't in Ctrl+K. Typing "cite" in Ctrl+K finds nothing.
  - **The picker inserts only the number.** For a table you get "1", so you have to type "Table " yourself.
  - **Items are listed by key only.** The citation list shows "ref1" and "ref2", not the authors, and the template's first reference keeps the key `knuth1984` after being retyped.
  - **Chips can swallow the following space** ("(2)with"). The likely cause is that double-clicking a word on Windows also selects the trailing space, and the chip replaces the whole selection.
- **Suggested fix:**
  - Put the picker in Ctrl+K and on a `\ref`/`\cite` typed name.
  - In the picker, list unlabelled equations, tables and figures too, and label them automatically when chosen.
  - Optionally insert "Table 1" or "Figure 1" rather than just "1".
  - Keep a trailing space when replacing a selection with a chip.

### 11. The caret stays inside subscripts and other slots

- **Hit by:** 3. **Status:** reported.
- **What happened:** after a subscript, superscript, accent or `\text{}` slot, the keys you type next stay inside it. Typing `omega _ d = sqrt…` gave ω_{d=√…}, and a comma after `omega_0` became `\omega_{0,}`. You leave a slot with the Right arrow; the help says so, but every tester learned it by breaking something. In table cells you need Right Right before Tab.
- **Suggested fix:**
  - Draw the active slot more strongly.
  - Treat Space, `=`, `,` and binary operators as "leave the script" after a single-character subscript, as the automatic `x1` → x₁ index already does.

### 12. Theorems are numbered "Theorem 2.1" instead of "Theorem 1"

- **Hit by:** 3 of 3. **Status:** confirmed ([latex.js:337](../js/latex.js#L337)).
- **What happened:** theorems are numbered within sections, and the page matches that. No tester found a setting to change it.
- **Suggested fix:** add a "Number theorems within sections" switch in the Document tab, or default to plain numbering for the Article template.

### 13. Reference entries look like one line but are four fields

- **Hit by:** 2. **Status:** the full stop is confirmed; the rest is reported.
- **What happened:**
  - **Typing over an entry mangles it.** Tester B triple-clicked a template reference and typed over it, as in Word. The text spread across the Author / Title / Journal / Year fields, giving "2002., The TeXbook, H. Goldstein … 2002.". Fixing it took about 12 attempts.
  - **The grey placeholder text stays visible after typing.**
  - **A typed full stop is doubled.** The writer always adds a "." ([latex.js:255](../js/latex.js#L255)), so a user's own full stop gives "2002..".
- **Suggested fix:**
  - show the field boundaries (or a field label on focus);
  - hide a field's placeholder once it has text;
  - don't add a "." when the text already ends with one.

## Smaller problems (reported only)

| Problem | Reported by |
|---|---|
| Opening the Ctrl+K palette from inside an inline formula loses the caret. The symbol is inserted at the start of the paragraph and an empty formula is left behind. | C |
| Clicking the Accents tab of the symbol palette while editing a formula takes focus out of it ("Click into a formula or a paragraph first…"). | A |
| Triple-clicking a paragraph that contains an inline formula selects only part of it, so the replacement merges with the leftover text. | A, B |
| A mis-click on a reference row sent the next typing into the title, author and affiliation. Undoing three times fixed that but also emptied the bibliography entry being typed. | A |
| Backspace through a fraction or square root takes many presses and leaves an empty box at the end. | A, B |
| Ctrl+B does nothing inside a formula. Bold symbols are only in the Accents palette. | C |
| The chart editor's right-hand panel (domain, axes, legend) couldn't be scrolled at a 1024×640 window, so a tester couldn't set the plot range 0–10 or the axis labels. Possibly the test tool; worth checking at small heights. | A |
| Typing `in` straight after a letter doesn't make ∈ ("tin"). With a space first it works ([math.js:2024](../js/math.js#L2024)). | A |
| Theorem and Proof blocks show a "(title)" placeholder on the page. | A, C |
| The "Start writing" button in the first-run help is nearly invisible (cream on cream). | A |
| The "+ Add a block" button is very faint after a table. | C |
| The Outline panel leaves out References. | A |
| An inline "x(0)" gets extra space: "x (0)". | A |
| The table editor's label field was cut off at the bottom of its panel. Its scroll position jumped while typing the caption. | C |
| The left symbol palette needs a horizontal scrollbar at about 800 px wide, and the LaTeX panel is clipped. | B, C |

## Discoverability

- **Found only by accident or after a long hunt:**
  - the ⋮ block menu (label, numbering, Add a line, move);
  - clicking an equation's number to switch numbering off;
  - the Ctrl+K palette (Haiku took about 15 minutes; *[corrected]* low confidence, since Haiku's reports proved unreliable);
  - Tab moving through title → author → affiliation → date → abstract;
  - the "Abc" button for words inside maths;
  - that a reference entry is four fields;
  - that Esc from a formula can create a paragraph.
- **Looked for but never found:**
  - a footnote (it doesn't exist);
  - adding rows to cases or a matrix (it isn't connected to anything);
  - maths inside a proof (not supported);
  - a theorem-numbering setting;
  - labels for tables and figures;
  - a typed name for bold maths.
- **Words the Word user didn't understand:**
  - "gather" ("Centre each line (gather)");
  - "amsthm environment";
  - "enumerate", "itemize", "tabular", "thebibliography", "verbatim / lstlisting";
  - "Escape hatch" (the Raw LaTeX block);
  - "Escape" used as a verb for leaving a formula.

  LaTeX names are fine as search words, but the visible label should be the plain one ("Numbered list", "Centre each line").

## What worked well

Every tester mentioned these:

- The first-run help and the **? Shortcuts** dialog are short and accurate. They were the only reason the Word user could write formulas at all.
- Typing names (`alpha`, `omega0`, `sqrt`, `frac`, `matrix`, `cases`, `<=`, `+-`) is fast once learned.
- **Ctrl+Enter** for a display equation:
  - numbering is automatic;
  - references update when equations move;
  - Enter on a display equation makes a correct `align` with `&=` placed automatically.
- `$` for inline maths; Ctrl+B and Ctrl+I in text; the selection toolbar.
- The table editor:
  - live preview;
  - maths in cells;
  - a header-bold switch;
  - booktabs output.
- The bibliography block with italic titles, and ø typed straight into it.
- Autosave ("Saving…" → "Saved"), and undo covering every block deletion.
- **Compile PDF** finished in 4–7 s with no errors in every run that tried it. The first page matched the editor.
- The live LaTeX panel; testers A and C used it to check their work.

## Claims that turned out to be wrong

- ~~*"Bibliography titles aren't italic in the LaTeX"* (tester C). They are: the writer wraps them in `\emph{…}`.~~ *[corrected]* **C was right.** The writer does wrap the *Title* field in `\emph{…}` ([latex.js:251](../js/latex.js#L251)). But C had typed each whole entry into the *Journal / publisher* field, and the italics applied there were silently dropped. It happened again in round 2. This belongs under problem 13.
- *"`in` doesn't become ∈"* (tester A). It only fails straight after a letter; see the smaller problems.

## Problems caused by the test tools (left out of the findings)

- Screenshots timed out with "Browser pane not displayed" while other testers' tabs were in front, and were sometimes one action behind.
- Mouse-wheel scrolling was unreliable; testers scrolled to elements through the accessibility tree instead.
- The 1280×800 window size showed the page in a corner for two testers, who then worked at 800–1024 px wide. Layout complaints at narrow widths may be partly this.
- Haiku's view kept jumping to another tab; its own calls were probably missing the tab ID.
- The PDF read tool lacked `pdftoppm`; two testers rendered the PDF with PyMuPDF instead.

## Limits of this test

- **Compiled output wasn't checked past the top of page 1.** The PDF opens in an embedded viewer that the browser tool can't scroll or click. The table, figure, theorem, proof and reference list therefore went unchecked in the compiled PDF.
- **Image figures weren't tested**, because the tool can't upload files. Tester C left an empty figure block; tester A rebuilt the plot as a Function plot.
- **Only one real browser was used** (Chromium, in the Claude app's browser pane). Firefox and Safari weren't tested.
- **Only English keyboard input was simulated.** Problem 4 needs a manual check with a Turkish-Q or German layout and with the Win+. symbol panel.
- **The testers were AI agents, not people.**
  - They saw the page through screenshots scaled down to 800 px wide, so small text and icons were harder for them than for a person. Some mis-clicks on small toolbar icons came from this.
  - They never get tired. Each kept going well past the point where a real newcomer would probably have given up: B, the Word user, spent about 100 actions repairing formulas. The time costs above are therefore a lower bound on frustration, not an upper one.
  - They're also better than most people at reading help text closely. Real newcomers would probably find the Shortcuts dialog later, or not at all.
- **Four testers is a small sample.** "Hit by 3 of 3" means a problem is very likely; a problem only one tester reported may be rarer than it looks, or more common.

## Rerunning the test

1. **Start the server:** `python usability-test-2026-10-04/harness/serve.py`. It is also in `C:\dev2\.claude\launch.json` as `papertex-usertest`.
   - It serves this PaperTeX folder on ports 8800–8804 and 8811–8814, with one origin, and so one `localStorage`, per tester. Saved documents otherwise mix between testers.
   - Round 1 used 8801–8804 and round 2 used 8811–8814. Give a new round new ports (add them to `PORTS`), or its testers start with another tester's documents and without the first-run help.
   - This folder is served only on 8800; tester ports return 404 for it.
   - Also see the method fixes in [ROUND-2.md](ROUND-2.md#what-the-re-evaluation-says-about-the-test): a fixed pane size, PNG renders of the original, no Haiku tester, and the organiser compiling and scoring every final document.
2. **Use the prompts in [tester-prompts.md](tester-prompts.md),** one agent per port. Give each tester:
   - its own browser tab, passing its tab ID on every call;
   - the URL and [the test PDF](test-document/damped-oscillator.pdf);
   - no other information about the site.
3. **Decide whether to tell testers about problem 4.** If you don't, they'll find it again; the first rounds cost each Sonnet tester about 6 attempts. If you do, tell them to send formula input as individual key presses, not with the `type` action. Key names such as `dollar` or `bracketleft` don't work in the browser tool; send the literal characters `$`, `[`, `,`.
4. **Expect to stop at the PDF viewer.** The compiled PDF can't be scrolled by the agents. To check the output, have the tester use Export or Copy LaTeX instead, or check the compiled PDF yourself.
5. **To rebuild the test document:**
   - `python usability-test-2026-10-04/harness/make_figure.py` recomputes the table numbers and redraws `fig1.png`.
   - With the server running, open `http://localhost:8800/__lab/harness/make.html`. It compiles [damped-oscillator.tex](test-document/damped-oscillator.tex) three times with PaperTeX's engine and saves the PDF into `test-document/`.

## What's in this folder

| File | What it is |
|---|---|
| `REPORT.md` | This report (round 1) |
| [ROUND-2.md](ROUND-2.md) | The rerun after the fixes: scores, fixed and remaining problems, new blockers, corrections |
| [ROUND-3.md](ROUND-3.md) | The third run: three-round comparison, run-to-run variance, new structural bugs |
| `test-document/pages/` | PNG renders of the test PDF's pages, handed out from round 3 on |
| [scoring.md](scoring.md) | The 27-item checklist and every score, with reasons |
| [results/](results/) | Each final document from both rounds: generated `.tex`, the saved document (`.json`), and the compiled `.pdf` where it compiles |
| [tester-prompts.md](tester-prompts.md) | The exact instructions each tester got |
| [test-document/damped-oscillator.pdf](test-document/damped-oscillator.pdf) | The document the testers had to recreate |
| [test-document/damped-oscillator.tex](test-document/damped-oscillator.tex) | Its LaTeX source (testers never saw this) |
| [test-document/fig1.png](test-document/fig1.png) | The plot in Figure 1 |
| [harness/serve.py](harness/serve.py) | The multi-port test server |
| [harness/make.html](harness/make.html) | Compiles the test PDF with PaperTeX's own engine |
| [harness/make_figure.py](harness/make_figure.py) | Computes Table 1 and draws Figure 1 |

This folder isn't referenced by any page, so `tools/build-web.js` and the Electron build leave it out.
