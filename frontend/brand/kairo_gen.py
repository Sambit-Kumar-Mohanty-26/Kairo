"""Generates the Kairo mark from measurements taken off the reference artwork
(ref_19.png). Everything is computed in reference pixels, then mapped into a
32x32 viewBox. Run: python kairo_gen.py"""
import math, numpy as np, cv2

# ---------------------------------------------------------------- measured
# Shield stroke centreline, fitted to the artwork (shield_fit.py): the flanks
# are dead vertical, the shoulders straight, the bottom one cubic per side.
CX, APEX, TIP = 386.5, 79.09, 414.50
FX, SHOULD, STRAIGHT = 253.50, 127.31, 264.0
C1, C2 = (254.34, 318.69), (316.14, 394.07)
STROKE = 8.0
OUT_T = APEX - (STROKE / 2) / math.sin(math.radians(70.3))   # mitred apex
OUT_B = TIP + (STROKE / 2) / math.sin(math.radians(74.0))    # mitred tip
OUT_L = FX - STROKE / 2

CAP, BASE = 154.5, 326.5                # the K's cap line and baseline
SX0, SX1, SR = 311.0, 351.5, 5.0        # stem: left, right, corner radius
NODE, R_NODE, R_RING = (353.3, 242.9), 17.0, 23.3
TH = math.radians(46.9)                 # arm angle off horizontal
UP0, UP1 = 420.0, 468.0                 # blade terminal, along the cap line
DN0, DN1 = 418.5, 465.5                 # leg terminal, along the baseline
NOTCH = 7.4                             # half-height of the flat inner cut

# --------------------------------------------------------------- mapping
K = 30.0 / (OUT_B - OUT_T)              # mark height -> 30 of 32 units
OX = (32 - 2 * (CX - OUT_L) * K) / 2
M = lambda p: ((p[0] - OUT_L) * K + OX, (p[1] - OUT_T) * K + 1.0)
f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
P = lambda p: f"{f(M(p)[0])} {f(M(p)[1])}"

def ray_circle(p, d, c, r, far=True):
    """Where the ray p+t*d meets circle (c,r); far=the larger t."""
    px, py = p[0] - c[0], p[1] - c[1]
    b = 2 * (px * d[0] + py * d[1]); a = 1.0
    disc = b * b - 4 * (px * px + py * py - r * r)
    t = (-b + math.sqrt(disc)) / 2 if far else (-b - math.sqrt(disc)) / 2
    return (p[0] + t * d[0], p[1] + t * d[1])

def arc(a, b, r, cen):
    """Arc command from a to b on circle (cen,r), short way round."""
    ang = lambda p: math.atan2(p[1] - cen[1], p[0] - cen[0])
    d = (ang(b) - ang(a)) % (2 * math.pi)
    sweep = 1 if d < math.pi else 0
    return f"A{f(r*K)} {f(r*K)} 0 0 {sweep} {P(b)}"

# ------------------------------------------------------------------ shield
mir = lambda p: (2 * CX - p[0], p[1])
SHIELD = (f"M{P((CX,APEX))}L{P((FX,SHOULD))}L{P((FX,STRAIGHT))}"
          f"C{P(C1)} {P(C2)} {P((CX,TIP))}"
          f"C{P(mir(C2))} {P(mir(C1))} {P(mir((FX,STRAIGHT)))}"
          f"L{P(mir((FX,SHOULD)))}Z")

# -------------------------------------------------------------------- stem
r = SR * K
x0, y0 = M((SX0, CAP)); x1, y1 = M((SX1, BASE))
top_in, bot_in = ray_circle((SX1, CAP), (0, 1), NODE, R_RING, False), \
                 ray_circle((SX1, BASE), (0, -1), NODE, R_RING, False)
STEM = (f"M{f(x0+r)} {f(y0)}L{f(x1-r)} {f(y0)}A{f(r)} {f(r)} 0 0 1 {f(x1)} {f(y0+r)}"
        f"L{P(top_in)}{arc(top_in, bot_in, R_RING, NODE)}L{f(x1)} {f(y1-r)}"
        f"A{f(r)} {f(r)} 0 0 1 {f(x1-r)} {f(y1)}L{f(x0+r)} {f(y1)}"
        f"A{f(r)} {f(r)} 0 0 1 {f(x0)} {f(y1-r)}L{f(x0)} {f(y0+r)}"
        f"A{f(r)} {f(r)} 0 0 1 {f(x0+r)} {f(y0)}Z")

# -------------------------------------------------------------------- arms
def arm(t0, t1, term_y, sign):
    """One arm: flat terminal on the cap/base line, flat notch by the node,
    inner end closed by the ring arc."""
    d = (-math.cos(TH), sign * math.sin(TH))          # terminal -> node
    stem_side, chan = (t0, term_y), (t1, term_y)
    ring_hit = ray_circle(stem_side, d, NODE, R_RING, far=False)
    ny = NODE[1] - sign * NOTCH
    t = (ny - term_y) / d[1]
    notch_edge = (t1 + t * d[0], ny)
    notch_ring = (NODE[0] + math.sqrt(R_RING**2 - NOTCH**2), ny)
    pts = [ring_hit, stem_side, chan, notch_edge, notch_ring]
    return ("M" + "L".join(P(p) for p in pts) + arc(notch_ring, ring_hit, R_RING, NODE) + "Z")

BLADE = arm(UP0, UP1, CAP, +1)
LEG   = arm(DN0, DN1, BASE, -1)
nx, ny = M(NODE)

# ------------------------------------------------------------ blade colour
im = cv2.imread("ref_19.png"); rgb = im[:, :, ::-1].astype(float)
g, rr, bb = im[:,:,1].astype(int), im[:,:,2].astype(int), im[:,:,0].astype(int)
mask = (g - rr > 25) & (g - bb > 12)
mask[:, :361] = False; mask[237:, :] = False
ys, xs = np.nonzero(mask)
u = np.array([math.cos(TH), -math.sin(TH)])
t = (xs - 361) * u[0] + (ys - 236) * u[1]; t = (t - t.min()) / (t.max() - t.min())
fitc = [np.polyfit(t, rgb[ys, xs, i], 1) for i in range(3)]
hexat = lambda x: "#%02X%02X%02X" % tuple(int(round(min(255, max(0, np.polyval(c, x))))) for c in fitc)
print("blade gradient", hexat(0.02), "->", hexat(0.98))
print("node", "#%02X%02X%02X" % tuple(im[243, 353][::-1]))
print("shield/K", "#%02X%02X%02X" % tuple(im[300, 430][::-1]))
print("viewBox: K", f(K*100), "OX", f(OX))
print("stroke units", f(STROKE * K), " node r", f(R_NODE * K), " centre", f(nx), f(ny))
for n, v in (("SHIELD", SHIELD), ("STEM", STEM), ("BLADE", BLADE), ("LEG", LEG)):
    print(f'\nconst {n} =\n  "{v}";')
open("paths.txt", "w").write("\n".join([SHIELD, STEM, BLADE, LEG, f"{f(nx)} {f(ny)} {f(R_NODE*K)}", f(STROKE*K)]))
