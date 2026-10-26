"""Собирает public/sky.js из данных проекта d3-celestial (Olaf Frohn, BSD-3).

Исходники: https://github.com/ofrohn/d3-celestial/tree/master/data
  stars.6.json, starnames.json, constellations.json,
  constellations.lines.json, constellations.bounds.json, mw.json

Запуск:  python tools/build_sky.py <папка_с_json> public/sky.js
"""
import json
import math
import sys

# Мира (ο Кита) — переменная, в stars.6.json её нет; добавляем вручную (J2000).
EXTRA_STARS = [(10826, 34.8366, -2.9776, 4.0, 1.42)]


def load(folder, name):
    with open(f'{folder}/{name}', encoding='utf-8') as f:
        return json.load(f)


def ra360(lon):
    return (lon + 360.0) % 360.0


def r(x, n=2):
    v = round(x, n)
    return 0 if v == 0 else v


def vec(ra, dec):
    a, d = math.radians(ra), math.radians(dec)
    return (math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d))


def unvec(v):
    x, y, z = v
    return ra360(math.degrees(math.atan2(y, x))), math.degrees(math.asin(max(-1, min(1, z))))


def slerp_segment(a, b, step):
    """Точки дуги большого круга между a и b (без конечной)."""
    va, vb = vec(*a), vec(*b)
    dot = max(-1.0, min(1.0, sum(p * q for p, q in zip(va, vb))))
    ang = math.degrees(math.acos(dot))
    n = max(1, math.ceil(ang / step))
    out = [a]
    if n > 1 and ang > 1e-9:
        s = math.sin(math.radians(ang))
        for i in range(1, n):
            t = i / n
            k1 = math.sin((1 - t) * math.radians(ang)) / s
            k2 = math.sin(t * math.radians(ang)) / s
            out.append(unvec(tuple(k1 * p + k2 * q for p, q in zip(va, vb))))
    return out


def linear_segment(a, b, step):
    """Границы созвездий идут по линиям постоянных α или δ — интерполируем линейно в (α, δ)."""
    dra = ((b[0] - a[0] + 540.0) % 360.0) - 180.0
    ddec = b[1] - a[1]
    n = max(1, math.ceil(max(abs(dra), abs(ddec)) / step))
    return [(ra360(a[0] + dra * i / n), a[1] + ddec * i / n) for i in range(n)]


def flat(points, n=2):
    out = []
    for ra, dec in points:
        out += [r(ra, n), r(dec, n)]
    return out


def rdp(points, eps):
    """Упрощение ломаной (Рамер — Дуглас — Пекер) в координатах lon/lat."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = points[i], points[j]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            x, y = points[k]
            d = abs(dy * (x - x1) - dx * (y - y1)) / L if L > 0 else math.hypot(x - x1, y - y1)
            if d > best:
                best, bi = d, k
        if best > eps:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(points, keep) if k]


def main(src, dst):
    stars_json = load(src, 'stars.6.json')
    names_json = load(src, 'starnames.json')

    stars = []
    for f in stars_json['features']:
        lon, lat = f['geometry']['coordinates']
        bv = f['properties'].get('bv')
        try:
            bv = float(bv)
        except (TypeError, ValueError):
            bv = 0.6
        stars.append((int(f['id']), ra360(lon), lat, float(f['properties']['mag']), bv))
    have = {s[0] for s in stars}
    stars += [s for s in EXTRA_STARS if s[0] not in have]
    stars.sort(key=lambda s: s[3])

    flat_stars, hips, names = [], [], {}
    for i, (hip, ra, dec, mag, bv) in enumerate(stars):
        flat_stars += [r(ra, 3), r(dec, 3), r(mag, 2), r(bv, 2)]
        hips.append(hip)
        n = names_json.get(str(hip))
        if n and (n.get('bayer') or n.get('ru') or n.get('flam')):
            names[i] = [n.get('bayer', ''), n.get('c', ''), n.get('ru', ''), n.get('flam', '')]

    cons = {}
    for f in load(src, 'constellations.json')['features']:
        p = f['properties']
        lon, lat = f['geometry']['coordinates']
        if f['id'] in cons:  # Змея состоит из двух частей — вторая метка
            cons[f['id']]['extra'] = [r(ra360(lon)), r(lat)]
        else:
            cons[f['id']] = {'la': p['name'], 'gen': p['gen'], 'lx': r(ra360(lon)), 'ly': r(lat)}

    lines = {}
    for f in load(src, 'constellations.lines.json')['features']:
        polys = []
        for line in f['geometry']['coordinates']:
            pts = [(ra360(lon), lat) for lon, lat in line]
            dense = []
            for a, b in zip(pts, pts[1:]):
                dense += slerp_segment(a, b, 3.0)
            dense.append(pts[-1])
            polys.append(flat(dense))
        lines.setdefault(f['id'], []).extend(polys)

    bounds = {}
    for f in load(src, 'constellations.bounds.json')['features']:
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for poly in polys:
            ring = [(ra360(lon), lat) for lon, lat in poly[0]]
            dense = []
            for a, b in zip(ring, ring[1:]):
                dense += linear_segment(a, b, 2.0)
            bounds.setdefault(f['id'], []).append(flat(dense))

    mw = []
    for f in load(src, 'mw.json')['features']:
        level = int(f['id'][2:])
        rings = []
        for poly in f['geometry']['coordinates']:
            for ring in poly:
                simple = rdp([tuple(p) for p in ring], 0.25)
                if len(simple) >= 4:
                    rings.append(flat([(ra360(lon), lat) for lon, lat in simple], 1))
        mw.append({'l': level, 'rings': rings})

    data = {
        'stars': flat_stars, 'hip': hips, 'names': names,
        'cons': cons, 'lines': lines, 'bounds': bounds, 'mw': mw,
    }
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('// Сгенерировано tools/build_sky.py из данных d3-celestial (BSD-3). Не редактировать вручную.\n')
        # JSON.parse разбирает большие объекты быстрее, чем JS-литерал (важно для старых телефонов).
        # Строка в одинарных кавычках: в JSON двойных кавычек много, экранировать их дорого.
        lit = (body.replace('\\', '\\\\').replace("'", "\\'")
               .replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))
        f.write("window.SKY = JSON.parse('" + lit + "');\n")
    print(f'{dst}: {len(stars)} звёзд, {len(names)} имён, {len(cons)} созвездий, '
          f'{sum(len(m["rings"]) for m in mw)} колец Млечного Пути, {len(body) // 1024} КБ')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
