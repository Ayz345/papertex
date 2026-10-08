"""Numbers for Table 1 and the plot in Figure 1 of the test document.

Integrates x'' + 2*gamma*x' + omega0^2 x = 0 (gamma = 0.2, omega0 = 2,
x(0) = 1, x'(0) = 0) on [0, 10] with explicit Euler and RK4, prints the
largest absolute error against the exact solution for h = 0.1, 0.05, 0.025,
and draws test-document/fig1.png.  Needs numpy and matplotlib.
"""
import math, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

g, w0, x0 = 0.2, 2.0, 1.0
wd = math.sqrt(w0 * w0 - g * g)


def exact(t):
    return x0 * math.exp(-g * t) * (math.cos(wd * t) + g / wd * math.sin(wd * t))


def f(y):
    return (y[1], -2 * g * y[1] - w0 * w0 * y[0])


def max_error(h, method):
    y, err = (x0, 0.0), 0.0
    for i in range(round(10 / h)):
        if method == 'euler':
            d = f(y)
            y = (y[0] + h * d[0], y[1] + h * d[1])
        else:
            k1 = f(y)
            k2 = f((y[0] + h / 2 * k1[0], y[1] + h / 2 * k1[1]))
            k3 = f((y[0] + h / 2 * k2[0], y[1] + h / 2 * k2[1]))
            k4 = f((y[0] + h * k3[0], y[1] + h * k3[1]))
            y = (y[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
                 y[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]))
        err = max(err, abs(y[0] - exact((i + 1) * h)))
    return err


for h in (0.1, 0.05, 0.025):
    print('h=%-6g  Euler %.2e   RK4 %.2e' % (h, max_error(h, 'euler'), max_error(h, 'rk4')))

plt.rcParams.update({'font.family': 'serif', 'mathtext.fontset': 'cm',
                     'font.serif': ['CMU Serif', 'DejaVu Serif'], 'font.size': 10,
                     'axes.unicode_minus': False})
t = np.linspace(0, 10, 800)
fig, ax = plt.subplots(figsize=(4.6, 2.6), dpi=200)
ax.plot(t, [exact(s) for s in t], color='#1f4e9c', lw=1.4, label=r'$x(t)$')
ax.plot(t, np.exp(-g * t), '--', color='#b23a3a', lw=1, label=r'$\pm e^{-\gamma t}$')
ax.plot(t, -np.exp(-g * t), '--', color='#b23a3a', lw=1)
ax.axhline(0, color='0.6', lw=0.5)
ax.set_xlabel(r'$t$'); ax.set_ylabel(r'$x$')
ax.set_xlim(0, 10); ax.set_ylim(-1.1, 1.1)
ax.legend(loc='upper right', frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test-document', 'fig1.png'))
