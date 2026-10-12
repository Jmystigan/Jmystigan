// "WANTED" poster for a player profile, as an SVG string (so it can also be saved as a PNG to share).
// Every dynamic value goes through esc(); nothing is interpolated raw.
import { esc, fmt, state } from './util.js';

const BANDANAS = ['#c4492a', '#2f6f73', '#d98e2b', '#7a3b73', '#3d7a3a', '#2a4f8c'];
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

export function posterSvg(p, { name = state.cfg.gameName } = {}) {
  const user = String(p.username).toUpperCase(), h = hash(p.username);
  const band = BANDANAS[h % BANDANAS.length];
  const nameSize = Math.max(30, Math.min(60, 560 / Math.max(user.length, 8) * 1.12));
  const nameFit = user.length * nameSize * 0.66 > 500 ? ` textLength="500" lengthAdjust="spacingAndGlyphs"` : '';
  const tricks = (p.tricks ?? []).slice(0, 6);
  const home = p.homePark ? clip(p.homePark.name, 30).toUpperCase() : 'THE OPEN ROAD';
  const trickRows = tricks.length
    ? tricks.map((t, i) => `<text x="${i % 2 ? 330 : 100}" y="${742 + Math.floor(i / 2) * 25}" font-size="18">★ ${esc(clip(t.name, 17).toUpperCase())} ×${esc(fmt(t.landed))}</text>`).join('')
    : '<text x="300" y="750" font-size="18" text-anchor="middle">NO CRIMES YET — GET OUT AND SKATE</text>';
  const reward = `${fmt(p.bestScore)} PTS`;
  const rewardSize = reward.length > 11 ? 46 : 60;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900" role="img" aria-label="Wanted poster for ${esc(p.username)}">
<defs>
  <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="${h % 50}" result="n"/>
    <feColorMatrix in="n" values="0 0 0 0 .4  0 0 0 0 .25  0 0 0 0 .1  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  <radialGradient id="burn" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-color="#7a4a1a" stop-opacity="0"/><stop offset="1" stop-color="#4a2410" stop-opacity=".55"/></radialGradient>
  <radialGradient id="vig" cx=".5" cy=".45" r=".7"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2b1810" stop-opacity=".6"/></radialGradient>
  <linearGradient id="photo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8c08c"/><stop offset="1" stop-color="#b9975a"/></linearGradient>
</defs>
<g font-family="Rockwell Extra Bold, Rockwell, Roboto Slab, DejaVu Serif, Georgia, serif" font-weight="800" fill="#2b1810" text-anchor="middle">
  <path d="M12 8 L588 14 L592 450 L587 892 L16 886 L8 460 Z" fill="#ecd7a8"/>
  <path d="M12 8 L588 14 L592 450 L587 892 L16 886 L8 460 Z" filter="url(#paper)" fill="#fff"/>
  <path d="M12 8 L588 14 L592 450 L587 892 L16 886 L8 460 Z" fill="url(#burn)"/>
  <rect x="30" y="30" width="540" height="840" fill="none" stroke="#2b1810" stroke-width="5"/><rect x="40" y="40" width="520" height="820" fill="none" stroke="#2b1810" stroke-width="1.5"/>
  <text x="300" y="128" font-size="104" textLength="452" lengthAdjust="spacingAndGlyphs">WANTED</text>
  <path d="M70 148 H530" stroke="#2b1810" stroke-width="5"/><path d="M70 157 H530" stroke="#2b1810" stroke-width="1.5"/>
  <text x="300" y="184" font-size="17" letter-spacing="4" textLength="440" lengthAdjust="spacingAndGlyphs">FOR SHREDDING THE BLACKTOP</text>

  <rect x="130" y="200" width="340" height="238" fill="url(#photo)" stroke="#2b1810" stroke-width="6"/>
  <g clip-path="url(#frame)"><clipPath id="frame"><rect x="130" y="200" width="340" height="238"/></clipPath>
    <g transform="translate(300 318) scale(.94)" fill="#2b1810">
      <path d="M-150 150 C-140 70 -88 56 -52 52 L52 52 C88 56 140 70 150 150 Z"/>
      <rect x="-14" y="22" width="28" height="36"/>
      <ellipse cx="0" cy="-8" rx="34" ry="40"/>
      <path d="M-40 4 Q0 40 40 4 L48 22 Q0 62 -48 22 Z" fill="${band}"/>
      <ellipse cx="0" cy="-34" rx="92" ry="15"/><path d="M-46 -34 C-50 -92 -20 -112 0 -104 C20 -112 50 -92 46 -34 Z"/>
      <rect x="-46" y="-52" width="92" height="9" fill="${band}"/>
    </g>
    <rect x="130" y="200" width="340" height="238" fill="url(#vig)"/></g>
  <rect x="130" y="200" width="340" height="238" fill="none" stroke="#2b1810" stroke-width="6"/>

  <text x="300" y="494" font-size="${nameSize.toFixed(1)}" letter-spacing="2"${nameFit}>${esc(user)}</text>
  <text x="300" y="526" font-size="20" letter-spacing="4">LEVEL ${esc(p.level)} OUTLAW</text>
  <path d="M110 544 H490" stroke="#2b1810" stroke-width="2.5" stroke-dasharray="3 7"/>
  <text x="300" y="582" font-size="24" letter-spacing="8">REWARD</text>
  <text x="300" y="${582 + rewardSize * 0.95}" font-size="${rewardSize}">${esc(reward)}</text>
  <text x="300" y="680" font-size="17" letter-spacing="1.5">BEST COMBO ×${esc(fmt(p.bestCombo))}  ·  ${esc(p.tricks?.length ?? 0)} TRICKS KNOWN</text>
  <text x="300" y="716" font-size="19" letter-spacing="4">WANTED FOR:</text>
  <g text-anchor="${tricks.length ? 'start' : 'middle'}">${trickRows}</g>
  <path d="M110 818 H490" stroke="#2b1810" stroke-width="2.5" stroke-dasharray="3 7"/>
  <text x="300" y="840" font-size="16" letter-spacing="3" textLength="${Math.min(430, (13 + home.length) * 12.5)}" lengthAdjust="spacingAndGlyphs">LAST SEEN AT ${esc(home)}</text>
  <text x="300" y="855" font-size="10" letter-spacing="6" opacity=".7">${esc(String(name).toUpperCase())}</text>
  ${p.private ? '<g transform="rotate(-12 300 372)"><rect x="180" y="344" width="240" height="56" fill="#ecd7a8" fill-opacity=".55" stroke="#a82a22" stroke-width="5" rx="4"/><text x="300" y="386" font-size="38" fill="#a82a22" letter-spacing="6">PRIVATE</text></g>' : ''}
  <g fill="#2b1810" stroke="none"><circle cx="52" cy="52" r="6"/><circle cx="548" cy="52" r="6"/><circle cx="52" cy="848" r="6"/><circle cx="548" cy="848" r="6"/></g>
</g></svg>`;
}

/** Save the poster as a PNG (renders the SVG to a canvas in the browser; nothing is uploaded). */
export function downloadPoster(svg, filename) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1800;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1200, 1800);
    c.toBlob((blob) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
