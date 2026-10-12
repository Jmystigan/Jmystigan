import random
random.seed(8)
W, H = 1600, 900
o = []
a = o.append

a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
a('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#15153a"/><stop offset=".30" stop-color="#4a2f78"/><stop offset=".55" stop-color="#b8487a"/>
  <stop offset=".72" stop-color="#ff7a3d"/><stop offset=".86" stop-color="#ffb868"/><stop offset="1" stop-color="#ffe0a0"/></linearGradient>
<radialGradient id="sunglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c8" stop-opacity=".95"/><stop offset=".25" stop-color="#ffc27a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>
<radialGradient id="lamp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffb35a" stop-opacity=".4"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb07a" stop-opacity="0"/><stop offset=".6" stop-color="#ff9a78" stop-opacity=".45"/><stop offset="1" stop-color="#b8487a" stop-opacity="0"/></linearGradient>
<linearGradient id="plain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3a62"/><stop offset="1" stop-color="#241833"/></linearGradient>
<linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241638"/><stop offset="1" stop-color="#07050f"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#05030c" stop-opacity=".7"/></radialGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/>
  <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0"/></filter>
<filter id="soft"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="soft6"><feGaussianBlur stdDeviation="7"/></filter>

<!-- skater body (back view). Fill is inherited so we can reuse it for the rim-light pass. -->
<g id="body">
  <ellipse cx="101" cy="46" rx="17" ry="20"/>
  <ellipse cx="84" cy="49" rx="3.5" ry="6"/><ellipse cx="118" cy="49" rx="3.5" ry="6"/>
  <path d="M82 42 C80 14 122 12 120 42 C112 37 90 37 82 42 Z"/>                    <!-- snapback -->
  <rect x="94" y="37" width="14" height="5" rx="2"/>
  <path d="M93 62 L109 62 L111 76 L91 76 Z"/>
  <path d="M72 88 C84 76 120 76 132 88 C136 96 128 100 100 100 C74 100 66 96 72 88 Z"/>   <!-- hood -->
  <path d="M68 97 C61 122 69 166 71 210 L131 210 C133 166 141 126 135 100 C124 86 78 86 68 97 Z"/>
  <path d="M66 204 Q101 220 136 204 L138 222 Q101 234 64 222 Z"/>                          <!-- hoodie hem -->
  <path d="M69 98 C47 112 36 152 50 190 L68 216 L80 205 L66 178 C62 152 72 126 82 106 Z"/> <!-- left arm, hand in pocket -->
  <path d="M134 100 C153 114 160 152 153 196 L139 205 C141 162 132 130 121 106 Z"/>        <!-- right arm -->
  <circle cx="146" cy="205" r="8"/>
  <path d="M72 216 C60 262 70 310 71 349 L101 349 C100 310 100 262 103 218 Z"/>           <!-- loose pants -->
  <path d="M98 218 C102 262 99 310 104 349 L135 349 C137 310 134 262 129 216 Z"/>
  <ellipse cx="86" cy="347" rx="19" ry="7"/><ellipse cx="119" cy="347" rx="19" ry="7"/>
  <path d="M60 346 L102 346 L104 366 Q104 379 93 379 L56 379 Q46 379 49 366 Z"/>           <!-- skate shoes -->
  <path d="M100 346 L141 346 Q151 352 153 366 Q155 379 144 379 L106 379 Q98 379 98 366 Z"/>
</g>
<g id="board">
  <rect x="148" y="190" width="38" height="196" rx="19"/>
  <rect x="146" y="226" width="42" height="9" rx="3" fill="#2a1d3d"/><rect x="146" y="342" width="42" height="9" rx="3" fill="#2a1d3d"/>
  <circle cx="145" cy="216" r="8" fill="#241838"/><circle cx="145" cy="246" r="8" fill="#241838"/>
  <circle cx="145" cy="332" r="8" fill="#241838"/><circle cx="145" cy="362" r="8" fill="#241838"/>
</g>
</defs>''')

# sky, sun, clouds, birds
a(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')
a('<circle cx="1030" cy="545" r="440" fill="url(#sunglow)"/>')
a('<circle cx="1030" cy="552" r="72" fill="#fff3cf"/>')
for (cx, cy, rx, ry, op) in [(300,170,260,16,.35),(520,230,210,11,.30),(1250,140,300,18,.30),(1100,250,230,12,.35),(760,330,260,10,.4),(1400,330,200,9,.4),(200,380,240,9,.35)]:
    a(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#ffd0c8" opacity="{op}" filter="url(#soft6)"/>')
for (x, y, s) in [(1180,300,1.0),(1230,326,.8),(1140,340,.7),(640,260,.9)]:
    a(f'<path d="M{x} {y} q{12*s} {-10*s} {24*s} 0 q{12*s} {-10*s} {24*s} 0" fill="none" stroke="#2a1838" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>')

# far skyline
def skyline(base, fill, op, hmin, hmax, step, towers=(), windows=False):
    x = -20; d = []
    while x < W + 20:
        w = random.randint(28, 70); h = random.randint(hmin, hmax)
        for (tx0, tx1, th) in towers:
            if tx0 <= x <= tx1: h = random.randint(th - 40, th + 40)
        if 960 <= x <= 1100: h = random.randint(24, 52)   # keep a gap so the sun shows through the skyline
        d.append((x, w, h)); x += w + random.randint(-4, step)
    a(f'<g fill="{fill}" opacity="{op}">')
    for (x, w, h) in d:
        a(f'<rect x="{x}" y="{base-h}" width="{w}" height="{h+4}"/>')
        if h > 120 and random.random() < .5: a(f'<rect x="{x+w/2-1.5}" y="{base-h-28}" width="3" height="28"/>')
    a('</g>')
    if windows:
        a('<g fill="#ffd37a" opacity=".85">')
        for (x, w, h) in d:
            for _ in range(int(h/22)):
                if random.random() < .35:
                    a(f'<rect x="{x+random.randint(4,max(5,w-8))}" y="{base-random.randint(8,h-6)}" width="3" height="4"/>')
        a('</g>')
skyline(612, '#a8627e', .96, 40, 170, 6, towers=[(520,940,270)])
skyline(626, '#6b4170', 1, 30, 110, 10, windows=True)
a(f'<rect x="0" y="540" width="{W}" height="120" fill="url(#mist)"/>')

# mid hills + plain
a('<path d="M0 640 C200 610 360 640 560 626 C760 610 980 640 1220 624 C1400 612 1500 632 1600 626 L1600 900 L0 900 Z" fill="#43285a"/>')
a(f'<path d="M0 650 C300 636 700 652 1000 642 C1250 634 1450 646 1600 640 L1600 900 L0 900 Z" fill="url(#plain)"/>')
# trees on the plain
for x in range(540, 1580, 34):
    if random.random() < .8:
        r = random.randint(10, 20); y = 656 + random.randint(0, 12)
        a(f'<g fill="#2b1a3d" opacity=".95"><rect x="{x-1.5}" y="{y}" width="3" height="9"/><ellipse cx="{x}" cy="{y-2}" rx="{r*0.8}" ry="{r}"/></g>')

# winding path from the hill down to the park
a('<path d="M700 790 C760 770 820 752 800 730 C786 714 840 704 880 700" fill="none" stroke="#8a6490" stroke-width="9" stroke-linecap="round" opacity=".55"/>')
# --- the skatepark in the distance ---
a('<g id="park">')
a('<ellipse cx="1120" cy="728" rx="440" ry="66" fill="#3a2a4c" opacity=".85"/>')
a('<path d="M880 676 L1350 676 L1450 770 L790 770 Z" fill="#6b4a76"/>')
a('<path d="M880 676 L1350 676 L1450 770 L790 770 Z" fill="none" stroke="#ffb878" stroke-width="1.5" opacity=".55"/>')
a('<path d="M880 676 L1350 676" stroke="#3a2a4c" stroke-width="5"/><path d="M790 770 L880 676 M1450 770 L1350 676" stroke="#3a2a4c" stroke-width="4"/>')
# bowl
a('<ellipse cx="1180" cy="726" rx="92" ry="21" fill="#ffb878" opacity=".85"/>')
a('<ellipse cx="1180" cy="730" rx="84" ry="17" fill="#1d1229"/>')
a('<ellipse cx="1180" cy="735" rx="58" ry="9" fill="#120a1c"/>')
# quarter pipe
a('<path d="M905 756 L905 708 Q910 750 962 756 Z" fill="#231633"/><path d="M905 708 Q910 750 962 756" fill="none" stroke="#ffc088" stroke-width="2"/>')
# stairs + hubba
a('<path d="M1010 742 L1010 724 L1030 724 L1030 716 L1050 716 L1050 708 L1070 708 L1070 742 Z" fill="#281a38"/>')
a('<path d="M1010 724 L1030 724 L1030 716 L1050 716 L1050 708 L1070 708" fill="none" stroke="#ffc088" stroke-width="1.6"/>')
# rail
a('<path d="M1090 738 L1146 732" stroke="#ffc088" stroke-width="2.4"/><path d="M1096 738 v8 M1140 733 v8" stroke="#231633" stroke-width="2.4"/>')
# funbox
a('<path d="M1306 752 L1330 716 L1384 716 L1408 752 Z" fill="#281a38"/><path d="M1306 752 L1330 716 L1384 716 L1408 752" fill="none" stroke="#ffc088" stroke-width="1.6"/>')
# lights
for x in (850, 1000, 1275, 1425):
    a(f'<circle cx="{x}" cy="640" r="46" fill="url(#lamp)"/><rect x="{x-1.2}" y="640" width="2.4" height="70" fill="#1d1229"/><circle cx="{x}" cy="640" r="3.4" fill="#fff0c0"/>')
# tiny skaters
def tiny(x, y, s=1, air=0, lean=0):
    a(f'<g transform="translate({x},{y-air}) scale({s}) rotate({lean})" fill="#10091a"><circle cx="0" cy="-17" r="2.6"/><path d="M-3 -14 L3 -14 L2.4 -4 L-2.4 -4 Z"/><path d="M-3 -4 L-6 4 M3 -4 L7 3" stroke="#10091a" stroke-width="2.4"/>'
      f'<rect x="-9" y="6" width="18" height="2.4" rx="1.2" transform="rotate({-8 if air else 0})"/><path d="M-3 -13 L-9 -8 M3 -13 L9 -9" stroke="#10091a" stroke-width="2"/></g>')
tiny(1180, 700, 1.15, air=24, lean=-8)
tiny(1040, 706, 1.0)
tiny(940, 740, 1.0, lean=6)
tiny(1346, 714, .95)
a('<g fill="#10091a"><circle cx="1120" cy="722" r="2.4"/><rect x="1117.5" y="724" width="5" height="9"/><circle cx="1212" cy="750" r="2.4"/><rect x="1209.5" y="752" width="5" height="9"/></g>')
a('</g>')

# foreground hill
ridge = "M0 650 C120 668 200 690 330 702 C470 714 560 740 760 796 C940 846 1180 880 1600 896 L1600 900 L0 900 Z"
a(f'<path d="{ridge}" fill="url(#hill)"/>')
a('<path d="M0 650 C120 668 200 690 330 702 C470 714 560 740 760 796 C940 846 1180 880 1600 896" fill="none" stroke="#ff9a5a" stroke-width="2" opacity=".35"/>')
# grass tufts along the ridge near the skater
def ridge_y(x):  # approximate by sampling the path via linear pieces
    pts = [(0,650),(120,668),(200,690),(330,702),(470,714),(560,740),(760,796)]
    for (x0,y0),(x1,y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1: return y0 + (y1-y0)*(x-x0)/(x1-x0)
    return 796
a('<g fill="#0b0716">')
for _ in range(70):
    x = random.randint(0, 760); y = ridge_y(x) + random.randint(-2, 6); h = random.randint(10, 30); w = random.randint(3, 6)
    lean = random.randint(-8, 8)
    a(f'<path d="M{x} {y} Q{x+lean/2} {y-h*0.6} {x+lean} {y-h} Q{x+w} {y-h*0.5} {x+w} {y} Z"/>')
a('</g>')

# the skater (stands on ridge at x~340), rim-lit from the sun
a('<g transform="translate(255,280) scale(1.12)">')
a('<g transform="translate(3.2,-1.4)" opacity=".95"><use href="#body" fill="#ff9d4d"/><use href="#board" fill="#ff9d4d" transform="rotate(-5 166 386)"/></g>')
a('<use href="#body" fill="#0a0714"/>')
a('<g transform="rotate(-5 166 386)"><use href="#board" fill="#150f22"/></g>')
a('</g>')
a('<path d="M300 706 C250 722 140 752 40 800 L10 830 C140 800 280 770 420 724 Z" fill="#05030c" opacity=".55" filter="url(#soft)"/>')

# atmosphere, vignette, grain
a(f'<rect width="{W}" height="{H}" fill="url(#vig)"/>')
a(f'<rect width="{W}" height="{H}" filter="url(#grain)" opacity=".8"/>')
a('</svg>')
open('skater-overlook.svg', 'w').write('\n'.join(o))
print('svg written', sum(len(x) for x in o))
