'use client';

// Inline SVG flag components. viewBox="0 0 30 20" (3:2 ratio)
// Each flag is a pure function returning SVG child elements.

type FlagFn = () => JSX.Element;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Horizontal stripes, equal height */
function HStripes({ colors }: { colors: string[] }) {
  const h = 20 / colors.length;
  return (
    <>
      {colors.map((c, i) => (
        <rect key={i} x={0} y={i * h} width={30} height={h} fill={c} />
      ))}
    </>
  );
}

/** Vertical stripes, equal width */
function VStripes({ colors }: { colors: string[] }) {
  const w = 30 / colors.length;
  return (
    <>
      {colors.map((c, i) => (
        <rect key={i} x={i * w} y={0} width={w} height={20} fill={c} />
      ))}
    </>
  );
}

/**
 * Nordic cross: full bg rectangle + cross overlay.
 * Cross vertical bar at x1-x2, horizontal at y1-y2, optional inner stripe.
 */
function NordicCross({
  bg, cross, x1 = 11, x2 = 15, y1 = 7, y2 = 13, innerColor, innerSize = 1.5,
}: {
  bg: string; cross: string;
  x1?: number; x2?: number; y1?: number; y2?: number;
  innerColor?: string; innerSize?: number;
}) {
  return (
    <>
      <rect width={30} height={20} fill={bg} />
      {/* Horizontal bar */}
      <rect x={0} y={y1} width={30} height={y2 - y1} fill={cross} />
      {/* Vertical bar */}
      <rect x={x1} y={0} width={x2 - x1} height={20} fill={cross} />
      {/* Inner stripe (e.g. Norway, Iceland) */}
      {innerColor && (
        <>
          <rect x={0} y={y1 + innerSize} width={30} height={y2 - y1 - 2 * innerSize} fill={innerColor} />
          <rect x={x1 + innerSize} y={0} width={x2 - x1 - 2 * innerSize} height={20} fill={innerColor} />
        </>
      )}
    </>
  );
}

// ── Flag definitions ──────────────────────────────────────────────────────────

const FLAGS: Record<string, FlagFn> = {
  // ── Americas ─────────────────────────────────────────────────────────────

  US: () => (
    <>
      {/* 13 stripes */}
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={0} y={i * (20 / 13)} width={30} height={20 / 13}
          fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
      ))}
      {/* Blue canton */}
      <rect x={0} y={0} width={12} height={10} fill="#3C3B6E" />
      {/* Stars: 9 cols × 5 rows simplified */}
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 6 }, (_, col) => (
          <circle key={`${row}-${col}`}
            cx={1 + col * 1.9} cy={1.2 + row * 1.8} r={0.5} fill="white" />
        ))
      )}
    </>
  ),

  CA: () => (
    <>
      <rect x={0} y={0} width={30} height={20} fill="#FFFFFF" />
      <rect x={0} y={0} width={7.5} height={20} fill="#FF0000" />
      <rect x={22.5} y={0} width={7.5} height={20} fill="#FF0000" />
      {/* Simplified maple leaf */}
      <path
        d="M15,3 L13.6,7.2 L9,5.5 L11.4,9 L7,10 L10.8,11 L10,14.5 L15,12.5 L20,14.5 L19.2,11 L23,10 L18.6,9 L21,5.5 L16.4,7.2 Z"
        fill="#FF0000"
      />
    </>
  ),

  BR: () => (
    <>
      <rect width={30} height={20} fill="#009C3B" />
      <polygon points="15,2 28,10 15,18 2,10" fill="#FFDF00" />
      <circle cx={15} cy={10} r={4.5} fill="#002776" />
      <path d="M11,8.5 Q15,5.5 19,8.5" stroke="#FFFFFF" strokeWidth={0.8} fill="none" />
    </>
  ),

  MX: () => (
    <>
      <VStripes colors={['#006847', '#FFFFFF', '#CE1126']} />
      {/* Simplified eagle */}
      <circle cx={15} cy={10} r={2} fill="#8B6914" opacity={0.7} />
    </>
  ),

  AR: () => (
    <>
      <HStripes colors={['#74ACDF', '#FFFFFF', '#74ACDF']} />
      {/* Sun of May */}
      <circle cx={15} cy={10} r={2.5} fill="#F6B40E" />
    </>
  ),

  CL: () => (
    <>
      <rect x={0} y={0} width={30} height={10} fill="#FFFFFF" />
      <rect x={0} y={10} width={30} height={10} fill="#D52B1E" />
      <rect x={0} y={0} width={10} height={10} fill="#0039A6" />
      <polygon points="5,2.5 5.9,5.2 8.8,5.2 6.4,6.9 7.3,9.5 5,7.8 2.7,9.5 3.6,6.9 1.2,5.2 4.1,5.2"
        fill="#FFFFFF" />
    </>
  ),

  CO: () => <HStripes colors={['#FCD116', '#FCD116', '#003087', '#CE1126']} />,

  PE: () => <VStripes colors={['#D91023', '#FFFFFF', '#D91023']} />,

  // ── Europe ───────────────────────────────────────────────────────────────

  GB: () => (
    <>
      <rect width={30} height={20} fill="#012169" />
      {/* White X */}
      <line x1={0} y1={0} x2={30} y2={20} stroke="white" strokeWidth={4} />
      <line x1={30} y1={0} x2={0} y2={20} stroke="white" strokeWidth={4} />
      {/* Red X (offset) */}
      <line x1={0} y1={0} x2={30} y2={20} stroke="#C8102E" strokeWidth={2} />
      <line x1={30} y1={0} x2={0} y2={20} stroke="#C8102E" strokeWidth={2} />
      {/* White cross */}
      <rect x={0} y={7.5} width={30} height={5} fill="white" />
      <rect x={12.5} y={0} width={5} height={20} fill="white" />
      {/* Red cross */}
      <rect x={0} y={8.5} width={30} height={3} fill="#C8102E" />
      <rect x={13.5} y={0} width={3} height={20} fill="#C8102E" />
    </>
  ),

  DE: () => <HStripes colors={['#000000', '#DD0000', '#FFCE00']} />,

  FR: () => <VStripes colors={['#002395', '#FFFFFF', '#ED2939']} />,

  NL: () => <HStripes colors={['#AE1C28', '#FFFFFF', '#21468B']} />,

  BE: () => <VStripes colors={['#000000', '#FAE042', '#EF3340']} />,

  IT: () => <VStripes colors={['#009246', '#FFFFFF', '#CE2B37']} />,

  ES: () => (
    <>
      <HStripes colors={['#C60B1E', '#FFC400', '#C60B1E']} />
      {/* Simplified coat of arms placeholder */}
      <rect x={9} y={6} width={5} height={8} fill="#AD1519" opacity={0.5} />
    </>
  ),

  PT: () => (
    <>
      <rect x={0} y={0} width={12} height={20} fill="#006600" />
      <rect x={12} y={0} width={18} height={20} fill="#FF0000" />
      <circle cx={12} cy={10} r={3.5} fill="#FFD700" stroke="#003399" strokeWidth={0.8} />
    </>
  ),

  CH: () => (
    <>
      <rect width={30} height={20} fill="#FF0000" />
      {/* White cross centered */}
      <rect x={11} y={5} width={8} height={10} fill="#FFFFFF" />
      <rect x={8} y={8} width={14} height={4} fill="#FFFFFF" />
    </>
  ),

  SE: () => <NordicCross bg="#006AA7" cross="#FECC02" />,

  NO: () => <NordicCross bg="#EF2B2D" cross="#FFFFFF" innerColor="#002868" innerSize={1.5} />,

  DK: () => <NordicCross bg="#C60C30" cross="#FFFFFF" x1={11} x2={15} />,

  FI: () => <NordicCross bg="#FFFFFF" cross="#003580" />,

  PL: () => <HStripes colors={['#FFFFFF', '#DC143C']} />,

  AT: () => <HStripes colors={['#ED2939', '#FFFFFF', '#ED2939']} />,

  CZ: () => (
    <>
      <HStripes colors={['#FFFFFF', '#D7141A']} />
      <polygon points="0,0 13,10 0,20" fill="#11457E" />
    </>
  ),

  GR: () => (
    <>
      {/* 9 stripes blue/white */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={0} y={i * (20 / 9)} width={30} height={20 / 9}
          fill={i % 2 === 0 ? '#0D5EAF' : '#FFFFFF'} />
      ))}
      <rect x={0} y={0} width={12} height={8.9} fill="#0D5EAF" />
      {/* White cross in canton */}
      <rect x={0} y={3.6} width={12} height={1.8} fill="#FFFFFF" />
      <rect x={5.1} y={0} width={1.8} height={8.9} fill="#FFFFFF" />
    </>
  ),

  RU: () => <HStripes colors={['#FFFFFF', '#0033A0', '#DA010D']} />,

  TR: () => (
    <>
      <rect width={30} height={20} fill="#E30A17" />
      <circle cx={13.5} cy={10} r={4} fill="white" />
      <circle cx={15} cy={10} r={3} fill="#E30A17" />
      <polygon points="18.5,10 21,8.5 21,11.5" fill="white" />
      <polygon points="20,7.5 21.5,10 20,12.5 22,12.5 23.5,10 22,7.5" fill="white" opacity={0.85} />
    </>
  ),

  IL: () => (
    <>
      <rect width={30} height={20} fill="#FFFFFF" />
      <rect x={0} y={3} width={30} height={2.5} fill="#0038B8" />
      <rect x={0} y={14.5} width={30} height={2.5} fill="#0038B8" />
      {/* Star of David */}
      <polygon points="15,8 16.7,11 18.4,11 15,13 11.6,11 13.3,11" fill="none" stroke="#0038B8" strokeWidth={0.7} />
      <polygon points="15,12 16.7,9 18.4,9 15,7 11.6,9 13.3,9" fill="none" stroke="#0038B8" strokeWidth={0.7} />
    </>
  ),

  // ── Asia & Pacific ────────────────────────────────────────────────────────

  JP: () => (
    <>
      <rect width={30} height={20} fill="#FFFFFF" />
      <circle cx={15} cy={10} r={6} fill="#BC002D" />
    </>
  ),

  HK: () => (
    <>
      <rect width={30} height={20} fill="#DE2910" />
      {/* Bauhinia flower – 5 petals */}
      {Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 72 - 90) * (Math.PI / 180);
        const px = 15 + 4 * Math.cos(angle);
        const py = 10 + 4 * Math.sin(angle);
        const ax = 15 + 2 * Math.cos(angle - 0.6);
        const ay = 10 + 2 * Math.sin(angle - 0.6);
        const bx = 15 + 2 * Math.cos(angle + 0.6);
        const by = 10 + 2 * Math.sin(angle + 0.6);
        return <polygon key={i} points={`15,10 ${ax},${ay} ${px},${py} ${bx},${by}`} fill="white" />;
      })}
    </>
  ),

  AU: () => (
    <>
      <rect width={30} height={20} fill="#00008B" />
      {/* Union Jack mini in corner */}
      <rect x={0} y={0} width={13} height={9} fill="#012169" />
      <line x1={0} y1={0} x2={13} y2={9} stroke="white" strokeWidth={2} />
      <line x1={13} y1={0} x2={0} y2={9} stroke="white" strokeWidth={2} />
      <line x1={0} y1={0} x2={13} y2={9} stroke="#C8102E" strokeWidth={1} />
      <line x1={13} y1={0} x2={0} y2={9} stroke="#C8102E" strokeWidth={1} />
      <rect x={0} y={3.5} width={13} height={2} fill="white" />
      <rect x={5.5} y={0} width={2} height={9} fill="white" />
      <rect x={0} y={4} width={13} height={1} fill="#C8102E" />
      <rect x={6} y={0} width={1} height={9} fill="#C8102E" />
      {/* Southern Cross stars */}
      <circle cx={22} cy={5} r={1} fill="white" />
      <circle cx={26} cy={8} r={1.2} fill="white" />
      <circle cx={24} cy={12} r={1.2} fill="white" />
      <circle cx={20} cy={13} r={1.2} fill="white" />
      <circle cx={18} cy={9} r={1} fill="white" />
    </>
  ),

  NZ: () => (
    <>
      <rect width={30} height={20} fill="#00247D" />
      {/* Mini Union Jack */}
      <rect x={0} y={0} width={13} height={9} fill="#012169" />
      <line x1={0} y1={0} x2={13} y2={9} stroke="white" strokeWidth={2} />
      <line x1={13} y1={0} x2={0} y2={9} stroke="white" strokeWidth={2} />
      <line x1={0} y1={0} x2={13} y2={9} stroke="#C8102E" strokeWidth={1} />
      <line x1={13} y1={0} x2={0} y2={9} stroke="#C8102E" strokeWidth={1} />
      <rect x={0} y={3.5} width={13} height={2} fill="white" />
      <rect x={5.5} y={0} width={2} height={9} fill="white" />
      <rect x={0} y={4} width={13} height={1} fill="#C8102E" />
      <rect x={6} y={0} width={1} height={9} fill="#C8102E" />
      {/* 4 red stars */}
      <polygon points="22,4 22.5,5.5 24,5.5 22.8,6.5 23.3,8 22,7 20.7,8 21.2,6.5 20,5.5 21.5,5.5" fill="#CC142B" />
      <polygon points="26,7 26.4,8.2 27.6,8.2 26.6,8.9 27,10.1 26,9.4 25,10.1 25.4,8.9 24.4,8.2 25.6,8.2" fill="#CC142B" />
      <polygon points="24,12 24.4,13.2 25.6,13.2 24.6,13.9 25,15.1 24,14.4 23,15.1 23.4,13.9 22.4,13.2 23.6,13.2" fill="#CC142B" />
      <polygon points="20,11 20.4,12.2 21.6,12.2 20.6,12.9 21,14.1 20,13.4 19,14.1 19.4,12.9 18.4,12.2 19.6,12.2" fill="#CC142B" />
    </>
  ),

  IN: () => (
    <>
      <HStripes colors={['#FF9933', '#FFFFFF', '#138808']} />
      {/* Ashoka chakra */}
      <circle cx={15} cy={10} r={2.5} fill="none" stroke="#000080" strokeWidth={0.6} />
      <circle cx={15} cy={10} r={0.4} fill="#000080" />
    </>
  ),

  SG: () => (
    <>
      <rect x={0} y={0} width={30} height={10} fill="#EF3340" />
      <rect x={0} y={10} width={30} height={10} fill="#FFFFFF" />
      {/* Crescent */}
      <circle cx={8} cy={8.5} r={3.5} fill="white" />
      <circle cx={9.5} cy={7.5} r={3} fill="#EF3340" />
      {/* 5 stars */}
      {Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 72 - 90) * (Math.PI / 180);
        const cx = 14.5 + 2.8 * Math.cos(angle);
        const cy = 8 + 2.8 * Math.sin(angle);
        return <circle key={i} cx={cx} cy={cy} r={0.6} fill="white" />;
      })}
    </>
  ),

  KR: () => (
    <>
      <rect width={30} height={20} fill="#FFFFFF" />
      {/* Taegeuk */}
      <circle cx={15} cy={10} r={4} fill="#003478" />
      <path d="M11,10 A4,4 0 0,1 19,10 A2,2 0 0,1 15,10 A2,2 0 0,0 11,10" fill="#CD2E3A" />
      {/* Simplified trigrams */}
      <rect x={4} y={4} width={4} height={1} fill="#000000" />
      <rect x={4} y={6} width={4} height={1} fill="#000000" />
      <rect x={4} y={8} width={4} height={1} fill="#000000" />
      <rect x={22} y={4} width={4} height={1} fill="#000000" />
      <rect x={22} y={6} width={1.5} height={1} fill="#000000" />
      <rect x={24.5} y={6} width={1.5} height={1} fill="#000000" />
      <rect x={22} y={8} width={4} height={1} fill="#000000" />
      <rect x={4} y={12} width={4} height={1} fill="#000000" />
      <rect x={4} y={14} width={1.5} height={1} fill="#000000" />
      <rect x={6.5} y={14} width={1.5} height={1} fill="#000000" />
      <rect x={4} y={16} width={4} height={1} fill="#000000" />
      <rect x={22} y={12} width={1.5} height={1} fill="#000000" />
      <rect x={24.5} y={12} width={1.5} height={1} fill="#000000" />
      <rect x={22} y={14} width={4} height={1} fill="#000000" />
      <rect x={22} y={16} width={1.5} height={1} fill="#000000" />
      <rect x={24.5} y={16} width={1.5} height={1} fill="#000000" />
    </>
  ),

  TW: () => (
    <>
      <rect width={30} height={20} fill="#FE0000" />
      <rect x={0} y={0} width={14} height={10} fill="#000095" />
      {/* White sun */}
      <circle cx={7} cy={5} r={3} fill="white" />
      <circle cx={7} cy={5} r={1.5} fill="#000095" />
    </>
  ),

  ID: () => <HStripes colors={['#CE1126', '#FFFFFF']} />,

  MY: () => (
    <>
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={0} y={i * (20 / 14)} width={30} height={20 / 14}
          fill={i % 2 === 0 ? '#CC0001' : '#FFFFFF'} />
      ))}
      <rect x={0} y={0} width={14} height={10} fill="#010066" />
      <circle cx={6} cy={5} r={3} fill="#FFCC00" />
      <circle cx={7} cy={5} r={2.3} fill="#010066" />
    </>
  ),

  TH: () => (
    <>
      <HStripes colors={['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931']} />
    </>
  ),

  PH: () => (
    <>
      <rect x={0} y={0} width={30} height={10} fill="#0038A8" />
      <rect x={0} y={10} width={30} height={10} fill="#CE1126" />
      <polygon points="0,0 12,10 0,20" fill="#FFFFFF" />
      {/* Sun */}
      <circle cx={6} cy={10} r={2} fill="#FCD116" />
    </>
  ),

  VN: () => (
    <>
      <rect width={30} height={20} fill="#DA251D" />
      <polygon
        points="15,4 16.8,9.4 22.5,9.4 17.9,12.6 19.7,18 15,14.8 10.3,18 12.1,12.6 7.5,9.4 13.2,9.4"
        fill="#FFFF00"
      />
    </>
  ),

  CN: () => (
    <>
      <rect width={30} height={20} fill="#DE2910" />
      <polygon points="5,3 5.9,5.8 8.8,5.8 6.5,7.5 7.4,10.2 5,8.5 2.6,10.2 3.5,7.5 1.2,5.8 4.1,5.8" fill="#FFDE00" />
      <polygon points="10,1.5 10.6,3.3 12.5,3.3 11,4.3 11.6,6 10,5 8.4,6 9,4.3 7.5,3.3 9.4,3.3" fill="#FFDE00" transform="scale(0.7) translate(6,0)" />
    </>
  ),

  // ── Other ─────────────────────────────────────────────────────────────────

  ZA: () => (
    <>
      <rect width={30} height={20} fill="#FFFFFF" />
      {/* Simplified flag: green diagonal band */}
      <polygon points="0,6 14,10 0,14" fill="#007A4D" />
      <polygon points="0,0 14,10 0,6" fill="#000000" />
      <polygon points="0,14 14,10 0,20" fill="#007A4D" />
      <rect x={0} y={0} width={30} height={6} fill="#DE3831" />
      <rect x={0} y={14} width={30} height={6} fill="#002395" />
      <rect x={0} y={6} width={30} height={8} fill="#007A4D" />
      {/* Re-draw proper flag shape */}
    </>
  ),

  // ── Unknown fallback ──────────────────────────────────────────────────────
  XX: () => (
    <>
      <rect width={30} height={20} fill="#374151" />
      <text x={15} y={13.5} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontWeight="bold">?</text>
    </>
  ),
};

// Better South Africa flag
FLAGS.ZA = () => (
  <>
    <rect width={30} height={20} fill="#FFFFFF" />
    {/* Red top */}
    <rect x={0} y={0} width={30} height={6} fill="#007A4D" />
    {/* Blue bottom */}
    <rect x={0} y={14} width={30} height={6} fill="#002395" />
    {/* White center */}
    <rect x={0} y={6} width={30} height={8} fill="#FFFFFF" />
    {/* Red/Blue borders */}
    <rect x={0} y={0} width={30} height={5} fill="#DE3831" />
    <rect x={0} y={15} width={30} height={5} fill="#002395" />
    <rect x={0} y={5} width={30} height={10} fill="#FFFFFF" />
    {/* Green V */}
    <polygon points="0,7.5 13,10 0,12.5" fill="#007A4D" />
    <polygon points="0,0 0,7.5 13,10 0,12.5 0,20 6,20 15,10 6,0" fill="#000000" />
    <polygon points="0,0 5,0 14.5,10 5,20 0,20 0,12.5 10,10 0,7.5" fill="#007A4D" />
    <polygon points="0,5 3,5 13,10 3,15 0,15 0,12.5 8,10 0,7.5" fill="#FFB612" />
  </>
);

// ── Public component ──────────────────────────────────────────────────────────

interface CountryFlagProps {
  countryCode: string;
  /** Height in px; width is auto (3:2 ratio) */
  size?: number;
  className?: string;
}

export function CountryFlag({ countryCode, size = 20, className = '' }: CountryFlagProps) {
  const code = countryCode.toUpperCase();
  const FlagContent = FLAGS[code] ?? FLAGS.XX;
  const width = Math.round(size * 1.5);

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 30 20"
      xmlns="http://www.w3.org/2000/svg"
      className={`rounded-[1px] inline-block shrink-0 ${className}`}
      aria-label={`Vlag van ${code}`}
    >
      <FlagContent />
    </svg>
  );
}
