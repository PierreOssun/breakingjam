"""Pixel 2D-HD bboy/bgirl avatar generator: 32x32 sprite -> SVG (and PNG preview)."""
import math

OUT_C = '#0B0D14'
SKINS = {
 'light':  ('#F2C7A2', '#D9A07C', '#A0604A'),
 'tan':    ('#E3AE84', '#C48A60', '#8A4A32'),
 'medium': ('#C68A5C', '#A26B42', '#6E3A22'),
 'deep':   ('#8A5638', '#6A3E26', '#3C2015'),
}
HAIRS = {
 'black':  ('#23253A', '#14151F', '#4A5175'),
 'brown':  ('#5A3626', '#3A2117', '#86563C'),
 'bleach': ('#E6DFCF', '#B9AE98', '#FFFFFF'),
 'violet': ('#5B3BD6', '#3A239E', '#9277FF'),
 'blue':   ('#2448D0', '#152E96', '#6E8EFF'),
}
CLOTH = {
 'ink':    ('#232A40', '#151A2A', '#39425F'),
 'blue':   ('#2F5BFF', '#1C3FD0', '#7D99FF'),
 'violet': ('#6D3AF5', '#4E22C9', '#A387FF'),
 'white':  ('#E8EBF3', '#B9C0D2', '#FFFFFF'),
 'red':    ('#D8354A', '#A3202F', '#FF6A7B'),
}
BGS = {
 'klein':  ('#2F5BFF', '#4A72FF', '#C7D4FF'),   # bg, ring, rim light
 'violet': ('#6D3AF5', '#8257FF', '#DCCFFF'),
 'ink':    ('#1C2133', '#2A3150', '#9FB4FF'),
 'night':  ('#0F1530', '#1D2A5C', '#8FAAFF'),
}

def blank():
    return [[None] * 32 for _ in range(32)]

def put(g, x, y, c):
    if 0 <= x < 32 and 0 <= y < 32:
        g[y][x] = c

def ell(cx, cy, rx, ry, x, y):
    return ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1

def tri(g, tipx, tipy, x0, x1, by, c):
    for y in range(min(tipy, by), max(tipy, by) + 1):
        t = (y - tipy) / (by - tipy) if by != tipy else 1
        l = tipx + (x0 - tipx) * t
        r = tipx + (x1 - tipx) * t
        for x in range(math.floor(l + .5), math.floor(r + .5) + 1):
            put(g, x, y, c)

def make(skin='light', hair='black', style='spiky', cloth='ink', acc='A', bg='klein', extra='none', accent=('#F3F5FA', '#B9C0D2', '#FFFFFF'), brows='set', lashes=False, lips=False, hoops=False):
    S, s, o = SKINS[skin]; H, k, l = HAIRS[hair]; C, c, d = CLOTH[cloth]
    A, a, B = accent
    g = blank()
    # hoodie
    rows = {22: (10, 21), 23: (8, 23), 24: (6, 25), 25: (4, 27), 26: (3, 28)}
    for y in range(22, 32):
        x0, x1 = rows.get(y, (2, 29))
        for x in range(x0, x1 + 1):
            put(g, x, y, 'C')
    for y in range(22, 32):  # hood fold / shading
        for x in range(32):
            if g[y][x] == 'C' and x >= 23: g[y][x] = 'c'
            if g[y][x] == 'C' and x <= 6 and y >= 26: g[y][x] = 'd'
    for x in range(12, 20):
        put(g, x, 23, 'c')  # collar opening shadow
    for y in range(25, 30):
        put(g, 13, y, 'd'); put(g, 18, y, 'd')  # drawstrings
    # neck
    for y in range(19, 24):
        for x in range(13, 19):
            put(g, x, y, 's')
    # head
    for y in range(5, 22):
        for x in range(32):
            if ell(15.5, 13.6, 6.6, 7.6, x, y):
                g[y][x] = 's' if x >= 20 else 'S'
    for y in (13, 14, 15):
        put(g, 8, y, 'S'); put(g, 23, y, 's')
    put(g, 8, 14, 'o'); put(g, 23, 14, 'o')
    # chin line onto neck
    for x in range(13, 19):
        if g[20][x] in ('s',) and g[19][x] in ('S', 's'):
            pass
    for x in range(13, 19):
        y = 21
        while y < 24 and g[y][x] in ('S', 's') and ell(15.5, 13.6, 6.6, 7.6, x, y):
            y += 1
        put(g, x, y, 'o')
    # hair styles
    if style == 'spiky':
        for y in range(2, 11):
            for x in range(32):
                if ell(15.5, 10.5, 8.2, 6.2, x, y): g[y][x] = 'H'
        tri(g, 9, 2, 7, 12, 7, 'H'); tri(g, 15, 0, 12, 18, 6, 'H'); tri(g, 21, 1, 18, 24, 7, 'H')
        tri(g, 25, 5, 22, 25, 9, 'H'); tri(g, 6, 6, 6, 9, 10, 'H')
        for tx in (11, 14, 17, 20):
            tri(g, tx, 12, tx - 2, tx + 1, 9, 'H')
        for y in range(10, 15):
            put(g, 8, y, 'H'); put(g, 9, y, 'H'); put(g, 22, y, 'H'); put(g, 23, y, 'H')
    elif style == 'beanie':
        for y in range(1, 11):
            for x in range(32):
                if ell(15.5, 9.2, 8.6, 7.4, x, y) and y <= 9: g[y][x] = 'A'
        for x in range(7, 25):
            for y in (9, 10):
                put(g, x, y, 'a' if x % 2 else 'B')
        for y in range(11, 15):
            for x in (8, 9, 22, 23):
                put(g, x, y, 'H')
        put(g, 10, 11, 'H'); put(g, 21, 11, 'H')
    elif style == 'cap':
        for y in range(10, 14):
            for x in (8, 9, 22, 23):
                put(g, x, y, 'H')
        for y in range(2, 11):
            for x in range(32):
                if ell(15.5, 10, 8.4, 6.6, x, y) and y <= 9: g[y][x] = 'A'
        for x in range(7, 25):
            put(g, x, 10, 'a')
        for x in range(1, 10):  # side brim
            put(g, x, 9, 'a'); put(g, x, 10, 'A')
        for x in range(13, 19):  # snapback opening
            put(g, x, 8, 'H')
        put(g, 15, 3, 'B'); put(g, 16, 3, 'B')
    elif style == 'bun':
        for y in range(4, 11):
            for x in range(32):
                if ell(15.5, 10.6, 8.4, 5.6, x, y) and y <= 10: g[y][x] = 'H'
        for y in range(0, 4):
            for x in range(32):
                if ell(15.5, 2.0, 4.0, 2.2, x, y): g[y][x] = 'H'
        for x in range(32):
            put(g, x, 4, None)
        for x in range(14, 18):
            put(g, x, 4, 'A')
        put(g, 14, 1, 'l'); put(g, 15, 1, 'l')
        for x in range(7, 25):
            if g[8][x] == 'H': g[8][x] = 'A'
        for y in range(10, 21):
            put(g, 8, y, 'H'); put(g, 23, y, 'H')
            if y < 18: put(g, 9, y, 'H'); put(g, 22, y, 'H')
        tri(g, 12, 12, 10, 14, 10, 'H')
    elif style == 'afro':
        for y in range(0, 17):
            for x in range(32):
                if ell(15.5, 8.6, 11.6, 8.6, x, y):
                    if y >= 9 and g[y][x] in ('S', 's'): continue
                    if y >= 9 and 10 <= x <= 21: continue
                    g[y][x] = 'H'
        for (x, y) in ((8, 3), (23, 3), (6, 7), (25, 7), (12, 1), (19, 1)):
            put(g, x, y, 'l' if x < 16 else 'k')
    elif style in ('long', 'capLong', 'bangs', 'space', 'braids', 'puffs', 'pony'):
        cap_ry = 5.8
        if style == 'pony':
            for y in range(1, 14):
                for x in range(32):
                    if ell(25.2, 7.5, 3.0, 6.2, x, y): g[y][x] = 'H'
        if style == 'puffs':
            for (cx, cy) in ((7.2, 6.4), (24.0, 6.4)):
                for y in range(0, 13):
                    for x in range(32):
                        if ell(cx, cy, 4.6, 4.4, x, y): g[y][x] = 'H'
        for y in range(3, 11):
            for x in range(32):
                if ell(15.5, 10.6, 8.5, cap_ry, x, y) and y <= 10: g[y][x] = 'H'
        if style in ('long', 'capLong', 'braids', 'space', 'bangs'):
            put(g, 15, 5, 'k'); put(g, 15, 6, 'k')
        if style in ('long', 'capLong'):
            for y in range(10, 28):
                xs = list(range(7, 10)) + list(range(22, 25)) if y < 20 else list(range(5, 10)) + list(range(22, 27))
                for x in xs:
                    put(g, x, y, 'H')
            for (y, x1) in ((9, 20), (10, 15), (11, 12)):
                for x in range(9, x1 + 1):
                    if g[y][x] in ('S', 's', 'H', None): put(g, x, y, 'H')
        if style == 'bangs':
            for y in (9, 10):
                for x in range(8, 24):
                    put(g, x, y, 'H')
            for y in range(10, 19):
                for x in (7, 8, 9, 22, 23, 24):
                    put(g, x, y, 'H')
        if style == 'space':
            for (cx, cy) in ((8.9, 3.3), (22.1, 3.3)):
                for y in range(0, 8):
                    for x in range(32):
                        if ell(cx, cy, 3.3, 3.1, x, y): g[y][x] = 'H'
            for (x, y) in ((10, 6), (11, 6), (20, 6), (21, 6)):
                put(g, x, y, 'A')
            for y in range(10, 15):
                put(g, 8, y, 'H'); put(g, 23, y, 'H')
        if style == 'braids':
            for y in range(10, 29):
                lx = 8 if y < 20 else 9
                rx = 22 if y < 20 else 21
                for x in (lx, lx + 1):
                    put(g, x, y, 'H' if (x + y) % 2 else 'k')
                for x in (rx, rx + 1):
                    put(g, x, y, 'H' if (x + y) % 2 else 'k')
            for x in (9, 10, 21, 22):
                put(g, x, 28, 'A'); put(g, x, 29, 'H')
        if style == 'puffs':
            for (x, y) in ((10, 6), (11, 5), (20, 5), (21, 6)):
                put(g, x, y, 'A')
        if style == 'pony':
            for (x, y) in ((22, 4), (23, 4), (22, 5)):
                put(g, x, y, 'A')
            for y in range(10, 15):
                put(g, 8, y, 'H')
        if style == 'capLong':
            for y in range(2, 11):
                for x in range(32):
                    if ell(15.5, 10, 8.4, 6.6, x, y) and y <= 9: g[y][x] = 'A'
            for x in range(7, 25):
                put(g, x, 10, 'a')
            for x in range(21, 30):
                put(g, x, 9, 'a'); put(g, x, 10, 'A')
            put(g, 15, 3, 'B'); put(g, 16, 3, 'B')
    elif style == 'buzz':
        for y in range(4, 10):
            for x in range(32):
                if ell(15.5, 10.6, 7.6, 6.2, x, y) and y <= 9: g[y][x] = 'H'
        for y in range(9, 13):
            put(g, 9, y, 'H'); put(g, 22, y, 'H')
    # hair shading: right third shadow, top-left highlight streak
    for y in range(32):
        for x in range(32):
            if g[y][x] == 'H':
                if x >= 20: g[y][x] = 'k'
                elif (x + y) in (14, 15) and y < 10: g[y][x] = 'l'
            if g[y][x] == 'A' and x >= 20: g[y][x] = 'a'
    # hair bottom edge darker over skin
    for y in range(31):
        for x in range(32):
            if g[y][x] in ('H', 'l') and g[y + 1][x] in ('S', 's'):
                g[y][x] = 'k'
    # face
    if brows == 'set':
        for (x, y) in ((11, 10), (12, 10), (13, 11), (18, 11), (19, 10), (20, 10)):
            if g[y][x] in ('S', 's'): put(g, x, y, 'O')
    for (x, y) in ((10, 12), (11, 12), (12, 12), (13, 12), (18, 12), (19, 12), (20, 12), (21, 12)):
        put(g, x, y, 'O')
    for (x, y) in ((12, 13), (18, 13)):
        put(g, x, y, 'W')
    for (x, y) in ((13, 13), (12, 14), (13, 14), (19, 13), (18, 14), (19, 14)):
        put(g, x, y, 'E')
    put(g, 16, 15, 'o'); put(g, 16, 16, 'o')
    for (x, y) in ((14, 18), (15, 18), (16, 18), (17, 17)):
        put(g, x, y, 'o')
    put(g, 11, 15, 'r'); put(g, 20, 15, 'r')  # cheek tint
    # extras
    if lashes:
        for (x, y) in ((9, 12), (22, 12), (10, 11), (21, 11)):
            if g[y][x] in ('S', 's', None) or True: put(g, x, y, 'O')
    if lips:
        for (x, y) in ((14, 18), (15, 18), (16, 18), (17, 17)):
            put(g, x, y, 'L')
    if hoops:
        for (x, y) in ((8, 16), (7, 17), (8, 18), (9, 17), (23, 16), (24, 17), (23, 18), (22, 17)):
            if g[y][x] in ('S', 's', 'o', None, 'C', 'c', 'd'): put(g, x, y, 'G')
    if extra == 'phones':
        for x in range(11, 21):
            put(g, x, 24, 'A' if accent else 'P')
        for x0 in (8, 20):
            for y in (22, 23, 24, 25):
                for x in range(x0, x0 + 4):
                    if (y in (22, 25)) and x in (x0, x0 + 3): continue
                    put(g, x, y, 'Q')
            put(g, x0 + 1, 23, 'P'); put(g, x0 + 2, 23, 'P'); put(g, x0 + 1, 24, 'P')
    elif extra == 'chain':
        for (x, y) in ((11, 23), (12, 24), (13, 25), (14, 26), (15, 26), (16, 26), (17, 26), (18, 25), (19, 24), (20, 23)):
            put(g, x, y, 'G' if (x + y) % 2 else 'g')
        put(g, 15, 27, 'G'); put(g, 16, 27, 'g')
    # auto outline
    filled = lambda v: v is not None and v not in ('O', '#rim')
    out = [row[:] for row in g]
    for y in range(32):
        for x in range(32):
            if g[y][x] is None:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < 32 and 0 <= ny < 32 and filled(g[ny][nx]):
                        out[y][x] = 'O'
                        break
    # rim light: outline pixels on the right whose left neighbour is filled
    for y in range(32):
        for x in range(17, 32):
            if out[y][x] == 'O' and g[y][x] is None and x > 0 and filled(g[y][x - 1]) and y < 30:
                out[y][x] = 'R'
    bgc, ring, rim = BGS[bg]
    pal = {'O': OUT_C, 'S': S, 's': s, 'o': o, 'H': H, 'k': k, 'l': l, 'C': C, 'c': c, 'd': d, 'A': A, 'a': a, 'B': B,
           'W': '#FFFFFF', 'E': '#151A33', 'r': o, 'P': '#2A3150', 'Q': '#0F1220', 'G': '#E3E8F4', 'g': '#9AA3BC', 'R': rim, 'L': '#B4475F'}
    return out, pal, (bgc, ring, rim)

def rings_pixels():
    px = set()
    for r in (9, 14, 19, 24):
        for y in range(32):
            for x in range(32):
                dd = math.hypot(x + .5 - 27, y + .5 - 4)
                if abs(dd - r) < .5:
                    px.add((x, y))
    return px

def svg(spec, size=96, radius=28, label='Generated pixel avatar'):
    g, pal, (bgc, ring, rim) = make(**spec)
    uid = 'av' + str(abs(hash(repr(sorted(spec.items())))) % 10**8)
    rects = []
    for (x, y) in sorted(rings_pixels()):
        rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{ring}"></rect>')
    for y in range(32):
        x = 0
        while x < 32:
            v = g[y][x]
            if v is None:
                x += 1; continue
            x1 = x
            while x1 + 1 < 32 and g[y][x1 + 1] == v:
                x1 += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{x1 - x + 1}" height="1" fill="{pal[v]}"></rect>')
            x = x1 + 1
    body = ''.join(rects)
    return (f'<div class="ava" style="width: {size}px; height: {size}px; border-radius: {radius}px; background: {bgc}">'
            f'<svg width="100%" height="100%" viewBox="0 0 32 32" shape-rendering="crispEdges" role="img" aria-label="{label}">'
            f'<defs><radialGradient id="{uid}l" cx="0.3" cy="0.25" r="0.75"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"></stop><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"></stop></radialGradient>'
            f'<linearGradient id="{uid}v" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000000" stop-opacity="0"></stop><stop offset="1" stop-color="#000000" stop-opacity=".35"></stop></linearGradient></defs>'
            f'<rect width="32" height="32" fill="url(#{uid}l)"></rect>{body}<rect width="32" height="32" fill="url(#{uid}v)"></rect></svg></div>')

def png(spec, path, scale=8):
    from PIL import Image
    g, pal, (bgc, ring, rim) = make(**spec)
    im = Image.new('RGB', (32, 32), bgc)
    for (x, y) in rings_pixels():
        im.putpixel((x, y), tuple(int(ring[i:i+2], 16) for i in (1, 3, 5)))
    for y in range(32):
        for x in range(32):
            if g[y][x]:
                h = pal[g[y][x]]
                im.putpixel((x, y), tuple(int(h[i:i+2], 16) for i in (1, 3, 5)))
    im.resize((32 * scale, 32 * scale), Image.NEAREST).save(path)

PRESETS = {
 'nova':  dict(skin='tan', hair='violet', style='bun', cloth='ink', bg='klein', extra='chain', accent=('#F3F5FA', '#B9C0D2', '#FFFFFF')),
 'moth':  dict(skin='light', hair='black', style='cap', cloth='white', bg='violet', extra='phones', accent=('#151A2A', '#0B0D14', '#39425F')),
 'sora':  dict(skin='deep', hair='black', style='spiky', cloth='blue', bg='ink', extra='none'),
 'v4':    dict(skin='medium', hair='brown', style='beanie', cloth='red', bg='night', extra='phones', accent=('#2F5BFF', '#1C3FD0', '#7D99FF')),
 'v5':    dict(skin='deep', hair='black', style='afro', cloth='violet', bg='klein', extra='chain'),
 'v6':    dict(skin='light', hair='bleach', style='buzz', cloth='ink', bg='violet', extra='none'),
 'v7':    dict(skin='medium', hair='blue', style='spiky', cloth='white', bg='night', extra='chain'),
 'v8':    dict(skin='tan', hair='black', style='bun', cloth='red', bg='ink', extra='phones', accent=('#6D3AF5', '#4E22C9', '#A387FF')),
}

PRESETS.update({'w1': {'skin': 'light', 'hair': 'black', 'style': 'long', 'cloth': 'blue', 'bg': 'violet', 'hoops': True, 'lashes': True, 'lips': True}, 'w2': {'skin': 'tan', 'hair': 'violet', 'style': 'space', 'cloth': 'blue', 'bg': 'klein', 'lashes': True, 'accent': ('#F3F5FA', '#B9C0D2', '#FFFFFF')}, 'w3': {'skin': 'deep', 'hair': 'brown', 'style': 'braids', 'cloth': 'white', 'bg': 'night', 'extra': 'chain', 'lashes': True, 'lips': True, 'accent': ('#6D3AF5', '#4E22C9', '#A387FF')}, 'w4': {'skin': 'medium', 'hair': 'black', 'style': 'puffs', 'cloth': 'red', 'bg': 'klein', 'hoops': True, 'lashes': True, 'accent': ('#2F5BFF', '#1C3FD0', '#7D99FF')}, 'w5': {'skin': 'light', 'hair': 'brown', 'style': 'pony', 'cloth': 'violet', 'bg': 'ink', 'extra': 'phones', 'lashes': True, 'accent': ('#F3F5FA', '#B9C0D2', '#FFFFFF')}, 'w6': {'skin': 'tan', 'hair': 'blue', 'style': 'bangs', 'cloth': 'white', 'bg': 'violet', 'lashes': True, 'lips': True}, 'w7': {'skin': 'medium', 'hair': 'bleach', 'style': 'capLong', 'cloth': 'ink', 'bg': 'klein', 'extra': 'chain', 'lashes': True, 'accent': ('#6D3AF5', '#4E22C9', '#A387FF')}, 'w8': {'skin': 'deep', 'hair': 'brown', 'style': 'long', 'cloth': 'red', 'bg': 'night', 'extra': 'phones', 'hoops': True, 'lashes': True, 'lips': True}})

if __name__ == '__main__':
    from PIL import Image
    ims = []
    for n, sp in PRESETS.items():
        png(sp, f'/tmp/claude-0/pv_{n}.png', 6)
        ims.append(Image.open(f'/tmp/claude-0/pv_{n}.png'))
    sheet = Image.new('RGB', (192 * 4 + 50, 192 * 2 + 30), '#000000')
    for i, im in enumerate(ims):
        sheet.paste(im, (10 + (i % 4) * 202, 10 + (i // 4) * 202))
    sheet.save('/tmp/claude-0/pv_sheet.png')
    print('ok')
