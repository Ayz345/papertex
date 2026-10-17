# Round 5: scoring sheet

Each tester's final document is scored on 18 items, written before any results came in. Scores come from the document the tester left in their browser storage. It was archived afterwards from each tester's own origin: the saved `.json`, the `.tex` PaperTeX writes from it, and the compiled PDF are in [results/](results/).

**Scale:** 1 when the item is there and matches Mira's pages; 0.5 when it is there but visibly differs, or is only partly done; 0 when it is missing, or plain text where structure was needed.

## Checklist

| # | Item | Scores 1 when |
|---|---|---|
| 1 | Title | exactly "Heat Conduction in a Thin Rod: Steady State and Stability" |
| 2 | Second author | Sam Rivera with "Department of Mathematics, Lakeside University" as their own affiliation, Mira unchanged |
| 3 | New sentence | "As t → ∞ the temperature settles to the steady state", with t → ∞ as maths, between the boundary conditions and the theorem |
| 4 | Equation (4) | u_s(x) = T_0 + (T_1 − T_0) x/L, with a real fraction, a display equation, numbered (4) |
| 5 | Live reference to (4) | "(4)" in Results is a `\eqref`/`\ref` to the new equation |
| 6 | Table typo | 0.05 → 3.19 |
| 7 | Table row | 0.0125, 0.20 as a last row, in the table |
| 8 | Caption | the new caption, with t as maths (0.5 if t is plain text) |
| 9 | Discussion section | a section "Discussion", numbered 4, after Results and before the references |
| 10 | Discussion text | the paragraph, with Δx² as maths and the en dash in Crank–Nicolson |
| 11 | Crank citation | a live `\cite{crank1975}`, with Crank as reference [3], filled in (not an empty entry) |
| 12 | Footnote | a real `\footnote` with its text |
| 13 | Discussion list | two bullet items, with r > 0, Δt and Δx as maths |
| 14 | Imported equations | (1)–(3) still there, numbered, and the align still aligned |
| 15 | Theorem and proof | still a theorem and a proof, with the □ |
| 16 | Figure | still has its image, and the label still works ("Figure 1") |
| 17 | Citations [1] [2] and the reference list | still live, entries filled in |
| 18 | Compiles | PaperTeX's own compile gives a PDF |

## Scores

| # | A | A2 | B | B2 | C | D |
|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 2 | 1 | 1 | 1 | 1 | 1 | 1 |
| 3 | 1 | 1 | 1 | 1 | 1 | 1 |
| 4 | 1 | 1 | 1 | 1 | 1 | 0.5 |
| 5 | 1 | 1 | 1 | 1 | 1 | 1 |
| 6 | 1 | 1 | 1 | 1 | 1 | 1 |
| 7 | 1 | 1 | 1 | 1 | 1 | 1 |
| 8 | 1 | 1 | 1 | 1 | 1 | 1 |
| 9 | 1 | 1 | 1 | 1 | 1 | 1 |
| 10 | 1 | 1 | 1 | 1 | 1 | 0.5 |
| 11 | 1 | 1 | 1 | 1 | 1 | 0.5 |
| 12 | 1 | 1 | 1 | 1 | 1 | 1 |
| 13 | 1 | 1 | 1 | 1 | 1 | 1 |
| 14 | 1 | 1 | 1 | 1 | 1 | 1 |
| 15 | 1 | 1 | 1 | 1 | 1 | 1 |
| 16 | 1 | 1 | 1 | 1 | 1 | 1 |
| 17 | 1 | 1 | 1 | 1 | 1 | 1 |
| 18 | 1 | 1 | 1 | 1 | 1 | 1 |
| **Total** | **18** | **18** | **18** | **18** | **18** | **16.5** |

The notes behind each score are in results/round5-*.score.txt.
