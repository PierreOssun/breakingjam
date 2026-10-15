"""Builds the "Jam" logo SVGs of DESIGN.md §10 into public/; needs `pip install fonttools skia-pathops`."""
from pathlib import Path
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.roundingPen import RoundingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import OverlapMode, instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
FONT = instantiateVariableFont(TTFont(ROOT / 'backend/assets/fonts/Unbounded-wght.ttf'), {'wght': 800}, overlap=OverlapMode.REMOVE)
GLYPHS = FONT.getGlyphSet(); CMAP = FONT.getBestCmap(); ADVANCE = FONT['hmtx']
KLEIN, FACE, RIM, VIOLET, INK = '#002FA7', '#FFFFFF', '#C9D6FF', '#6D3AF5', '#0B0D14'
INFLATE, OUTLINE, DEPTH, STEPS = 80, 66, 150, 16
BOUNCE = [(30, -7), (-55, 5), (25, -4)]  # (drop in font units, degrees) per letter of "Jam"
CIRCLE = f'<circle cx="500" cy="500" r="500" fill="{KLEIN}"></circle>'
SQUARE = f'<rect width="1000" height="1000" fill="{KLEIN}"></rect>'


def glyphs(text, track=-20):
    x, out = 0, []
    for ch in text:
        name = CMAP[ord(ch)]
        path, bounds = SVGPathPen(GLYPHS), BoundsPen(GLYPHS)
        GLYPHS[name].draw(RoundingPen(path)); GLYPHS[name].draw(RoundingPen(bounds))
        x0, y0, x1, y1 = bounds.bounds
        out.append(dict(d=path.getCommands(), x=x, cx=x + (x0 + x1) / 2, cy=(y0 + y1) / 2, b=(x + x0, y0, x + x1, y1)))
        x += ADVANCE[name][0] + track
    return out


def letters(gl, bounce, colour, width, dx=0, dy=0):
    # font units are y-up and the whole group is flipped at the end, so the rotation sign flips too
    return ''.join(
        f'<g transform="translate({dx:.1f} {dy:.1f}) translate(0 {ty}) rotate({-rot} {g["cx"]:.1f} {g["cy"]:.1f})">'
        f'<path transform="translate({g["x"]} 0)" d="{g["d"]}" fill="{colour}" stroke="{colour}" stroke-width="{width}"'
        f' stroke-linejoin="round" stroke-linecap="round" ></path></g>'
        for g, (ty, rot) in zip(gl, bounce))


def logo(text, bounce, uid, width, shape):
    gl = glyphs(text)
    x0 = min(g['b'][0] for g in gl); x1 = max(g['b'][2] for g in gl)
    y0 = min(g['b'][1] for g in gl); y1 = max(g['b'][3] for g in gl)
    step = lambda k: (DEPTH * k / STEPS, -DEPTH * k / STEPS)  # the extrusion goes down-right in y-up units
    layers = [letters(gl, bounce, INK, INFLATE + 2 * OUTLINE, *step(k)) for k in range(STEPS, -1, -1)]
    layers += [letters(gl, bounce, VIOLET, INFLATE, *step(k)) for k in range(STEPS, 0, -1)]
    layers.append(letters(gl, bounce, RIM, INFLATE))
    layers.append(f'<g mask="url(#{uid}m)">{letters(gl, bounce, FACE, INFLATE, -26, 26)}</g>')
    mask = (f'<mask id="{uid}m" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="8000" height="6000">'
            f'<rect x="-2000" y="-2000" width="8000" height="6000" fill="#000"></rect>{letters(gl, bounce, "#fff", INFLATE)}</mask>')
    scale = width / ((x1 - x0) + INFLATE + 2 * OUTLINE + DEPTH)
    cx = (x0 + x1) / 2 + DEPTH / 2; cy = (y0 + y1) / 2 - DEPTH / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="BreakingJam logo" style="display: block">'
            f'<defs>{mask}</defs>{shape}'
            f'<g transform="translate(500 500) scale({scale:.5f} {-scale:.5f}) translate({-cx:.1f} {-cy:.1f})">{"".join(layers)}</g></svg>')


if __name__ == '__main__':
    out = Path(__file__).with_name('public')
    (out / 'jam-logo.svg').write_text(logo('Jam', BOUNCE, 'f1', 780, CIRCLE))
    (out / 'jam-logo-square.svg').write_text(logo('Jam', BOUNCE, 'f2', 780, SQUARE))
    # The J alone keeps its tilt but not its drop, so it sits centred; 760 matches the shipped favicon.
    (out / 'favicon.svg').write_text(logo('J', [(0, -7)], 'f3', 760, CIRCLE))
