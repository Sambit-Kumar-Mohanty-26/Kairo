# Kairo mark

`KairoMark.tsx`, `app/icon.svg` and the footer seal all share one set of paths.
They are measured off `reference.png`, not drawn by hand.

    python shield_fit.py     # fits the shield stroke centreline off the artwork
    python kairo_gen.py      # prints the four path constants + colours

`kairo_gen.py` holds the measurements at the top (cap line, stem, 46.9° arms,
node and ring radii) and derives everything else — the ring bite in the stem,
the flat terminals, the arcs around the node. Change a measurement there, run
it, paste the constants into the three call sites.

Last check against the artwork: blade IoU 0.94, K IoU 0.96.
