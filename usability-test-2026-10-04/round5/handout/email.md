**From:** Mira Castellanos
**To:** Sam Rivera
**Subject:** Rod paper: can you finish it?

Hi Sam,

I started our rod paper on Overleaf, and you said you'd moved it into PaperTeX on your computer. It's open there now. Could you finish it? Here's what's left:

1. **New title:** *Heat Conduction in a Thin Rod: Steady State and Stability*
2. **Add yourself as second author:** Sam Rivera, Department of Mathematics, Lakeside University.
3. **Section 2 (Model):** after the boundary conditions and before the theorem, add this sentence: "As t → ∞ the temperature settles to the steady state". Follow it with the steady state as a new numbered equation,

   u_s(x) = T_0 + (T_1 − T_0) x / L

   with x/L written as a proper fraction. It should come out as equation (4).
4. **Section 3 (Results):** the sentence "Figure 1 shows how the temperature approaches the steady state" should say "…approaches the steady state (4)". Make the (4) a real reference to the new equation, so its number stays right if things move.
5. **Table 1:**
   - The error for Δx = 0.05 is a typo: it should be **3.19**, not 3.91.
   - Add a last row: Δx = 0.0125, error 0.20.
6. **Figure 1 caption:** *Temperature along the rod at t = 0, 0.02, 0.05 and 0.2, with the steady state.*
7. **A new section, "Discussion",** after Results and before the references. I wrote it already in LaTeX, so here it is:

```latex
\section{Discussion}
The explicit scheme is simple, but its time step must shrink like $\Delta x^2$,
which makes fine grids expensive. Implicit schemes such as Crank--Nicolson
\cite{crank1975} avoid this limit:\footnote{At the cost of solving a tridiagonal system at every step.}
\begin{itemize}
  \item they are stable for every $r > 0$, and
  \item they are second-order accurate in both $\Delta t$ and $\Delta x$.
\end{itemize}
```

   The Crank reference is already in our .bib, so it should appear in the references once cited.

Please make the PDF at the end and check that it looks right. The attached pages show what it should look like.

Thanks!
Mira
