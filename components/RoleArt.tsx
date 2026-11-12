/** Sticker-style illustrations in the logo's colours, used on the landing and guide pages. */

const INK = '#1F0A45';
const CREAM = '#FBF6E6';
const YELLOW = '#FFD91A';
const PINK = '#FF1A9A';
const MINT = '#1FEFD0';

function star(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const TOP = [26, 39.6, 53.2, 66.8, 80.4, 94];
const BOTTOM = [14, 32.4, 50.8, 69.2, 87.6, 106];

function Stall() {
  return (
    <>
      <path d="M22 60V102M98 60V102" />
      {TOP.slice(0, 5).map((x, i) => (
        <path
          key={x}
          d={`M${x} 22H${TOP[i + 1]}L${BOTTOM[i + 1]} 52a9.2 9.2 0 0 1-18.4 0Z`}
          fill={i % 2 === 0 ? PINK : CREAM}
        />
      ))}
      <rect x="14" y="82" width="92" height="22" rx="5" fill={YELLOW} />
      <polygon points={star(60, 93, 7, 3)} fill={INK} stroke="none" />
    </>
  );
}

function Tag() {
  return (
    <>
      <path d="M56 12 104 18 108 66 62 110 12 60Z" fill={YELLOW} />
      <circle cx="87" cy="35" r="7" fill={CREAM} />
      <path d="M64 42 44 70H58L50 92 78 60H63Z" fill={PINK} />
    </>
  );
}

function Clipboard() {
  return (
    <>
      <rect x="24" y="20" width="68" height="90" rx="9" fill={CREAM} />
      <rect x="42" y="11" width="32" height="18" rx="6" fill={MINT} />
      {[46, 64, 82].map((y, i) => (
        <g key={y}>
          <rect x="34" y={y - 6} width="12" height="12" rx="3" fill={i < 2 ? YELLOW : CREAM} />
          <path d={`M54 ${y}H${i === 2 ? 68 : 82}`} />
        </g>
      ))}
      <polygon points={star(88, 90, 21, 9.5)} fill={PINK} />
    </>
  );
}

const ART = { stall: Stall, tag: Tag, clipboard: Clipboard } as const;

export default function RoleArt({ kind, tone = 'pink' }: { kind: keyof typeof ART; tone?: 'pink' | 'yellow' | 'mint' }) {
  const Art = ART[kind];
  return (
    <span className={`role-art${tone === 'pink' ? '' : ` role-art--${tone}`}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" fill="none" stroke={INK} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <Art />
      </svg>
    </span>
  );
}

/** Small decorations for the purple burst sections. */
export function Sparks() {
  return (
    <>
      <svg className="spark" style={{ top: '9%', right: '7%', width: 'clamp(46px, 8vw, 96px)' }} viewBox="0 0 60 90" aria-hidden="true">
        <path d="M34 4 8 50H26L18 86 52 34H32Z" fill={MINT} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <svg className="spark" style={{ top: '16%', left: '6%', width: 'clamp(34px, 6vw, 70px)' }} viewBox="0 0 60 60" aria-hidden="true">
        <polygon points={star(30, 30, 26, 9)} fill={YELLOW} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <svg className="spark" style={{ top: '46%', left: '11%', width: 'clamp(22px, 4vw, 44px)' }} viewBox="0 0 60 60" aria-hidden="true">
        <path d="M30 4C32 20 40 28 56 30 40 32 32 40 30 56 28 40 20 32 4 30 20 28 28 20 30 4Z" fill={PINK} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <svg className="spark" style={{ top: '40%', right: '13%', width: 'clamp(20px, 3.4vw, 38px)' }} viewBox="0 0 60 60" aria-hidden="true">
        <path d="M30 4C32 20 40 28 56 30 40 32 32 40 30 56 28 40 20 32 4 30 20 28 28 20 30 4Z" fill={CREAM} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </>
  );
}
