# Tester instructions

Each tester was a separate AI agent. Its only instruction was the prompt below; nothing else about PaperTeX was given. Three ran on Claude Sonnet 5.5 and one on Claude Haiku 4.5, all as general-purpose agents.

Round 2 used exactly the same four prompts; only the URL changed, to ports 8811–8814.

Round 3 (5 October 2026) made these changes, all to fix test problems found in round 2. The task, the personas and the report format are unchanged.

- **Testers.** Four Sonnet testers: A on 8821, B on 8822, C on 8823, and **B2**, a second Word user with B's prompt word for word, on 8824. B2 replaces the Haiku tester, whose reports proved unreliable, and measures how much one persona varies between runs.
- **Handout.** It became a folder: the PDF plus `page-1.png` … `page-3.png`, rendered at 110 dpi with PyMuPDF, and copied to `test-document/pages/`. The task says: "Look at the page images with the Read tool (that's the easiest way to see the document as it looks)". The subagents' PDF reader can't render pages, and in round 2 one tester read only extracted text and lost the Greek letters.
- **Window.** Step 2 became: "… once so the page is laid out like a laptop screen, and work at that size the whole time. Screenshots then come back in an 800x500 coordinate frame — always click using that frame's coordinates. If a screenshot ever comes back in a different frame, call resize_window with 1280x800 again before carrying on." In round 2 the pane had shrunk and testers worked at three different sizes. With the pane hidden, 1280×800 renders reliably into an 800×500 frame.
- **File rule.** "Except the PDF below" became "except the handout below".

Round 4 (8 October 2026) kept round 3's prompts, with these changes:

- **Testers and models.** Six testers on four models, so most personas have two runs, on different models:

  | Port | Persona | Model |
  |---|---|---|
  | 8831 | A, LaTeX veteran | Opus |
  | 8832 | A2, LaTeX veteran | Fable |
  | 8833 | B, Word user | Sonnet |
  | 8834 | B2, Word user | Haiku (latest) |
  | 8835 | C, keyboard-first | Sonnet |
  | 8836 | D, ordinary user (round 1–2 wording) | Haiku (latest) |

- **Budget.** Raised from about 200 to about 300 browser actions.
- **Tab ID rule.** Step 1 adds: "including inside browser_batch — a call without it acts on someone else's tab".
- **New report section 7, "How it felt".** Answered in character:
  - a. the 10-item System Usability Scale, each item 1–5;
  - b. intuitiveness from 1 to 10;
  - c. the first five minutes;
  - d. the moment most lost and the moment most pleased;
  - e. a comparison with the tester's usual tool;
  - f. whether they would use it again and recommend it;
  - g. the one change they would make.
- **Snapshot.** Testers used commit `ce45ae0`, extracted to a snapshot folder and served on ports 8831–8836 (`serve.py --only-snapshot --org-port 8830 --snapshot …`). Another session had uncommitted changes in progress in `math.js`.

The four prompts share one template. `{…}` marks the parts that differed; the differences are listed after the template.

## Shared template

```text
You are taking part in a usability test of a website. Behave like a real person using it for the first time.

WHO YOU ARE: {PERSONA}

## Tooling setup (not part of the test)
- The site is at {URL} — start on that home page. That is the only URL you may use.
- Use the built-in browser tools (mcp__Claude_Browser__*). Other testers are driving the same browser at the same time in other tabs, so:
  1. First call mcp__Claude_Browser__tabs_create to get your own tab, then navigate it. Pass that tabId on EVERY browser call. Never select, navigate, resize or close any other tab.
  2. Call mcp__Claude_Browser__resize_window with {width:1280, height:800, tabId} once so the page is laid out like a laptop screen. Screenshots then come back in a scaled coordinate frame (each result states it, e.g. "coordinate frame: 800x500") — always click using that frame's coordinates, not the pixel size of a downscaled image. If the frame size changes unexpectedly, call resize_window again.
  3. Never call preview_start, preview_stop or tabs_select. Close your own tab (tabs_close with your tabId) at the very end.
- Interact like a human: screenshots, clicks, typing, key presses, scrolling, hovering. read_page / find / get_page_text count as "looking at the screen" and are fine. Do NOT use javascript_tool, do not read any file on disk except the PDF below, do not look at the site's source code, and do not fetch the site with curl or WebFetch. If something can only be found through the accessibility tree and you can't see it on screen, that is itself a finding.
- The `zoom` action isn't supported here; take a screenshot at scale 1 when you need detail.
- You cannot upload files from disk in this browser (tool limitation) — don't report that as a site bug.{EXTRA TOOL NOTE}
- If a file download gets triggered, don't chase it; just note what happened.

## The task
{SENDER} sent you this PDF: <path to damped-oscillator.pdf>
Read it with the Read tool (3 pages). Recreate it on this website as faithfully as you can: title block, abstract, sections, all the maths with its numbering, the theorem and proof, footnote, lists, table, figure, citations and references. Nobody has told you how the website works — figure it out the way a person would (look around, hover, read whatever help the site offers).{EXTRA TASK}

When you think you're done (or have run out of reasonable effort), check the result the way a user would — if the site can produce a PDF or otherwise show the output, look at it and compare it with the original.

Budget: roughly 200 browser actions. If you spend ~10 attempts on one element without success, write it down and move on — a real user would give up on it and do something else.

## Your final report (this is what matters — be concrete and specific)
1. Coverage — one line per element: done / partly / gave up, and how you made it. Elements: title; author + affiliation; date; abstract; section headings; inline maths; numbered display equations (1)–(5); the cases display; the matrix; theorem; proof with its end-of-proof square and the two-line aligned derivation; footnote; citations [1] [2] and the reference list; cross-references "(2)", "Table 1", "Figure 1"; numbered list; bulleted list; bold / italic text; table with caption; figure with caption; special characters (ø in Nørsett, the en dash in Runge–Kutta).
2. Problems — every friction point, most severe first. For each: what you were trying to do · exactly what you did (keys / clicks) · what happened · what you expected · severity (blocker / major / minor / cosmetic) · workaround found? · roughly how many attempts it took.{EXTRA PROBLEMS}
3. Discoverability — things you only found by accident or after a long hunt; things you never found but suspect exist.{EXTRA DISCOVERABILITY}
4. What worked well — short.
5. Suspected tooling artefacts — anything you think was caused by the test harness rather than the site (input not arriving, stale screenshots, etc.), kept separate from the real problems.
6. Final state — how close your document is to the original (rough %), and what the output check showed.
```

## What differed per tester

### A: LaTeX veteran (Sonnet, `http://localhost:8801/`)

- **PERSONA:** "a physics PhD student who has written LaTeX every day for five years. You're sceptical of visual editors, and you'll naturally reach for LaTeX habits (typing \frac, $...$, \begin{...}, \cite, \label/\ref, \emph, etc.) and expect them to work."
- **SENDER:** "A colleague"
- No extras.

### B: Word user (Sonnet, `http://localhost:8802/`)

- **PERSONA:** "a second-year undergraduate who has never used LaTeX. You write everything in Word and Google Docs. You rely on toolbars, menus, right-click and visible buttons, and jargon you don't know confuses you (say so when it does). You would not think to type backslash commands unless the site teaches you to."
- **SENDER:** "Your lab partner"
- **EXTRA DISCOVERABILITY:** "Also: any words or labels in the interface you didn't understand."

### C: Keyboard-first user (Sonnet, `http://localhost:8803/`)

- **PERSONA:** "a fast, keyboard-first engineer. You avoid the mouse when you can: you look for shortcuts and command palettes, and you lean on Enter, Tab, Shift+Tab, arrow keys, Backspace at the start of things, Ctrl+Z / Ctrl+Shift+Z, Ctrl+B / Ctrl+I, Ctrl+A, and copy/cut/paste within the page. You notice when the caret ends up somewhere unexpected or when focus gets lost."
- **SENDER:** "A co-author"
- **EXTRA TOOL NOTE:** the clipboard can't be filled from outside the page, so "copy/paste of content already on the page is fair game".
- **EXTRA TASK:** "Make at least a couple of mistakes on purpose and fix them (undo, delete a block, move something) the way people do while writing."
- **EXTRA PROBLEMS:** "Call out anything that could lose a user's work."
- **EXTRA DISCOVERABILITY:** "shortcuts you expected that didn't exist."

### D: Ordinary user (Haiku, `http://localhost:8804/`)

- **No persona.** The opening line read "Behave like an ordinary person using it for the first time".
- **SENDER:** "Someone"
- **Shorter tooling rules:** the sentence about the accessibility tree was left out.
