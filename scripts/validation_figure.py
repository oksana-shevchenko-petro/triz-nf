"""Draw docs/validation.png from docs/validation.json (run scripts/validation_figure.js first)."""
import json, sys, pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "docs" / "validation.json").read_text(encoding="utf-8"))
BLUE, ORANGE, INK, MUTED, GRID = "#2a78d6", "#eb6834", "#0b0b0b", "#52514e", "#e1e0da"

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.6), dpi=150)
fig.patch.set_facecolor("#fcfcfb")
for ax in (ax1, ax2):
    ax.set_facecolor("#fcfcfb")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=9)
    ax.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)

# Panel 1: parity plot
b2, as3 = d["B2"], d["AS3"]
ax1.plot([0, 300], [0, 300], color=GRID, linewidth=1.2, zorder=1)
ax1.fill_between([0, 300], [0, 240], [0, 360], color=GRID, alpha=0.35, linewidth=0, zorder=0)
ax1.scatter([w["fact"] for w in b2["wells"]], [w["calc"] for w in b2["wells"]], s=60, color=BLUE, edgecolor="#fcfcfb", linewidth=1.5, zorder=3,
            label=f"B2, heavy oil, 6 wells, method B (KR = {b2['KR']:.2f}; mean error {b2['meanAbs']:.1f} %)")
ax1.scatter([w["fact"] for w in as3["wells"]], [w["calc"] for w in as3["wells"]], s=60, color=ORANGE, edgecolor="#fcfcfb", linewidth=1.5, zorder=3,
            label=f"AS3, 0.87 mD, 4 fractured wells, method A (A_eff = {as3['Aef']:.0f} m²; median error {as3['medAbs']:.0f} %)")
for w in b2["wells"] + as3["wells"]:
    ax1.annotate(w["name"], (w["fact"], w["calc"]), xytext=(5, 4), textcoords="offset points", fontsize=7.5, color=MUTED)
ax1.set_xlim(0, 300); ax1.set_ylim(0, 300)
ax1.set_xlabel("Measured rate, m³/d", color=MUTED); ax1.set_ylabel("Calculated rate, m³/d", color=MUTED)
ax1.set_title("Start rate: calculated vs measured (band: ±20 %)", fontsize=10.5, color=INK, loc="left")
ax1.legend(fontsize=7.5, frameon=False, loc="upper left")

# Panel 2: decline fit
dc = d["decline"]
ax2.scatter([p[0] for p in dc["points"]], [p[1] for p in dc["points"]], s=34, color=INK, zorder=3, label="Median oil rate, 83 wells (fig. 4.4)")
ax2.plot([p[0] for p in dc["curve"]], [p[1] for p in dc["curve"]], color=BLUE, linewidth=2, zorder=2,
         label=f"Eq. (4.26): φ = {dc['phi']:.2f}, τ = {dc['tau']:.0f} d")
ax2.set_ylim(0, 26)
ax2.set_xlabel("Days on production", color=MUTED); ax2.set_ylabel("Oil rate, t/d", color=MUTED)
ax2.set_title("Decline: two-parameter law fitted to field median", fontsize=10.5, color=INK, loc="left")
ax2.legend(fontsize=8, frameon=False)

fig.tight_layout()
out = root / "docs" / "validation.png"
fig.savefig(out, facecolor=fig.get_facecolor())
print(out)
