"""Reference implementation of the BreakingJam generated jam flyer (DESIGN.md 4.24). Outputs SVG strings: flyer_svg(jam) for 4:5, og_svg(jam) for 1200x630."""
import math, hashlib

POSES = {
 'handstand': [
  "..XX..........XX....",
  "..XXX........XXX....",
  "...XXX......XXX.....",
  "....XXX....XXX......",
  ".....XXX..XXX.......",
  "......XXXXXX........",
  ".......XXXX.........",
  ".......XXXX.........",
  ".......XXXX.........",
  ".......XXXX.........",
  ".......XXXX.........",
  "......XXXXXX........",
  ".....XXXXXXXX.......",
  "....XXX.XX.XXX......",
  "....XX.XXXX.XX......",
  "...XX..XXXX..XX.....",
  "...XX..XXXX..XX.....",
  "..XX....XX....XX....",
  "..XX..........XX....",
  ".XXX..........XXX...",
 ],
 'toprock': [
  "........XX..........",
  ".......XXX..........",
  ".......XX...........",
  "......XX....XXX.....",
  "......XX...XXXXX....",
  ".......XX..XXXXX....",
  ".......XX..XXXXX....",
  "........XX..XXX.....",
  ".........XXXXXX.....",
  "........XXXXXXXXXX..",
  "........XXXXXXX..XX.",
  "........XXXXXXX...XX",
  ".........XXXXX...XX.",
  ".........XXXXX..XX..",
  ".........XXXXX......",
  "........XXXXXXX.....",
  ".......XXX...XXX....",
  "......XXX.....XXX...",
  ".....XXX.......XX...",
  "....XXX........XX...",
  "...XXX.........XXX..",
  "..XXXX.........XXXX.",
 ],
}

PAL = {
 'klein':  dict(bg='#002FA7', ring='#1440BE', text='#FFFFFF', sub='#C7D4FF', body='#0B0D14', rim='#8FAAFF', shadow='#001C6B', floor='#5F80E6'),
 'violet': dict(bg='#6D3AF5', ring='#7C4FFF', text='#FFFFFF', sub='#E6DDFF', body='#0B0D14', rim='#D6C7FF', shadow='#4818C6', floor='#A88CFF'),
 'ink':    dict(bg='#0B0D14', ring='#182038', text='#F3F5FA', sub='#8FAAFF', body='#2F5BFF', rim='#B9CAFF', shadow='#111833', floor='#2A3A72'),
}
DISPLAY = "Unbounded, 'Arial Black', sans-serif"
BODY = "Manrope, 'Helvetica Neue', Arial, sans-serif"

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def seed(jam_id):
    h = int(hashlib.sha1(jam_id.encode()).hexdigest(), 16)
    return ['klein', 'violet', 'ink'][h % 3], ['handstand', 'toprock'][(h // 3) % 2]

def fit_name(name, width=344, sizes=(46, 40, 34, 28, 24), max_lines=4, room=None):
    words = name.split()
    best = None
    for fs in sizes:
        cw = fs * 0.8
        lines, cur, ok = [], '', True
        for w in words:
            t = (cur + ' ' + w).strip()
            if len(t) * cw <= width:
                cur = t
            else:
                if cur: lines.append(cur)
                cur = w
                if len(w) * cw > width: ok = False
        if cur: lines.append(cur)
        if len(lines) >= 2 and len(lines[-1]) <= 3 and ' ' in lines[-2]:
            a, b = lines[-2].rsplit(' ', 1)
            if len(b + ' ' + lines[-1]) * cw <= width:
                lines[-2], lines[-1] = a, b + ' ' + lines[-1]
        lim = max_lines if fs <= 30 else 3
        fits_room = room is None or (len(lines) - 1) * fs * 1.08 + fs * 0.8 <= room
        best = (fs, lines)
        if ok and len(lines) <= lim and fits_room:
            return fs, lines
    fs, lines = best
    n = 1
    while room is not None and n < len(lines) and n * fs * 1.08 + fs * 0.8 <= room: n += 1
    out = lines[:n]
    if len(lines) > n: out[-1] = out[-1].rstrip('.,') + '…'
    return fs, out

def pixel_rings(cx, cy, radii, cell, w, h, color):
    out = []
    for gy in range(0, h, cell):
        for gx in range(0, w, cell):
            d = math.hypot(gx + cell / 2 - cx, gy + cell / 2 - cy)
            if any(abs(d - r) < cell / 2 for r in radii):
                out.append(f'<rect x="{gx}" y="{gy}" width="{cell}" height="{cell}" fill="{color}"></rect>')
    return ''.join(out)

def sprite(pose, x0, y0, cell, p):
    rows = POSES[pose]
    out = []
    # shadow
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == 'X':
                out.append(f'<rect x="{x0 + (x + 1) * cell}" y="{y0 + (y + 1) * cell}" width="{cell}" height="{cell}" fill="{p["shadow"]}"></rect>')
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] != 'X':
                x += 1; continue
            x1 = x
            while x1 + 1 < len(row) and row[x1 + 1] == 'X': x1 += 1
            out.append(f'<rect x="{x0 + x * cell}" y="{y0 + y * cell}" width="{(x1 - x + 1) * cell}" height="{cell}" fill="{p["body"]}"></rect>')
            # rim light on right edge
            out.append(f'<rect x="{x0 + x1 * cell + cell - max(2, cell // 3)}" y="{y0 + y * cell}" width="{max(2, cell // 3)}" height="{cell}" fill="{p["rim"]}"></rect>')
            x = x1 + 1
    return ''.join(out)

def flyer_svg(jam, label=True, compact=False, status=None, uid='f'):
    pal_name, pose = jam.get('palette') or seed(jam['id'])[0], jam.get('pose') or seed(jam['id'])[1]
    p = PAL[pal_name]
    W, H = 400, 500
    parts = [f'<rect width="{W}" height="{H}" fill="{p["bg"]}"></rect>']
    # no pixel art on the flyer (rings, floor and dancer stay on the share image); the name
    # block keeps its room below where the floor was
    floor_y = 270
    # glow + vignette (HD layer)
    parts.append(f'<defs><radialGradient id="{uid}g" cx="0.25" cy="0.2" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".16"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></radialGradient>'
                 f'<linearGradient id="{uid}v" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity=".45"></stop></linearGradient></defs>'
                 f'<rect width="{W}" height="{H}" fill="url(#{uid}g)"></rect><rect width="{W}" height="{H}" fill="url(#{uid}v)"></rect>')
    # date block
    parts.append(f'<text x="28" y="54" font-family="{BODY}" font-weight="800" font-size="16" letter-spacing="2" fill="{p["sub"]}">{esc(jam["dow"].upper())}</text>')
    parts.append(f'<text x="24" y="124" font-family="{DISPLAY}" font-weight="800" font-size="72" letter-spacing="-2" fill="{p["text"]}">{esc(jam["day"])}</text>')
    parts.append(f'<text x="28" y="160" font-family="{DISPLAY}" font-weight="800" font-size="28" fill="{p["text"]}">{esc(jam["mon"].upper())}</text>')
    if not compact:
        parts.append(f'<text x="28" y="188" font-family="{BODY}" font-weight="700" font-size="15" fill="{p["sub"]}">{esc(jam.get("time", ""))}</text>')
        parts.append(f'<text x="372" y="46" text-anchor="end" font-family="{BODY}" font-weight="800" font-size="11" letter-spacing="2" fill="{p["sub"]}" opacity=".9">BREAKINGJAM</text>')
        fs, lines = fit_name(jam['name'], room=420 - floor_y - 12)
        lh = fs * 1.08
        base = 420
        y_first = base - (len(lines) - 1) * lh
        for i, ln in enumerate(lines):
            parts.append(f'<text x="26" y="{y_first + i * lh:.1f}" font-family="{DISPLAY}" font-weight="800" font-size="{fs}" letter-spacing="{-fs * 0.02:.2f}" fill="{p["text"]}">{esc(ln)}</text>')
        parts.append(f'<text x="28" y="452" font-family="{BODY}" font-weight="800" font-size="17" fill="{p["text"]}">{esc(jam["city"])} · {esc(jam["cc"])}</text>')
        parts.append(f'<text x="28" y="478" font-family="{BODY}" font-weight="700" font-size="12" letter-spacing="1.4" fill="{p["sub"]}">{esc(" · ".join(jam["cats"]).upper())}</text>')
    if status == 'cancelled':
        parts.append(f'<g transform="rotate(-12 200 250)"><rect x="-40" y="214" width="480" height="64" fill="#D8354A"></rect>'
                     f'<text x="200" y="258" text-anchor="middle" font-family="{DISPLAY}" font-weight="800" font-size="30" letter-spacing="2" fill="#FFFFFF">CANCELLED</text></g>')
    aria = f'role="img" aria-label="Generated flyer: {esc(jam["name"])}, {esc(jam["dow"])} {esc(jam["day"])} {esc(jam["mon"])}, {esc(jam["city"])}"' if label else 'aria-hidden="true"'
    return f'<svg width="100%" height="100%" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" text-rendering="geometricPrecision" {aria} style="display: block">{"".join(parts)}</svg>'

def og_svg(jam, uid='og'):
    pal_name, pose = jam.get('palette') or seed(jam['id'])[0], jam.get('pose') or seed(jam['id'])[1]
    p = PAL[pal_name]
    W, H = 1200, 630
    parts = [f'<rect width="{W}" height="{H}" fill="{p["bg"]}"></rect>', pixel_rings(940, 260, (90, 150, 210, 270, 330, 390), 12, W, H, p['ring'])]
    floor_y = 520
    for gx in range(0, W, 24):
        parts.append(f'<rect x="{gx}" y="{floor_y}" width="12" height="6" fill="{p["floor"]}"></rect>')
    parts.append(sprite(pose, 800, floor_y - len(POSES[pose]) * 16, 16, p))
    parts.append(f'<defs><linearGradient id="{uid}v" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity=".4"></stop></linearGradient></defs><rect width="{W}" height="{H}" fill="url(#{uid}v)"></rect>')
    parts.append(f'<text x="64" y="104" font-family="{BODY}" font-weight="800" font-size="26" letter-spacing="3" fill="{p["sub"]}">{esc(jam["dow"].upper())} {esc(jam["day"])} {esc(jam["mon"].upper())} · {esc(jam.get("time", ""))}</text>')
    fs, lines = fit_name(jam['name'], width=660, sizes=(84, 72, 60, 50), max_lines=3)
    lh = fs * 1.06
    y = 210
    for i, ln in enumerate(lines):
        parts.append(f'<text x="60" y="{y + i * lh:.0f}" font-family="{DISPLAY}" font-weight="800" font-size="{fs}" letter-spacing="{-fs * 0.02:.1f}" fill="{p["text"]}">{esc(ln)}</text>')
    parts.append(f'<text x="64" y="500" font-family="{BODY}" font-weight="800" font-size="30" fill="{p["text"]}">{esc(jam["city"])} · {esc(jam["cc"])}</text>')
    parts.append(f'<text x="64" y="566" font-family="{BODY}" font-weight="700" font-size="20" letter-spacing="2" fill="{p["sub"]}">{esc(" · ".join(jam["cats"]).upper())}   ·   BREAKINGJAM.COM</text>')
    return f'<svg width="100%" height="100%" viewBox="0 0 {W} {H}" shape-rendering="crispEdges" role="img" aria-label="Share image for {esc(jam["name"])}" style="display: block">{"".join(parts)}</svg>'

JAMS = {
 'concrete': dict(id='jam_concrete_v3', name='Concrete Cypher Vol. 3', dow='Sat', day='14', mon='Nov', time='13:00', city='Zurich', cc='CH', cats=['1v1 Bboy', '1v1 Bgirl', '2v2'], palette='klein', pose='handstand'),
 'rooftop':  dict(id='jam_rooftop', name='Rooftop Sessions', dow='Sat', day='21', mon='Nov', time='14:00', city='Lyon', cc='FR', cats=['1v1 Open', '3v3 Crew'], palette='violet', pose='toprock'),
 'kids':     dict(id='jam_kids', name='Kids Got Flavour', dow='Sun', day='29', mon='Nov', time='12:00', city='Milan', cc='IT', cats=['Kids 1v1', 'Kids 2v2'], palette='ink', pose='toprock'),
 'under':    dict(id='jam_under', name='Underground Throwdown', dow='Sat', day='05', mon='Dec', time='15:00', city='Berlin', cc='DE', cats=['1v1 Bboy', '1v1 Bgirl'], palette='klein', pose='toprock'),
 'seven':    dict(id='jam_seven', name='Seven to Smoke Night', dow='Sun', day='15', mon='Nov', time='19:00', city='Winterthur', cc='CH', cats=['7 to Smoke'], palette='violet', pose='handstand'),
 'lake':     dict(id='jam_lake', name='Lakeside Footwork Jam', dow='Sat', day='21', mon='Nov', time='14:00', city='Zurich', cc='CH', cats=['Footwork 1v1'], palette='ink', pose='handstand'),
 'basel':    dict(id='jam_basel', name='Basel Bounce', dow='Sat', day='28', mon='Nov', time='13:00', city='Basel', cc='CH', cats=['2v2'], palette='klein', pose='handstand'),
 'winter':   dict(id='jam_winter', name='Winter Cypher', dow='Sat', day='05', mon='Dec', time='16:00', city='Lucerne', cc='CH', cats=['1v1 Bgirl'], palette='violet', pose='toprock'),
 'long':     dict(id='jam_long', name='The International Breaking Championship of the Alps', dow='Sat', day='12', mon='Dec', time='11:00', city='Innsbruck', cc='AT', cats=['1v1 Bboy', '1v1 Bgirl', 'Crew 5v5'], palette='ink', pose='toprock'),
}

if __name__ == '__main__':
    import subprocess, os
    for k in ('concrete', 'rooftop', 'kids', 'long'):
        open(f'/tmp/claude-0/fl_{k}.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">{flyer_svg(JAMS[k])[0:0]}' + flyer_svg(JAMS[k]).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" x="0" y="0" ', 1) + '</svg>')
    print('ok')
