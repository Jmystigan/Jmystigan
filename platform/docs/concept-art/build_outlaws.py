import random, math, sys
random.seed(21)
W, H = 1600, 900
WITH_TITLE = '--notitle' not in sys.argv
o = []; a = o.append
HOR = 640

a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
a('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1f1230"/><stop offset=".25" stop-color="#5a2038"/><stop offset=".48" stop-color="#b3382a"/>
  <stop offset=".66" stop-color="#ee7a2e"/><stop offset=".82" stop-color="#ffb74d"/><stop offset="1" stop-color="#ffe3a3"/></linearGradient>
<radialGradient id="sunglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff0bf" stop-opacity=".95"/><stop offset=".22" stop-color="#ffbe5c" stop-opacity=".6"/><stop offset="1" stop-color="#ee7a2e" stop-opacity="0"/></radialGradient>
<radialGradient id="lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffb35a" stop-opacity=".4"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb867" stop-opacity="0"/><stop offset=".55" stop-color="#ffa860" stop-opacity=".55"/><stop offset="1" stop-color="#d9532b" stop-opacity="0"/></linearGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a65a34"/><stop offset=".35" stop-color="#6e3326"/><stop offset="1" stop-color="#27131c"/></linearGradient>
<linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a33"/><stop offset=".25" stop-color="#241a24"/><stop offset="1" stop-color="#120c14"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#ffc24d"/><stop offset="1" stop-color="#e2792a"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".5" r=".78"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0b0408" stop-opacity=".75"/></radialGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/>
  <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .10 0"/></filter>
<filter id="soft"><feGaussianBlur stdDeviation="2.4"/></filter><filter id="soft6"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/></filter>

<g id="body">
  <path d="M70 288 L98 288 L97 352 L69 352 Z"/><path d="M104 288 L134 288 L133 352 L106 352 Z"/>             <!-- legs under the coat -->
  <path d="M63 348 L99 348 L101 372 Q101 381 92 381 L57 381 Q51 381 53 372 Z"/>                              <!-- boots -->
  <path d="M104 348 L137 348 L141 372 Q143 381 135 381 L102 381 Q98 381 100 372 Z"/>
  <circle cx="54" cy="373" r="3.6"/><circle cx="141" cy="373" r="3.6"/>                                      <!-- spurs -->
  <path d="M66 98 C58 150 62 230 52 302 L90 310 L101 286 L114 312 L180 298 C162 250 150 190 138 100 C124 86 80 86 66 98 Z"/>   <!-- duster, flaring in the wind -->
  <path d="M66 100 C48 120 42 168 46 214 L63 218 C65 172 71 134 81 110 Z"/>                                 <!-- left sleeve -->
  <circle cx="54" cy="223" r="8"/>
  <path d="M138 102 C157 122 161 172 157 216 L142 216 C142 174 137 136 127 110 Z"/>                         <!-- right sleeve -->
  <circle cx="150" cy="221" r="7"/>
  <path d="M85 64 Q101 76 117 64 L121 72 Q101 88 81 72 Z"/>                                                   <!-- bandana at the neck -->
  <path d="M116 68 Q142 60 162 76 Q142 80 124 78 Z"/><path d="M113 74 Q134 84 156 102 Q134 98 117 82 Z"/>   <!-- fluttering tails -->
  <ellipse cx="101" cy="46" rx="16" ry="19"/>
  <g transform="rotate(-5 101 33)"><ellipse cx="101" cy="34" rx="44" ry="8"/>
    <path d="M80 33 C78 12 92 4 101 9 C110 4 124 12 122 33 Z"/></g>                                           <!-- wide-brim hat -->
</g>
<g id="board"><rect x="30" y="206" width="36" height="176" rx="18"/>
  <rect x="28" y="244" width="40" height="9" rx="3" fill="#3a2230"/><rect x="28" y="338" width="40" height="9" rx="3" fill="#3a2230"/>
  <circle cx="66" cy="234" r="8" fill="#2c1a28"/><circle cx="66" cy="264" r="8" fill="#2c1a28"/><circle cx="66" cy="326" r="8" fill="#2c1a28"/><circle cx="66" cy="356" r="8" fill="#2c1a28"/></g>
</defs>''')

# ---- sky, sun, clouds, vultures
a(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')
a('<circle cx="930" cy="610" r="470" fill="url(#sunglow)"/>')
a('<circle cx="930" cy="618" r="84" fill="#fff0c0"/>')
for (cx, cy, rx, ry, op) in [(380,300,300,12,.28),(1180,250,330,14,.26),(760,360,260,9,.35),(1380,380,220,8,.32),(150,430,230,8,.3)]:
    a(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#ffb98a" opacity="{op}" filter="url(#soft6)"/>')
for (x, y, s) in [(1260,330,1.1),(1320,356,.8),(1210,372,.7)]:
    a(f'<path d="M{x} {y} q{14*s} {-9*s} {28*s} 0 q{14*s} {-9*s} {28*s} 0" fill="none" stroke="#1a0c14" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>')

# ---- mesas (layered for depth)
def mesa(x, w, h, base, fill, op=1, steps=2):
    top = base - h; sl = w * .12
    d = f'M{x} {base} L{x+sl} {base-h*.45} '
    if steps >= 2: d += f'L{x+sl*.6} {base-h*.45} L{x+sl*1.4} {top+h*.12} '
    d += f'L{x+sl*1.9} {top} L{x+w-sl*1.9} {top} L{x+w-sl*1.2} {top+h*.14} L{x+w-sl*.5} {base-h*.45} L{x+w-sl*.1} {base-h*.45} L{x+w} {base} Z'
    a(f'<path d="{d}" fill="{fill}" opacity="{op}"/>')
mesa(-40, 300, 150, HOR, '#b0553a', .8); mesa(1150, 260, 110, HOR, '#b0553a', .75); mesa(1400, 300, 150, HOR, '#b0553a', .8); mesa(520, 200, 70, HOR, '#b0553a', .7)
a(f'<rect x="0" y="{HOR-90}" width="{W}" height="110" fill="url(#haze)"/>')
mesa(60, 360, 190, HOR + 6, '#7c3330'); mesa(330, 190, 120, HOR + 6, '#7c3330'); mesa(1240, 330, 170, HOR + 6, '#7c3330')
a(f'<rect x="0" y="{HOR-40}" width="{W}" height="70" fill="url(#haze)" opacity=".7"/>')

# ---- plain
a(f'<path d="M0 {HOR} L{W} {HOR} L{W} {H} L0 {H} Z" fill="url(#ground)"/>')
for _ in range(90):  # dry scrub
    x = random.randint(0, W); y = random.randint(HOR + 6, H - 30); s = max(.4, (y - HOR) / 260)
    if abs(x - 900) < 360 * (1 - (y - HOR) / 260) ** 2.3 + 40 and y < 800: continue
    a(f'<ellipse cx="{x}" cy="{y}" rx="{10*s}" ry="{4*s}" fill="#2d1620" opacity=".55"/>')

# ---- the frontier town + skatepark on the far right
def front(x, w, h, base, fill, step):
    d = f'M{x} {base} L{x} {base-h} '
    if step == 1: d += f'L{x+w*.25} {base-h} L{x+w*.25} {base-h-h*.18} L{x+w*.75} {base-h-h*.18} L{x+w*.75} {base-h} '
    elif step == 2: d += f'L{x+w*.5} {base-h-h*.3} '
    else: d += f'L{x+w*.1} {base-h-h*.14} L{x+w*.9} {base-h-h*.14} '
    d += f'L{x+w} {base-h} L{x+w} {base} Z'
    a(f'<path d="{d}" fill="{fill}"/>')
x = 1060
while x < 1590:
    w = random.randint(26, 50); h = random.randint(16, 34); front(x, w, h, HOR + 8, '#3a1a26', random.choice([1, 2, 3]))
    for _ in range(random.randint(0, 2)):
        a(f'<rect x="{x+random.randint(4,max(5,w-8))}" y="{HOR+8-random.randint(8,h-4)}" width="3" height="4" fill="#ffd37a" opacity=".9"/>')
    x += w + random.randint(0, 6)
# water tower + steeple
a(f'<g fill="#2e1420"><rect x="1500" y="{HOR-58}" width="30" height="24" rx="3"/><path d="M1498 {HOR-58} L1515 {HOR-72} L1532 {HOR-58} Z"/>'
  f'<path d="M1504 {HOR-34} L1500 {HOR+8} M1526 {HOR-34} L1530 {HOR+8} M1515 {HOR-34} V{HOR+8}" stroke="#2e1420" stroke-width="2.4"/></g>')
a(f'<g fill="#2e1420"><rect x="1150" y="{HOR-52}" width="14" height="52"/><path d="M1146 {HOR-52} L1157 {HOR-78} L1168 {HOR-52} Z"/><rect x="1156" y="{HOR-88}" width="2" height="12"/></g>')
a(f'<rect x="1020" y="{HOR-30}" width="600" height="70" fill="url(#haze)" opacity=".55"/>')

# skatepark at the town edge
a('<g id="park">')
a('<ellipse cx="1290" cy="722" rx="330" ry="46" fill="#7a4630" opacity=".85"/>')
a('<path d="M1010 702 L1560 702 L1640 770 L930 770 Z" fill="#8c5a44"/><path d="M1010 702 L1560 702 L1640 770 L930 770" fill="none" stroke="#ffc07a" stroke-width="1.5" opacity=".6"/>')
a('<ellipse cx="1330" cy="738" rx="90" ry="19" fill="#ffc07a" opacity=".85"/><ellipse cx="1330" cy="741" rx="82" ry="15" fill="#2a1420"/><ellipse cx="1330" cy="745" rx="56" ry="8" fill="#170b13"/>')
a('<path d="M1050 760 L1050 722 Q1054 756 1104 760 Z" fill="#2a1420"/><path d="M1050 722 Q1054 756 1104 760" fill="none" stroke="#ffc88a" stroke-width="2"/>')
a('<path d="M1150 754 L1150 738 L1170 738 L1170 730 L1190 730 L1190 722 L1210 722 L1210 754 Z" fill="#2a1420"/><path d="M1150 738 L1170 738 L1170 730 L1190 730 L1190 722 L1210 722" fill="none" stroke="#ffc88a" stroke-width="1.6"/>')
a('<path d="M1232 752 L1282 747" stroke="#ffc88a" stroke-width="2.4"/><path d="M1238 752 v7 M1276 748 v7" stroke="#2a1420" stroke-width="2.4"/>')
a('<path d="M1460 762 L1480 730 L1530 730 L1550 762 Z" fill="#2a1420"/><path d="M1460 762 L1480 730 L1530 730 L1550 762" fill="none" stroke="#ffc88a" stroke-width="1.6"/>')
for lx in (1000, 1160, 1420, 1580):
    a(f'<circle cx="{lx}" cy="672" r="44" fill="url(#lamp)"/><rect x="{lx-1.2}" y="672" width="2.4" height="64" fill="#2a1420"/><circle cx="{lx}" cy="672" r="3.4" fill="#fff0c0"/>')
def tiny(x, y, s=1, air=0, lean=0):
    a(f'<g transform="translate({x},{y-air}) scale({s}) rotate({lean})" fill="#140812"><circle cx="0" cy="-17" r="2.6"/><path d="M-3 -14 L3 -14 L2.4 -4 L-2.4 -4 Z"/><path d="M-3 -4 L-6 4 M3 -4 L7 3" stroke="#140812" stroke-width="2.4"/>'
      f'<rect x="-9" y="6" width="18" height="2.4" rx="1.2" transform="rotate({-8 if air else 0})"/><path d="M-3 -13 L-9 -8 M3 -13 L9 -9" stroke="#140812" stroke-width="2"/></g>')
tiny(1330, 728, 1.2, air=26, lean=-8); tiny(1180, 746, 1.05); tiny(1078, 758, 1.05, lean=6); tiny(1490, 758, 1.0)
a('</g>')

# ---- the blacktop road (perspective, winding to the sun)
def bez(t):
    p0, p1, p2, p3 = (870, 910), (790, 790), (1010, 720), (935, HOR + 6)
    u = 1 - t
    return (u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0], u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1])
def half(t, k=1.0): return (600 * (1 - t) ** 2.4 + 3) * k
N = 90; C = [bez(i / N) for i in range(N + 1)]
def ribbon(k, fill, extra=''):
    L = [(C[i][0] - half(i / N, k), C[i][1]) for i in range(N + 1)]; R = [(C[i][0] + half(i / N, k), C[i][1]) for i in range(N + 1)][::-1]
    pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in L + R); a(f'<polygon points="{pts}" fill="{fill}" {extra}/>')
ribbon(1.13, '#9a5a3a', 'opacity=".7"')     # dusty shoulder
ribbon(1.0, 'url(#road)')                    # asphalt
ribbon(0.985, 'none', 'stroke="#ffd9a0" stroke-width="1.2" opacity=".35"')
for i in range(2, N - 2, 6):                 # double-yellow centre line, dashed
    for off in (-0.022, 0.022):
        p, q = C[i], C[min(N, i + 3)]
        wp, wq = half(i / N) * .02 + .5, half((i + 3) / N) * .02 + .5
        xo = lambda t, w: half(t) * off
        a(f'<polygon points="{p[0]+xo(i/N,0)-wp:.1f},{p[1]:.1f} {p[0]+xo(i/N,0)+wp:.1f},{p[1]:.1f} {q[0]+xo((i+3)/N,0)+wq:.1f},{q[1]:.1f} {q[0]+xo((i+3)/N,0)-wq:.1f},{q[1]:.1f}" fill="#ffc83d"/>')
for i in range(3, N - 3, 4):                 # edge dashes
    for sgn in (-1, 1):
        p, q = C[i], C[min(N, i + 2)]; hp, hq = half(i / N) * .9, half((i + 2) / N) * .9
        wp, wq = half(i / N) * .012 + .4, half((i + 2) / N) * .012 + .4
        a(f'<polygon points="{p[0]+sgn*hp-wp:.1f},{p[1]:.1f} {p[0]+sgn*hp+wp:.1f},{p[1]:.1f} {q[0]+sgn*hq+wq:.1f},{q[1]:.1f} {q[0]+sgn*hq-wq:.1f},{q[1]:.1f}" fill="#f3dcb0" opacity=".55"/>')
a(f'<path d="M500 800 C560 790 620 830 700 826" stroke="#0a0508" stroke-width="3" fill="none" opacity=".5"/>')   # crack
# telegraph poles with sagging wires down the left shoulder
poles = []
for t in (.10, .27, .43, .57, .68, .77):
    x = C[int(t*N)][0] - half(t, 1.22); y = C[int(t*N)][1]; h = 300 * (1 - t) ** 2.0 + 16; poles.append((x, y, h))
a('<g stroke="#1b0c14" fill="none">')
for (x, y, h) in poles:
    s = h / 300
    a(f'<path d="M{x} {y} V{y-h}" stroke-width="{max(1.4, 9*s):.1f}"/><path d="M{x-24*s} {y-h+14*s} H{x+24*s}" stroke-width="{max(1.2, 5*s):.1f}"/>')
for (x1, y1, h1), (x2, y2, h2) in zip(poles, poles[1:]):
    for dx in (-18, 0, 18):
        a(f'<path d="M{x1+dx*h1/300} {y1-h1+14*h1/300} Q{(x1+x2)/2} {max(y1-h1,y2-h2)+30*h1/300+6} {x2+dx*h2/300} {y2-h2+14*h2/300}" stroke-width="1.1" opacity=".8"/>')
a('</g>')

# saguaros
def saguaro(x, base, h, fill, arms=((-1, .45, .20), (1, .62, .17))):
    w = max(3, h * .085)
    a(f'<g stroke="{fill}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="{w:.1f}"><path d="M{x} {base} V{base-h}"/>')
    for (sg, yy, ln) in arms:
        ay = base - h * yy
        a(f'<path d="M{x} {ay} H{x+sg*h*ln} V{ay-h*.22}"/>')
    a('</g>')
for (x, b, h) in [(180, 700, 110), (230, 712, 70), (700, 668, 34), (760, 664, 24), (1020, 662, 22), (60, 690, 62)]:
    saguaro(x, b, h, '#341822')
saguaro(1545, 900, 400, '#150a10', arms=((-1, .45, .16), (1, .62, .12))); saguaro(1600, 900, 240, '#150a10', arms=((-1, .5, .18),))
# tumbleweed
a('<g fill="none" stroke="#1a0b12" stroke-width="1.6" opacity=".9" transform="translate(1180,842)"><circle r="22"/><circle r="15" transform="rotate(30)"/><path d="M-22 0 Q0 -14 22 0 M-18 -12 Q0 8 18 12 M-8 -21 Q12 0 -8 21 M8 -21 Q-14 2 6 21"/></g>')

# ---- the outlaw (stands on the left lane, wind from the left)
SC = 1.06; GX, GY = 650, 810
a(f'<g transform="translate({GX-100*SC},{GY-381*SC}) scale({SC})">')
a('<g transform="translate(3.4,-1.4)" opacity=".95"><use href="#body" fill="#ffa24d"/><use href="#board" fill="#ffa24d"/></g>')
a('<use href="#body" fill="#0c0508"/><use href="#board" fill="#190d14"/>')
a('</g>')
a(f'<path d="M{GX-120} {GY-8} C{GX-210} {GY+18} {GX-380} {GY+50} {GX-540} {GY+96} L{GX-560} {GY+128} C{GX-380} {GY+96} {GX-170} {GY+40} {GX+30} {GY+4} Z" fill="#06030a" opacity=".55" filter="url(#soft)"/>')

# dust motes in the light
for _ in range(70):
    x = random.randint(0, W); y = random.randint(380, 820); r = random.choice([1, 1, 1.4, 2])
    a(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#ffd9a0" opacity="{random.uniform(.15,.5):.2f}"/>')

# ---- title lockup
if WITH_TITLE:
    a('<g text-anchor="middle" font-family="DejaVu Serif, Liberation Serif, serif" font-weight="700">')
    def stars(cx, y, n=5, r=9, fill='#ffd36a'):
        for i in range(n):
            x = cx + (i - (n - 1) / 2) * r * 3.2
            pts = ' '.join(f'{x + (r if k % 2 == 0 else r*.42) * math.sin(k*math.pi/5):.1f},{y - (r if k % 2 == 0 else r*.42) * math.cos(k*math.pi/5):.1f}' for k in range(10))
            a(f'<polygon points="{pts}" fill="{fill}" stroke="#2a0f14" stroke-width="1.5"/>')
    stars(800, 76, 3, 10)
    a('<path d="M470 106 H1130" stroke="#2a0f14" stroke-width="9"/><path d="M470 106 H1130" stroke="#ffd36a" stroke-width="3"/>')
    for (txt, y, fs, ls) in [('BLACKTOP', 200, 112, 14), ('OUTLAWS', 332, 150, 10)]:
        for d in range(14, 0, -2):  # extruded wood-type shadow
            a(f'<text x="800" y="{y+d}" font-size="{fs}" letter-spacing="{ls}" fill="#3a130f">{txt}</text>')
        a(f'<text x="800" y="{y}" font-size="{fs}" letter-spacing="{ls}" fill="url(#gold)" stroke="#2a0f14" stroke-width="5" paint-order="stroke">{txt}</text>')
    a('<path d="M560 372 H1040" stroke="#2a0f14" stroke-width="7"/><path d="M560 372 H1040" stroke="#ffd36a" stroke-width="2.4"/>')
    stars(800, 372, 1, 11)
    a('</g>')

a(f'<rect width="{W}" height="{H}" fill="url(#vig)"/>')
a(f'<rect width="{W}" height="{H}" filter="url(#grain)" opacity=".85"/>')
a('</svg>')
out = 'blacktop-outlaws.svg' if WITH_TITLE else 'blacktop-outlaws-notitle.svg'
open(out, 'w').write('\n'.join(o)); print('wrote', out)
