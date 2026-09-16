"""Fits the shield's stroke centreline: sample the mid-point between the outer
and inner contours, then least-squares the structural model to those points."""
import cv2, numpy as np
im = cv2.imread("ref_19.png"); b,g,r = (im[:,:,i].astype(int) for i in range(3))
dark = ((r<110)&(g<110)&(b<110)).astype(np.uint8)
lab = cv2.connectedComponents(dark,8)[1]
sh = (lab==lab[200,253]).astype(np.uint8)
CX = 386.5
H, W = sh.shape

def mid_row(y):                       # left flank centre at row y
    xs = np.nonzero(sh[y, :int(CX)])[0]
    return xs.mean() if len(xs) else None
def mid_col(x):                       # top / bottom edge centre at column x
    ys = np.nonzero(sh[:, x])[0]
    if not len(ys): return None, None
    runs = np.split(ys, np.where(np.diff(ys) > 1)[0] + 1)
    return runs[0].mean(), runs[-1].mean()

flank = np.array([mid_row(y) for y in range(150, 251)])
FX = flank.mean()
print("flank centreline x %.2f  (sd %.2f)" % (FX, flank.std()))

# top edge: fit a line to the centre of the upper stroke run
xs = np.arange(270, 360)
tops = np.array([mid_col(x)[0] for x in xs])
m, c = np.polyfit(xs, tops, 1)
apex_y = m*CX + c
sh_y = m*FX + c
print("top edge slope %.4f -> apex y %.2f, shoulder y %.2f at x %.2f" % (m, apex_y, sh_y, FX))

# bottom: medial points of the lower-left flank, then a cubic through them
pts = []
for y in range(255, 340):
    xs2 = np.nonzero(sh[y, :int(CX)])[0]
    if len(xs2): pts.append((xs2.mean(), y))
for x in range(int(FX)+10, int(CX)):
    _, bot = mid_col(x)
    if bot is not None and bot > 330: pts.append((x, bot))
pts = np.array(sorted(pts, key=lambda p: p[1]))
tip_y = mid_col(int(CX))[1]
P0, P3 = np.array([FX, 264.0]), np.array([CX, tip_y])
d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))]; t = d/d[-1]
B = np.stack([3*(1-t)**2*t, 3*(1-t)*t**2],1)
rhs = pts - ((1-t)**3)[:,None]*P0 - (t**3)[:,None]*P3
C,*_ = np.linalg.lstsq(B, rhs, rcond=None)
print("tip y %.2f" % tip_y)
print("bottom cubic C1 %s C2 %s rms %.2f" % (C[0].round(2), C[1].round(2),
      np.linalg.norm(B@C-rhs,axis=1).mean()))
# where the straight flank actually ends: last y whose centre is within .5 of FX
ends = [y for y in range(250, 330) if abs(mid_row(y)-FX) < 0.6]
print("flank straight until y =", max(ends))
# stroke thickness on the flank
print("flank thickness", np.mean([len(np.nonzero(sh[y,:int(CX)])[0]) for y in range(150,251)]).round(2))
