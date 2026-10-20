# Round 5 · B · Word user · Sonnet · port 8853 (about 135 browser actions)

Harness note from the tester: only one tab could be created, so the email and the site shared it; the pane was hidden most of the time (screenshots needed 1–3 retries, scrolling did nothing); the PDF viewer couldn't be scrolled or clicked.

## 1. Coverage
1. Title: done (triple-click and type).
2. Second author: done. Hovering under the author name showed a faint "+ author"; typed the name, Tab, the affiliation.
3. Sentence + equation (4): done after a struggle. "+" → Paragraph; "As ", then "$", "t->inf", Space gave t → ∞; Esc left the formula. Ctrl+Enter gave a display equation, numbered (4) automatically. See problem 1 for the fraction.
4. Live "(4)": done. Caret before the full stop, a space, Ctrl+K → "reference" → Enter; a picker listed (1)–(4), Table 1, Figure 1 and the sections.
5. Table: done (double-click 3.91, type 3.19; "+ row" on hover; Tab between cells).
6. Caption: done, with t as a real formula.
7. Discussion: done, by hand. **Pasting Mira's LaTeX onto the page did nothing (twice, no message).** Rebuilt it from blocks: "/" → Section; the paragraph with "$Delta x^2"; Ctrl+K "cite" — **Crank was not in the list** (only Carslaw and Smith), so "+ New work…" and typed it in; Ctrl+K "footnote"; "+" → bulleted list.

## 2. Problems, most severe first
- P1 Fraction (major, about 8 attempts, about 25 actions): "/" grabbed "(T1−T0)x" as the numerator; Backspace left a half-fraction; the palette's Fraction button grabbed "(T1−T0)"; Space before it didn't help. Workaround: retype the formula with the fraction last ("u_s(x)=T_0+x/L"), Left five times, then type "(T_1-T_0)". "No normal user would find this."
- P2 Space and Esc inside formulas (minor to major for beginners): "inf" stayed italic until Space; a subscript stays open until Space, and the hint appears only after typing; Esc from a display equation also adds an empty paragraph.
- P3 Crank not available (major, confusing): the email says it's already in the .bib; the cite picker listed only Carslaw and Smith; the new key is "ref3", not "crank1975".
- P4 Pasting Mira's LaTeX did nothing (major for the intended workflow; possibly the harness): selected the code block in the email, copied, navigated to the editor, an empty paragraph, Ctrl+V twice, nothing.
- P5 Typing "/section" in one go left the literal text; "/" alone, then picking, worked.
- P6 "+" and "⋮" nearly invisible until hover; hard to tell which block a "+" belongs to.
- P7 "Footnote" is listed as an "Insert block" but inserts an inline mark (confusing label).

## 3. Discoverability
- Found the paper in "Continue where you left off" (via the accessibility tree; the hero looked blank in screenshots).
- Mira's LaTeX: tried to paste onto the page, failed, retyped it with blocks. Noticed the LaTeX pane and that it updates live; did NOT type into it ("A Word user would not edit it unprompted").
- Found through the help: Ctrl+K, "$", Ctrl+Enter, Esc and Space in formulas.
- Unclear words: "Insert block", "Index" (for subscript), "caret", "Esc: done", "LaTeX pane", "Outline", "Document class", "Extra preamble", "Compile", "typeset". "Make PDF" and "Quick print" were fine.

## 4. What worked well
The "? Shortcuts" help; the reference picker and live "(4)"; table rows; editing title, authors and caption on the page; previews in the reference and citation menus; the "Saved" indicator; the PDF in about 10 s.

## 6. Final state
About 90–95%; all 7 items done. PDF: 2 pages, 274 kB, 10.3 s; only page 1's top half and the thumbnails could be checked.

## 7. How it felt
- a. SUS: 3, 3, 3, 3, 4, 3, 3, 3, 3, 4.
- b. Intuitive: 6/10. "Direct editing is great, but the formula box has hidden rules."
- d. Most lost: the x/L fraction grabbing "(T1−T0)x", and Esc's empty paragraph. Most pleased: choosing "(4)" from the picker; the PDF in 10 seconds.
- e. Better than Word for equations and cross-references; worse for visible, discoverable controls.
- f. Would use it again with the help open; would recommend it with "read the Shortcuts help first".
- g. One change: a fraction that applies only to what you select or the last token, with a visible hint; and a cite picker that offers the .bib's entries.
