"""Numbers for Table 1 and the plot in Figure 1 of round 5's paper.

The heat equation u_t = alpha u_xx on 0 < x < L with u(0) = T0, u(L) = T1
and u(x, 0) = steady state + A sin(pi x / L), whose exact solution is
u = u_s + A exp(-alpha pi^2 t / L^2) sin(pi x / L). The explicit
(forward-time, centred-space) scheme with r = alpha dt / dx^2 = 0.4 is run
to t = 0.1 for several dx; the table is the largest error. Draws
round5/project/figures/profile.png. Needs numpy and matplotlib.
"""
import math, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

alpha, L, T0, T1, A, tend, r = 1.0, 1.0, 20.0, 80.0, 30.0, 0.1, 0.4
here = os.path.dirname(os.path.abspath(__file__))


def steady(x):
    return T0 + (T1 - T0) * x / L


def exact(x, t):
    return steady(x) + A * math.exp(-alpha * math.pi ** 2 * t / L ** 2) * np.sin(math.pi * x / L)


def run(dx):
    n = int(round(L / dx))
    x = np.linspace(0, L, n + 1)
    dt = r * dx * dx / alpha
    steps = int(round(tend / dt))
    u = exact(x, 0.0)
    for _ in range(steps):
        u[1:-1] = u[1:-1] + r * (u[2:] - 2 * u[1:-1] + u[:-2])
    return x, u, steps * dt


for dx in (0.1, 0.05, 0.025, 0.0125):
    x, u, t = run(dx)
    print('dx = %-7g max error at t = %.3f: %.4f' % (dx, t, np.max(np.abs(u - exact(x, t)))))

xs = np.linspace(0, L, 201)
plt.figure(figsize=(5.2, 3.2), dpi=150)
for t, style in ((0.0, '-'), (0.02, '--'), (0.05, '-.'), (0.2, ':')):
    plt.plot(xs, exact(xs, t), style, color='black', lw=1.2, label='t = %g' % t)
plt.plot(xs, steady(xs), color='0.55', lw=2.4, alpha=0.6, label='steady state')
plt.xlabel('position x'); plt.ylabel('temperature u'); plt.legend(frameon=False, fontsize=8)
plt.tight_layout()
out = os.path.join(here, 'project', 'figures', 'profile.png')
os.makedirs(os.path.dirname(out), exist_ok=True)
plt.savefig(out)
print('wrote', out)
