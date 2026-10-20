# Fix check after round 4

**Date:** 8 October 2026, about 21:40.

**What was checked:** the PaperTeX working tree as it stood then. The fixes are uncommitted; the last edit to `math.js` was at 21:26. The site was served live on port 8840 (launch config `papertex-usertest-live`).

**How:** I typed each problem's case key by key, as a person would, in a fresh document. Then I read the generated LaTeX and compiled it. Problems marked "code" were checked in the source, not typed.

## Round 4's problems

| # | Problem | Typed | Result now | Status |
|---|---|---|---|---|
| 1 | `\left( … \right)` breaks the compile | `\left( a + b \right)` | `(a+b)`, compiles | **Fixed** |
| 2 | Unknown commands written straight into the LaTeX | `\mathbb R`, `\operatorname{rank} A` | `\mathbb{R}`, `\operatorname{rank}A` | **Fixed** (these now exist) |
| 3a | `\,` becomes a comma | `x_0\,e` | `x_{0}\,e` | **Fixed** |
| 3b | `^2x` puts `2x` in the exponent | `y^2x` | `y^{2}x` | **Fixed** |
| 3c | A hand-typed `\begin{cases}` isn't parsed | `\begin{cases} a & b \\ c & d \end{cases}` | A real cases display | **Fixed** |
| 4 | A full stop typed at the end lands inside the last box | `\omega_0.` / `x^2.` / `\sqrt{g^2-h^2}.` | `\omega_{0}.` / `x^{2}.` / `\sqrt{…}.` | **Fixed** |
| 4b | A dot accent swallows the rest of the equation | `\dot y = 1` | `\dot{y}=1` | **Fixed** |
| 5a | Backspace flattens a matrix | 2×2 matrix filled, then 6× Backspace | Still a 2×2 matrix, cells emptied | **Fixed** |
| 5b | Backspace past an empty equation merges it into the text | "Hello", empty equation, 3× Backspace | The equation is removed, then letters are deleted ("Hel"), as in a word processor | **Fixed** |
| 5c | Enter at the end of a cases display makes a stray equation or types into a heading | cases, then Enter, Enter, "ZZ" | No stray equation and no heading damage. But the second Enter adds an aligned line, so "ZZ" goes into the maths; Esc is still the way out | **Partly fixed** |
| 6 | Nothing can be typed in front of a matrix | matrix, then Home, `A =` | `A=\begin{pmatrix}…` | **Fixed** |
| 7 | "Table 1: Table 1:" caption | retyped the caption as "Table 1: Foo" | `\caption{Foo}` | **Fixed** |
| 7 | Doubled `&` | `a & = b`, Enter, `& = c` | A single `&` per line | **Fixed** |
| 7 | Space before an inline formula is lost | `word $x$` | `word $x$` | **Fixed** |
| 7 | `\cite` of an unknown key is silent | `\cite{newkey}` | An empty "newkey" entry appears in the reference list to fill in; it prints "[?]" until it is filled | **Fixed** |
| 7 | "1. " doesn't start a list | `1. One`, Enter, `Two`, Enter Enter, `- Bullet` | `enumerate` and `itemize` | **Fixed** |
| 7 | Deleting a heading leaves its text; no "insert above" | (code) | "Delete the section, with its text" and "Add a paragraph above" exist | **Present** (not clicked) |
| 7 | Jargon | (code + screen) | Toolbar now reads "Quick print", "Download .tex", "Make PDF" | **Fixed** |
| B's request | A hint for the caret state inside formulas | `x^2` in a new equation | A hint bar beside the formula: "Space · leave the power" | **Added** |
| 7 | First-run help dialog eats the first typing | fresh origin | No dialog opened | **Fixed** |

### Not re-checked

- **Tables:** Tab inside a formula cell. This needs the table editor.
- **Mouse clicks on rows in popup menus:** the notes say rows now choose on mousedown, but the test tools can't click reliably enough to check.
- **Ctrl+H for a footnote:** it depends on the browser.
- **A citation replacing the selected word.**

## Earlier rounds' problems, re-checked

| Problem | Result now |
|---|---|
| R1: Ctrl+A, Backspace deletes the equation | The equation is kept, empty |
| R1: `/` always makes a fraction | `k//m` gives `k/m` |
| R2: An empty equation breaks the compile | Left out of the LaTeX; compiles |
| R2: "≥" in text breaks the compile | `\ensuremath{\geq}` (also α); compiles |
| R3: Space inside a typed `{…}` | `\sqrt{a - b} + c` gives `\sqrt{a-b}+c` |
| R3: Ctrl+K "refer" lists "New: Article" | Only "References" is listed |
| R3: "+ reference" leaves the caret where it was | The caret is in the new entry's Author field |

## Regression check

- **Result:** all 18 final documents from rounds 1–4 compile under the current code.
- **Previously failing documents:**
  - round 1 D (empty equations);
  - round 2 D ("≥" in text);
  - round 4 B2 (stray `\right`).

  B2's document compiling means the new code also repairs documents that were saved with the bug.
- **How each was compiled:** opened on its own port and compiled with the editor's own engine (`PT.compile.run`).

## Verdict

Every confirmed round-4 problem I could test by typing is fixed, and so are the earlier rounds' problems re-checked here. One is only partly fixed: Enter twice at the end of a cases display still keeps you in the equation.

The next test round should run against this code once it's committed.
