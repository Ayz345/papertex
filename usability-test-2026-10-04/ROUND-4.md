# Round 4: six testers, four models, and how it felt

**Date:** 8 October 2026, 20:25–21:30
**Previous rounds:** [REPORT.md](REPORT.md) (round 1), [ROUND-2.md](ROUND-2.md), [ROUND-3.md](ROUND-3.md)
**Scores:** [scoring.md](scoring.md)
**Final documents** (`.tex`, `.json`, compiled `.pdf`): [results/](results/), files `round4-*`
**Follow-up:** [VERIFICATION-2026-10-08.md](VERIFICATION-2026-10-08.md). The same evening, every problem below that could be tested by typing was found fixed in the working tree, except one partial (Enter twice at the end of a cases display). All 18 documents from rounds 1–4 now compile.

## Summary

| Tester | Model | Score | Own estimate | SUS (0–100) | Intuitive (1–10) |
|---|---|---|---|---|---|
| A, LaTeX veteran | Opus | **96%** | ~90% | 52.5 | 6 |
| A2, LaTeX veteran | Fable | **94%** | 90–95% | 55 | 6 |
| B, Word user | Sonnet | **94%** | 90–93% | 45 | 6 |
| C, keyboard-first | Sonnet | **91%** | 90–95% | 57.5 | 7 |
| B2, Word user | Haiku (latest) | **39%**, doesn't compile | ~50% | 30 | 4 |
| D, ordinary user | Haiku (latest) | **43%** | 45–50% | 32.5 | 4 |

1. **People can now do the whole job.** The four Sonnet, Opus and Fable testers all reached 91–96%, whatever their persona. A + B + C together: **94%**, the best of any round (round 1: 74%, round 2: 93%, round 3: 79%).
2. **But it doesn't feel easy.** The average System Usability Scale (SUS) score is **52.5** for those four and **31** for the two Haiku testers. The industry average is 68, and below 50 is usually read as "poor". Intuitiveness averaged 5.5/10. The testers succeed, but by learning what A2 called "a hidden second language": which LaTeX is honoured, when a space means "leave this box", and what Backspace and Tab do in each place. **Improving that feeling is now the main work, more than adding features.**
3. **One new compile-breaker.** Typing the common LaTeX `\left( … \right)` produces `((…\right))`, which fails with "Extra \right". B2's document doesn't compile because of it.
4. **The formula box is "almost LaTeX", and the gaps silently produce wrong maths.** All of these are confirmed:
   - `\,` becomes a comma.
   - `^2x` puts `2x` in the exponent.
   - A full stop typed at the end lands inside the last box (`\omega_{0.}`, `x^{2.}`, inside a root). It is in four of the six documents.
5. **The latest Haiku now reports honestly** (39% vs ~50%; 43% vs 45–50%), unlike the old one (7% vs 60–70%). It still gets only about half as far as the other models with the same budget, so its scores mostly measure the model. Its complaints are still real, and they are the ones a less patient person would make.

## What changed since round 3

- **Fixes.** The round-3 fixes were committed as `ce45ae0` on 5 October ("Usability fixes from three test rounds"):
  - proof membership;
  - Space no longer ends a typed `{…}`;
  - "+ reference" focus and keys;
  - Ctrl+K "New:" commands, which now match names only and ask first;
  - typing over a selection replaces it, which also fixed the chart range fields.
- **What was tested.** That commit was extracted (`git archive ce45ae0`) to a snapshot folder and served on ports 8831–8836. When round 4 started, another session had 187 uncommitted lines in progress in `js/math.js`, the formula editor. Testing the live folder would have mixed half-finished work into the results. So **round 4 tests the last commit, not your current working tree.**
- **A separate server.** Another chat had started an older copy of the test server at 20:17, and it holds port 8800. It was left running; round 4 used its own instance (organiser port 8830, `serve.py --only-snapshot`).

## Method changes (from round 3's suggestions)

| Change | Why |
|---|---|
| Six testers, four models; two runs for the LaTeX-veteran and Word-user personas | To measure variance and compare models |
| Budget raised to about 300 browser actions | Round 3's C ran out halfway |
| New report section 7, "How it felt": the 10-item SUS, intuitiveness 1–10, first five minutes, most lost / most pleased, comparison with the usual tool, would they use it again, one change | The user asked how intuitive the testers found it |
| Organiser tab kept on the organiser's own scratch document | Two testers still typed into it by mistake (B: 8 keystrokes); this time no tester's document was touched |
| Everything else as round 3 | Page images, 1280×800, fresh ports, organiser scoring and compiling |

**SUS scoring:** each odd item scores its rating minus 1; each even item scores 5 minus its rating. The sum times 2.5 gives 0–100. The testers answered in character, so this is a simulated SUS. Read it as a direction, not a benchmark.

## Results

### Task success

| Persona | Round 1 | Round 2 | Round 3 | Round 4 |
|---|---|---|---|---|
| LaTeX veteran | 78% | 98% | 89% | 96% (Opus), 94% (Fable) |
| Word user | 65% | 94% | 100%, 94% | 94% (Sonnet), 39% (Haiku) |
| Keyboard-first | 80% | 87% | 48% | 91% |
| Ordinary user (Haiku) | 7% | 17% | — | 43% |

### How it felt

Answers given in character.

| | A (Opus) | A2 (Fable) | B (Sonnet) | C (Sonnet) | B2 (Haiku) | D (Haiku) |
|---|---|---|---|---|---|---|
| SUS | 52.5 | 55 | 45 | 57.5 | 30 | 32.5 |
| Intuitive (1–10) | 6 | 6 | 6 | 7 | 4 | 4 |
| Would use it again | For figures and drafts, not a real paper | For problem sheets; not a 20-page paper yet | Yes, for maths-heavy work | Yes, for short documents | For short assignments | Maybe, for simple articles |
| Would recommend it | To Word-using classmates | To first-years who need a `.tex` | With a cheat sheet | To colleagues who dislike raw LaTeX | Only with warnings | Not yet |

What testers said:
- **On the core idea:** "The page-as-document idea is natural" (B). "Typing `omega0=sqrt` and seeing ω₀ = √ appear" was the moment it was most pleased.
- **On the maths box:** "the maths box is *almost* LaTeX. Every place where it isn't (`^2x`, `/`, `\left`, `\,`, `\cite`) ambushed me" (A, Opus).
- **On the hidden rules:** "a hidden second language I had to reverse-engineer" (A2, Fable).
- **On caret state:** "I was never sure whether a keystroke would do what I expected" (B).
- **What everyone liked:**
  - the proof block placing `\qedhere` itself;
  - the Function plot editor, which every tester that tried it called excellent;
  - the reference and citation pickers;
  - the clean, live LaTeX panel;
  - compiling in the browser.
- **Compared with their usual tool:**
  - The LaTeX users said it was about 1.5–2× slower than Overleaf for maths, but faster for figures, tables and references.
  - The Word users said it was slower at first, then "much easier for maths, numbering and references once learned".
- **The one change they asked for:**
  - A, A2: make the formula box accept real LaTeX, or show an error when it can't.
  - B: show the formula rules in context, e.g. a hint bar under the caret reading "Space = leave power · Esc = back to text · Tab = next cell".
  - C: make Tab and Esc consistent everywhere, and add "insert above".
  - B2: make Backspace safe in matrices and cases, and show a visible "Insert reference" button.
  - D: a way to clear a formula; deleting a heading should delete its section.

### Models

| Persona | Comparison |
|---|---|
| LaTeX veteran | Opus 96% vs Fable 94%: no real difference. Fable used far fewer tool calls (180 vs 685), because it batched its actions. |
| Word user | Sonnet 94% vs Haiku 39%. |

All the models reported similar action counts (about 270–345 by their own count), so the gap isn't the budget: Haiku gets much less done per action.

Haiku's self-estimates are now honest. The old Haiku claimed 60–70% and scored 7%.

### Effort

| Tester | Tool calls | Run time | Tokens |
|---|---|---|---|
| A (Opus) | 685 | 21.5 min | 407,245 |
| A2 (Fable) | 180 | 28.8 min | 404,047 |
| B (Sonnet) | 722 | 19.7 min | 421,189 |
| C (Sonnet) | 815 | 23.1 min | 470,393 |
| B2 (Haiku) | 365 | 10.9 min | 289,253 |
| D (Haiku) | 317 | 10.7 min | 279,939 |
| **Total** | **3,084** | **114.7 min of agent time, ~29 min wall clock** | **2,272,066** |

## Status of round 3's problems

| Round-3 problem | Round 4 |
|---|---|
| 1 Proof loses its equation | **Fixed.** All five documents with a proof have the derivation inside it with `\qedhere`. |
| 2 Space ends a typed `{…}` | **Fixed for braces.** Still true for *exponents* typed without braces: `^2x` and `e^lambda t`. That is new problem 3. |
| 3 "+ reference" focus | **Fixed** for the "+ New work…" path, which every tester used. C noted that Enter and Tab on "+ reference" do nothing. |
| 4 Ctrl+K "New: Article" | Not seen. C noted the palette's order still shifts between uses. |
| 5 Right arrow leaves only the innermost box | **Still reported** (B2), and now joined by the trailing-punctuation problem (new problem 4). |
| 6 `\text` cells in cases | **Better.** A, A2, B and C finished their cases displays. Spaces typed in cells still move to the next box (A2). |
| Tables: Tab inside a formula cell | **Still** (B, C; also round 3). |
| Inserting blocks after References; no "insert above" | **Still** (C; also round 3). |
| `$` and `/` typed in a burst | **Still seen by all six.** Probably the test setup. |
| First-run help appears late and eats the first typing | **Still** (B; also round 3). |

## New problems found in round 4

### 1. `\left( … \right)` breaks the compile

- **Status:** reproduced. Reported by A, A2 and B2; B2's document fails because of it.
- **What happens:** typing `\left( a+b \right)` in a formula gives `$((a+b\right))$`. `\left(` makes an auto-growing bracket pair, and `\right` is kept as an unknown literal command. The compile fails with "Extra \right. I'm ignoring a \right that had no matching \left."
- **Suggested fix:**
  - Treat typed `\left(`, `\left[` and `\left\{` as the bracket builder.
  - Make a following `\right)`, `\right]` or `\right\}` close it, or ignore it.
  - Never write a lone `\right` or `\left` into the LaTeX.

### 2. Unknown backslash commands are written straight into the LaTeX

- **Status:** confirmed in the documents. Reported by A, A2 and B2.
- **What happens:** `\mathsf`, `\right`, `\begin` and other commands the editor doesn't know show up in orange as literal text and are passed through as they are. Some are harmless, like `\mathsf T`; some break the compile, like `\right`.
- **Suggested fix:**
  - Show a clear "unknown command" mark.
  - Refuse to write unbalanced structural commands.
  - Add common ones: `\mathsf`, `\mathbb`/`\mathcal` (ℝ, 𝒞), `\operatorname`, `\overrightarrow`, `\qquad`.

### 3. Formula grammar that differs from LaTeX produces wrong maths silently

- **Status:** reproduced.

  | Typed | LaTeX would give | The editor gives |
  |---|---|---|
  | `y^2x` | y²x | `y^{2x}` |
  | `x_0\,e` (thin space) | x₀ e | `x_{0},e` (a comma) |
  | `e^lambda t` | `e^{\lambda}t` | the same, `e^{\lambda}t`, because Space leaves the exponent; the writer meant e^{λt}. B's document has this twice. |
  | `\begin{cases} … & … \\` typed by hand | a cases display | not parsed (A2). Pasted LaTeX is parsed. |

- **Why it matters:** these are the reflexes of anyone who knows LaTeX. They produce no error and only show in the PDF.
- **Suggested fix:**
  - `\,`, `\;`, `\:`, `\!` as real spaces.
  - After `^` or `_`, a single digit followed by a letter ends the script, as LaTeX does. The editor already has this "soft" behaviour for automatic subscripts like `x1`.
  - Parse typed `\begin{…}`/`\end{…}` the way pasted LaTeX is parsed.

### 4. Punctuation typed at the end of an expression lands inside the last box

- **Status:** confirmed in four of six documents.
- **What happens:**
  - `\omega_{0.}` in the cases display (A, A2, B2);
  - `\dot{x}^{2.}` at the end of the derivation (A2, C);
  - `\sqrt{\gamma^2-\omega_0^2.}` (C);
  - a dot accent that took the whole rest of equation (5): `\dot{\mathbf{y}=\begin{pmatrix}…\mathbf{y}.}` (C).
- **Suggested fix:**
  - Let `,`, `.`, `;` typed at the end of a script, root or accent leave the box first.
  - At minimum, highlight the active box so this is visible.

### 5. Backspace and Enter take apart structures

- **Status:** reported by B2, A2 and D; partly confirmed in documents.
- **What happens:**
  - Backspace inside a cases cell or a matrix flattens it into one line or one row (B2, twice).
  - Backspacing past an empty equation deletes it and eats into the paragraph above (A2).
  - Backspace in an equation merged it into the paragraph above as literal text (D).
  - Enter in the last row of a cases display made a stray equation, and the following text went into a section heading (A2, D).
- **Undo:** Ctrl+Z repaired every case, but D's undo also rolled back earlier edits.
- **Suggested fix:**
  - Backspace in an empty cell moves to the previous cell.
  - Backspace in an empty structure removes only that structure.
  - Never merge an equation into prose.

### 6. Nothing can be typed beside a matrix or cases brace

- **Status:** reported (B2, A2).
- **What happens:** Home, then Left, put the caret into the first cell, so "regime =" or "ẏ =" couldn't be typed in front of the brace.
- **Suggested fix:** allow a caret position before and after a structure, and let Home and End reach it.

### 7. Smaller problems

| Problem | Status / reported by |
|---|---|
| A table caption's "Table 1:" label isn't part of the text, so retyping it gives "Table 1: Table 1: …" | Confirmed in D's document |
| Inserting a cross-reference adds the word "Figure"/"Table" itself, so text that already says "Figure 1" becomes "Figure 1 Figure 1" | A2 |
| An `&` typed in an aligned line is doubled with the automatic one (`\frac{dE}{dt}& &=`) | Confirmed in A's document |
| A space before an inline formula is collapsed ("equation$\lambda…$") | Confirmed in C's document |
| `\cite{newkey}` for a reference that doesn't exist is accepted silently and prints "[?]" | Reproduced |
| Picking a citation replaces the selected word | B2 |
| Deleting a heading leaves its section's text; deleting a figure leaves "Figure ??" | D, C |
| Typing "1. " doesn't start a numbered list | A |
| Ctrl+H (footnote, as listed in the help) didn't work in the test browser; Chrome may intercept it for History | C, unverified |
| Mouse clicks on rows in popup menus sometimes did nothing; the keyboard always worked | B, three times; possibly the test setup |
| The help dialog's sentence about typing a plain slash is cut off | A2; also round 2 |
| Jargon: "Block", "slot", "numerator", "pgfplots", "TikZ", "Recognise typed names", "Label", "Works cited", the "eq:name" field, "Compile PDF" vs "Print" vs "Export .tex" | B, B2 |

### Not reproduced

| Claim | Finding |
|---|---|
| `$` does nothing (A2) | It opens a formula, for me and for the other five testers. |
| `\cite{…}` and `\emph{…}` typed in text stay literal (A, A2) | Both convert when typed key by key. Their failures were probably burst typing. |

## What round 4 says

The product now *works* for anyone persistent. Four different strong models, playing three personas, all got above 90%. It doesn't yet *feel* intuitive: the SUS is about 52, and every tester described learning hidden rules. Almost all the remaining friction is in one place: **the formula box's input grammar and caret model.** Specifically:
- which LaTeX it honours (problems 1–3);
- where the caret goes after a box ends (problem 4);
- what Backspace, Tab and Enter do at structure edges (problems 5–6).

A short list would move both the score and the feeling:
1. Make `\left`/`\right` and `\,` work.
2. Make `^2x` and trailing punctuation behave like LaTeX.
3. Make Backspace safe at structure edges.
4. Add a caret-position hint inside formulas.
5. Add a caret position beside a brace.

All of these are in `js/math.js`, which another session was changing during this run. It is worth checking whether that work already covers some of them before starting.

## Limits

- **Simulated SUS.** The ratings are AI testers answering in character, not people.
- **Committed snapshot.** Round 4 tested `ce45ae0`, not the current working tree.
- **Models and personas are mixed.** The Haiku runs mostly measure the model.
- **Compiled output.** As in every round, the testers couldn't scroll the compiled PDF. I compiled every document myself; five of six compile.
