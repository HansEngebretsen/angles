# Builds logo.svg: the Angles mark, an impossible "A" traced from the reference artwork. Each ribbon of the outline is
# split at its folds into faces; a perspective is a set of faces filled with ink. The faces fall into three
# orientations, and inking one or two of them lights the A from a different side. Hovering (or class "play") cycles
# through the perspectives with CSS only; the colours come from --al-ink and --al-paper.
P = dict(a=(329,58), b=(276,58), c=(37,500), d=(60,545), e=(272,159), f=(383,362), g=(247,363), h=(221,408), i=(458,408), j=(300,113),
         p=(272,189), q=(75,551), r=(130,552), s=(177,467), t=(433,467), u=(480,552), v=(536,552), w=(466,423), x=(197,422), y=(297,236))
FACES = {'L': 'bcde', 'K': 'baje', 'R': 'ejif', 'C': 'fghi', 'N': 'pqrsxy', 'F': 'xstw', 'T': 'wtuv'}
polys = {k: [P[ch] for ch in v] for k, v in FACES.items()}
polys['O'] = [(341,66), (317,113), (550,545), (575,501)]          # right leg, outer strip
outer = [(268,44),(21,500),(56,566),(138,566),(185,481),(425,481),(471,566),(555,566),(590,499),(346,44)]
hole = [(305,252),(254,349),(358,349)]
# the reference first (left leg, cap, inner diagonal, right foot), then the other orientations and their pairs, then the outline
PERS = ['', 'LKRT', 'OF', 'NC', 'NCOF', 'LKRTOF', 'LKRTNC']   # the outline first: that's how it rests
pts = lambda L: ' '.join(f'{x},{y}' for x, y in L)
# the drawn lines, a little heavier so the mark still reads small: each face's edges that aren't folds shared with the
# next face, stroked in ink and clipped to that face, so the extra weight only ever grows inward and never crosses a fold
LINE = 6   # added to each line, in viewBox units
edges = {}
for k, v in FACES.items():
    for a, b in zip(v, v[1:] + v[0]): edges.setdefault(frozenset((a, b)), []).append(k)
def own_lines(k):
    if k in FACES: v = FACES[k]; return [(P[a], P[b]) for a, b in zip(v, v[1:] + v[0]) if len(edges[frozenset((a, b))]) == 1]
    poly = polys.get(k, hole); return list(zip(poly, poly[1:] + poly[:1]))
seg = lambda L: ' '.join(f'M{a[0]},{a[1]}L{b[0]},{b[1]}' for a, b in L)
clips = ''.join(f'<clipPath id="al-c{k}"><polygon points="{pts(polys[k] if k in polys else hole)}"/></clipPath>' for k in [*polys, 'H'])
heavy = ''.join(f'<path clip-path="url(#al-c{k})" d="{seg(own_lines(k))}" fill="none" stroke="var(--al-ink,#000)" stroke-width="{2*LINE}" stroke-linecap="square"/>'
                # and a thin unclipped line on the same edge, covering the hair of paper the faces' seam stroke leaves outside
                f'<path d="{seg(own_lines(k))}" fill="none" stroke="var(--al-ink,#000)" stroke-width="2.2" stroke-linecap="butt"/>' for k in [*polys, 'H'])
INK, PAPER = 'var(--al-ink,#000)', 'var(--al-paper,#fff)'
n = len(PERS); dur = n*.95
css = [f".al-face{{fill:{PAPER};stroke:{PAPER};stroke-width:.9;stroke-linejoin:round}}", f".al-ink{{fill:{INK}}}",
       # in a page that drives it with script (class "js"), the faces ease between whatever it picks
       ".al-logo.js .al-face{animation:none!important;transition:fill .38s cubic-bezier(.65,0,.35,1),stroke .38s cubic-bezier(.65,0,.35,1)}"]
for k in polys:
    on = [k in p for p in PERS]
    if on[0]: css.append(f".al-{k}{{fill:{INK};stroke:{INK}}}")
    css.append(f".al-logo.js .al-{k}.al-on{{fill:{INK};stroke:{INK}}}")
    fr = []
    for idx in range(n + 1):
        col = INK if on[idx % n] else PAPER; a0 = idx/n*100
        fr.append(f"{a0:.2f}%{{fill:{col};stroke:{col}}}")
        if idx < n: fr.append(f"{a0 + 100/n*.7:.2f}%{{fill:{col};stroke:{col}}}")
    css.append(f"@keyframes al-{k}{{{''.join(fr)}}}")
    css.append(f".al-logo:hover .al-{k},.al-logo.play .al-{k}{{animation:al-{k} {dur:.2f}s cubic-bezier(.65,0,.35,1) infinite}}")
body = (f'<polygon class="al-ink" points="{pts(outer)}"/>' + ''.join(f'<polygon class="al-face al-{k}" points="{pts(v)}"/>' for k, v in polys.items()) +
        f'<polygon class="al-face" points="{pts(hole)}"/>' +
        heavy)
# the perspectives, for scripts that play the mark: data-pers="LKRT OF ..."
pers_attr = ' '.join(p for p in PERS if p)
svg = f'<svg class="al-logo" data-pers="{pers_attr}" xmlns="http://www.w3.org/2000/svg" viewBox="14 36 584 538" role="img" aria-label="Angles"><defs>{clips}</defs><style>{"".join(css)}</style>{body}</svg>'
open('app/logo.svg', 'w').write(svg); print('app/logo.svg', len(svg), 'bytes')
