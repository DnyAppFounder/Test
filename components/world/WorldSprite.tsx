import React from 'react';
import Svg, { Rect, Circle, G, Polygon, Path, Line, Ellipse } from 'react-native-svg';

interface SpriteProps {
  size: number;
  color?: string;
}

type SpriteFn = (p: SpriteProps) => React.ReactElement;

// ─── Color helpers ────────────────────────────────────────────────────────────

function lighten(hex: string, amt = 60): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darken(hex: string, amt = 50): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff) - amt);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Isometric box helpers ────────────────────────────────────────────────────
// ViewBox: "0 0 48 44"
// Tile occupies bottom half: vertices at (24,24)-(44,34)-(24,44)-(4,34)
// For a box of height H above tile:
//   Top face: "24,${24-H} 44,${34-H} 24,${44-H} 4,${34-H}"
//   Left face: "4,${34-H} 24,${44-H} 24,44 4,34"
//   Right face: "24,${44-H} 44,${34-H} 44,34 24,44"

function topFace(H: number): string {
  return `24,${24 - H} 44,${34 - H} 24,${44 - H} 4,${34 - H}`;
}
function leftFace(H: number): string {
  return `4,${34 - H} 24,${44 - H} 24,44 4,34`;
}
function rightFace(H: number): string {
  return `24,${44 - H} 44,${34 - H} 44,34 24,44`;
}

// Partial box (scaled width) — for narrow/partial elements
// sw = scale factor for width (0-1), xo = x offset from center
function topFaceW(H: number, hw: number, hd: number, cx = 24, cy = 44): string {
  return `${cx},${cy - 20 - H} ${cx + hw},${cy - 10 - H} ${cx},${cy - H} ${cx - hw},${cy - 10 - H}`;
}
function leftFaceW(H: number, hw: number, hd: number, cx = 24, cy = 44): string {
  return `${cx - hw},${cy - 10 - H} ${cx},${cy - H} ${cx},${cy} ${cx - hw},${cy - 10}`;
}
function rightFaceW(H: number, hw: number, hd: number, cx = 24, cy = 44): string {
  return `${cx},${cy - H} ${cx + hw},${cy - 10 - H} ${cx + hw},${cy - 10} ${cx},${cy}`;
}

// ─── Sprite definitions ───────────────────────────────────────────────────────

// SOFA — 3-seater with visible backrest (facing front-right)
const SOFA: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 55);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Backrest — tall box at back, H=20, narrow depth */}
      <Polygon points="24,4 44,14 24,24 4,14" fill={l} opacity="0.85" />
      <Polygon points="4,14 24,24 24,38 4,28" fill={color} />
      <Polygon points="24,24 44,14 44,28 24,38" fill={d} />
      {/* Seat cushion — H=10 box in front of backrest */}
      <Polygon points="24,14 44,24 24,34 4,24" fill={l} />
      <Polygon points="4,24 24,34 24,44 4,34" fill={darken(color, 35)} />
      <Polygon points="24,34 44,24 44,34 24,44" fill={d} />
      {/* Cushion divider */}
      <Line x1="24" y1="14" x2="24" y2="34" stroke={d} strokeWidth="1.5" opacity="0.5" />
      {/* Left arm */}
      <Polygon points="2,27 6,25 6,40 2,42" fill={d} />
      <Polygon points="2,25 6,23 6,25 2,27" fill={l} opacity="0.6" />
      {/* Right arm */}
      <Polygon points="42,25 46,27 46,42 42,40" fill={d} opacity="0.8" />
      <Polygon points="42,23 46,25 46,27 42,25" fill={l} opacity="0.5" />
      {/* Legs */}
      <Line x1="6" y1="38" x2="6" y2="44" stroke={d} strokeWidth="2.5" />
      <Line x1="42" y1="38" x2="42" y2="44" stroke={d} strokeWidth="2.5" />
      <Line x1="24" y1="42" x2="24" y2="44" stroke={d} strokeWidth="2" />
    </Svg>
  );
};

// CHAIR — single seat with high backrest
const CHAIR: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 55);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Backrest — H=20, 60% width centered */}
      <Polygon points="24,4 37,11 24,18 11,11" fill={l} opacity="0.9" />
      <Polygon points="11,11 24,18 24,36 11,29" fill={color} />
      <Polygon points="24,18 37,11 37,29 24,36" fill={d} />
      {/* Seat — H=10, same width */}
      <Polygon points="24,16 37,23 24,30 11,23" fill={l} />
      <Polygon points="11,23 24,30 24,44 11,37" fill={darken(color, 35)} />
      <Polygon points="24,30 37,23 37,37 24,44" fill={d} />
      {/* Legs */}
      <Line x1="12" y1="38" x2="10" y2="44" stroke={d} strokeWidth="2.5" />
      <Line x1="36" y1="38" x2="38" y2="44" stroke={d} strokeWidth="2.5" />
      <Line x1="12" y1="36" x2="10" y2="43" stroke={d} strokeWidth="2" />
      <Line x1="36" y1="30" x2="38" y2="37" stroke={d} strokeWidth="2" />
    </Svg>
  );
};

// BED — wide with headboard and pillow
const BED: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 55);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Headboard — tall H=18 narrow box at back */}
      <Polygon points="24,6 44,16 24,26 4,16" fill={l} opacity="0.7" />
      <Polygon points="4,16 24,26 24,40 4,30" fill={color} opacity="0.8" />
      <Polygon points="24,26 44,16 44,30 24,40" fill={d} opacity="0.8" />
      {/* Mattress frame — H=8, full width */}
      <Polygon points="24,16 44,26 24,36 4,26" fill={darken(color, 30)} />
      <Polygon points="4,26 24,36 24,44 4,34" fill={d} />
      <Polygon points="24,36 44,26 44,34 24,44" fill={darken(color, 65)} />
      {/* Bedding / sheet — lighter color on top */}
      <Polygon points="24,18 42,27 24,36 6,27" fill={l} opacity="0.6" />
      {/* Pillow */}
      <Polygon points="24,18 34,23 28,28 18,23" fill="#ffffff" opacity="0.75" />
      <Polygon points="18,23 28,28 26,31 16,26" fill="#e8e8e8" opacity="0.65" />
      {/* Blanket fold */}
      <Line x1="9" y1="28" x2="39" y2="28" stroke={color} strokeWidth="1" opacity="0.5" strokeDasharray="3,2" />
    </Svg>
  );
};

// TABLE — thin tabletop with visible legs on front faces
const TABLE: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 55);
  const wd = '#6B4226'; // wood dark
  const wl = '#A0602A'; // wood light
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Table top slab — H=5, full width, light colored */}
      <Polygon points="24,19 44,29 24,39 4,29" fill={l} opacity="0.9" />
      <Polygon points="4,29 24,39 24,44 4,34" fill={wl} />
      <Polygon points="24,39 44,29 44,34 24,44" fill={wd} />
      {/* Front-left leg */}
      <Line x1="7" y1="36" x2="5" y2="44" stroke={wd} strokeWidth="3" />
      {/* Front-right leg */}
      <Line x1="41" y1="32" x2="43" y2="44" stroke={wd} strokeWidth="3" />
      {/* Back-left leg (partially hidden) */}
      <Line x1="7" y1="28" x2="6" y2="38" stroke={wd} strokeWidth="2" opacity="0.5" />
      {/* Back-right leg (partially hidden) */}
      <Line x1="41" y1="24" x2="42" y2="34" stroke={wd} strokeWidth="2" opacity="0.5" />
      {/* Crossbeam */}
      <Line x1="8" y1="38" x2="40" y2="34" stroke={wd} strokeWidth="1.5" opacity="0.4" />
    </Svg>
  );
};

// LAMP — floor lamp with shade, pole, base
const LAMP: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = '#FCD34D';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Base — flat disc */}
      <Ellipse cx="24" cy="41" rx="12" ry="6" fill={d} />
      <Ellipse cx="24" cy="40" rx="10" ry="5" fill={darken(color, 25)} />
      {/* Pole */}
      <Line x1="24" y1="40" x2="24" y2="18" stroke={d} strokeWidth="2.5" />
      {/* Shade outer */}
      <Polygon points="14,18 34,18 30,6 18,6" fill={l} opacity="0.9" />
      {/* Shade inner glow */}
      <Polygon points="16,18 32,18 29,8 19,8" fill="#FEF3C7" opacity="0.6" />
      {/* Shade bottom edge */}
      <Line x1="14" y1="18" x2="34" y2="18" stroke={darken('#FCD34D')} strokeWidth="1" />
      {/* Glow ellipse underneath shade */}
      <Ellipse cx="24" cy="19" rx="12" ry="4" fill={l} opacity="0.15" />
      {/* Bulb */}
      <Circle cx="24" cy="18" r="3" fill="#FEF9C3" opacity="0.85" />
    </Svg>
  );
};

// MONITOR — widescreen display on stand, isometric
const MONITOR: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Stand base */}
      <Polygon points="24,40 32,36 32,38 24,42 16,38 16,36" fill={d} />
      <Polygon points="18,38 30,38 30,40 18,40" fill={darken(color, 70)} />
      {/* Stand pole */}
      <Line x1="24" y1="30" x2="24" y2="40" stroke={d} strokeWidth="3" />
      {/* Screen back (H=18, narrower) */}
      <Polygon points="24,8 40,16 24,24 8,16" fill={d} opacity="0.9" />
      <Polygon points="8,16 24,24 24,30 8,24" fill={darken(color, 70)} />
      <Polygon points="24,24 40,16 40,22 24,30" fill={d} opacity="0.7" />
      {/* Screen face — the display */}
      <Polygon points="24,10 38,17 24,24 10,17" fill="#0A0A1A" />
      {/* Screen content — colored chart lines */}
      <Polygon points="24,11 37,17.5 30,20.5 17,14" fill={color} opacity="0.2" />
      <Line x1="16" y1="18" x2="32" y2="13" stroke={color} strokeWidth="1" opacity="0.8" />
      <Line x1="14" y1="20" x2="26" y2="16" stroke={l} strokeWidth="1" opacity="0.6" />
      <Line x1="16" y1="22" x2="35" y2="15" stroke="#10B981" strokeWidth="1" opacity="0.7" />
      {/* Status LED */}
      <Circle cx="24" cy="23" r="1" fill="#10B981" />
    </Svg>
  );
};

// LAPTOP — open laptop viewed isometrically
const LAPTOP: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Base/keyboard — H=4 box, full width */}
      <Polygon points="24,28 44,38 24,48 4,38" fill={d} />
      <Polygon points="4,38 24,48 24,44 4,34" fill={darken(color, 70)} />
      <Polygon points="24,48 44,38 44,34 24,44" fill={d} opacity="0.7" />
      {/* Keyboard top */}
      <Polygon points="26,29 42,37 26,45 10,37" fill="#0A0A1A" />
      {/* Keys hint */}
      <Line x1="14" y1="39" x2="38" y2="32" stroke={color} strokeWidth="0.7" opacity="0.4" />
      <Line x1="14" y1="41" x2="38" y2="34" stroke={color} strokeWidth="0.7" opacity="0.4" />
      {/* Screen — angled back */}
      <Polygon points="24,8 44,18 44,34 24,24" fill={d} />
      <Polygon points="24,8 4,18 4,34 24,24" fill={darken(color, 65)} />
      <Polygon points="24,8 44,18 24,28 4,18" fill={l} opacity="0.3" />
      {/* Screen display */}
      <Polygon points="26,10 42,19 42,32 26,23" fill="#0A0A1A" />
      {/* Screen glow content */}
      <Polygon points="28,13 40,19 40,29 28,23" fill={color} opacity="0.15" />
      <Line x1="29" y1="15" x2="39" y2="20" stroke={l} strokeWidth="1" opacity="0.7" />
      <Line x1="29" y1="18" x2="37" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
    </Svg>
  );
};

// PHONE — smartphone standing upright
const PHONE: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Phone body — tall narrow box (H=24, narrow) */}
      <Polygon points="24,8 32,12 24,16 16,12" fill={l} opacity="0.9" />
      <Polygon points="16,12 24,16 24,44 16,40" fill={color} />
      <Polygon points="24,16 32,12 32,40 24,44" fill={d} />
      {/* Screen */}
      <Polygon points="24,10 30,13 24,16 18,13" fill="#0A0A1A" />
      <Polygon points="18,13 24,16 24,38 18,35" fill="#0D0D1A" />
      {/* Screen content glow */}
      <Polygon points="19,15 28,19 28,34 19,30" fill={color} opacity="0.15" />
      <Line x1="20" y1="18" x2="28" y2="22" stroke={l} strokeWidth="1" opacity="0.6" />
      <Line x1="20" y1="21" x2="26" y2="24" stroke={l} strokeWidth="1" opacity="0.4" />
      {/* Home indicator */}
      <Line x1="22" y1="36" x2="26" y2="37.5" stroke={color} strokeWidth="1.5" opacity="0.6" />
    </Svg>
  );
};

// SERVER — rack unit with blinking lights
const SERVER: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Server rack box — H=24, full width */}
      <Polygon points="24,4 44,14 24,24 4,14" fill={d} opacity="0.9" />
      <Polygon points="4,14 24,24 24,44 4,34" fill={darken(color, 65)} />
      <Polygon points="24,24 44,14 44,34 24,44" fill={d} opacity="0.8" />
      {/* Front panel slots */}
      {[0, 1, 2, 3].map(i => (
        <G key={i}>
          <Line x1="26" y1={26 + i * 4} x2="42" y2={22 + i * 4} stroke={color} strokeWidth="2" opacity="0.5" />
          <Circle cx={41 - i * 0.5} cy={22 + i * 4} r="1.2" fill={i % 3 === 0 ? '#10B981' : i % 3 === 1 ? color : '#F59E0B'} />
        </G>
      ))}
      {/* Heat vents on left */}
      {[0, 1, 2].map(i => (
        <Line key={i} x1="6" y1={18 + i * 5} x2="22" y2={24 + i * 5} stroke={color} strokeWidth="1" opacity="0.3" />
      ))}
    </Svg>
  );
};

// CROWN — trophy/VIP crown on pedestal
const CROWN: SpriteFn = ({ size, color = '#F59E0B' }) => {
  const d = darken(color, 40), l = lighten(color, 50);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Pedestal — H=8 box */}
      <Polygon points="24,28 36,34 24,40 12,34" fill={d} opacity="0.9" />
      <Polygon points="12,34 24,40 24,44 12,38" fill={darken(color, 65)} />
      <Polygon points="24,40 36,34 36,38 24,44" fill={d} opacity="0.7" />
      {/* Crown body */}
      <Polygon points="12,24 36,24 30,16 24,22 18,14 12,22" fill={color} />
      <Polygon points="12,24 36,24 36,28 12,28" fill={d} />
      {/* Crown tips highlight */}
      <Polygon points="12,22 16,14 20,20 18,14" fill={l} opacity="0.6" />
      <Polygon points="24,22 28,14 32,20 30,16" fill={l} opacity="0.6" />
      {/* Jewels */}
      <Circle cx="18" cy="26" r="2.5" fill="#EC4899" />
      <Circle cx="24" cy="26" r="2.5" fill="#3B82F6" />
      <Circle cx="30" cy="26" r="2.5" fill="#10B981" />
      {/* Crown band */}
      <Line x1="12" y1="24" x2="36" y2="24" stroke={d} strokeWidth="1.5" />
    </Svg>
  );
};

// TROPHY — championship cup
const TROPHY: SpriteFn = ({ size, color = '#F59E0B' }) => {
  const d = darken(color, 50), l = lighten(color, 50);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Base plate — H=4 box */}
      <Polygon points="24,36 34,41 24,46 14,41" fill={d} />
      <Polygon points="14,41 24,46 24,44 14,39" fill={darken(color, 70)} />
      <Polygon points="24,46 34,41 34,39 24,44" fill={d} opacity="0.8" />
      {/* Stem */}
      <Polygon points="22,26 26,28 26,38 22,36" fill={d} />
      {/* Cup body */}
      <Polygon points="14,16 34,16 30,30 18,30" fill={color} />
      <Polygon points="14,16 34,16 34,20 14,20" fill={l} opacity="0.5" />
      {/* Cup highlight */}
      <Polygon points="16,18 30,18 28,24 18,24" fill={l} opacity="0.3" />
      {/* Handles */}
      <Path d="M14,18 Q8,18 8,22 Q8,26 14,26" fill="none" stroke={color} strokeWidth="3" />
      <Path d="M34,18 Q40,18 40,22 Q40,26 34,26" fill="none" stroke={color} strokeWidth="3" />
      {/* Star inside */}
      <Polygon points="24,20 25.5,24 22,22 26,22 22.5,24" fill={d} opacity="0.5" />
    </Svg>
  );
};

// PALM — tropical palm tree
const PALM: SpriteFn = ({ size, color = '#10B981' }) => {
  const d = darken(color, 40), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Pot base — H=6 box, narrow */}
      <Polygon points="24,34 30,37 24,40 18,37" fill="#8B6914" opacity="0.9" />
      <Polygon points="18,37 24,40 24,44 18,41" fill="#5C4209" />
      <Polygon points="24,40 30,37 30,41 24,44" fill="#7A560E" />
      {/* Trunk */}
      <Line x1="23" y1="34" x2="24" y2="14" stroke="#92400E" strokeWidth="3.5" />
      <Line x1="24" y1="34" x2="25" y2="14" stroke="#B45309" strokeWidth="2" opacity="0.5" />
      {/* Trunk segments */}
      {[20, 24, 28].map(y => (
        <Line key={y} x1="22" y1={y} x2="26" y2={y} stroke="#5C3009" strokeWidth="1" opacity="0.5" />
      ))}
      {/* Leaves — radiate from top */}
      <Path d="M24,14 Q16,8 8,10" stroke={color} strokeWidth="3" fill="none" />
      <Path d="M24,14 Q32,8 40,10" stroke={color} strokeWidth="3" fill="none" />
      <Path d="M24,14 Q18,6 22,2" stroke={l} strokeWidth="2.5" fill="none" />
      <Path d="M24,14 Q30,6 26,2" stroke={l} strokeWidth="2.5" fill="none" />
      <Path d="M24,14 Q12,12 6,16" stroke={d} strokeWidth="2" fill="none" opacity="0.8" />
      <Path d="M24,14 Q36,12 42,16" stroke={d} strokeWidth="2" fill="none" opacity="0.8" />
      {/* Coconuts */}
      <Circle cx="22" cy="16" r="2.5" fill="#92400E" />
      <Circle cx="26" cy="15" r="2.5" fill="#78350F" />
    </Svg>
  );
};

// BAMBOO — twin stalks with leaves
const BAMBOO: SpriteFn = ({ size, color = '#10B981' }) => {
  const d = darken(color, 40), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Pot */}
      <Polygon points="24,36 31,40 24,44 17,40" fill="#7A560E" opacity="0.9" />
      <Polygon points="17,40 24,44 24,44 17,42" fill="#5C4209" />
      <Polygon points="24,44 31,40 31,42 24,44" fill="#6B4A0D" />
      {/* Left stalk */}
      <Path d="M19,36 C18,28 20,20 18,8" stroke={color} strokeWidth="4" fill="none" />
      <Path d="M19,36 C18,28 20,20 18,8" stroke={l} strokeWidth="1.5" fill="none" opacity="0.4" />
      {/* Left stalk joints */}
      {[14, 22, 30].map(y => (
        <Line key={y} x1="16" y1={y} x2="21" y2={y} stroke={d} strokeWidth="1.5" />
      ))}
      {/* Right stalk */}
      <Path d="M28,36 C29,27 27,18 30,6" stroke={d} strokeWidth="4" fill="none" />
      <Path d="M28,36 C29,27 27,18 30,6" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      {[10, 18, 26].map(y => (
        <Line key={y} x1="27" y1={y} x2="32" y2={y} stroke={darken(color, 60)} strokeWidth="1.5" />
      ))}
      {/* Leaves */}
      <Path d="M18,10 Q10,6 6,8" stroke={l} strokeWidth="2" fill="none" />
      <Path d="M20,16 Q14,10 10,14" stroke={color} strokeWidth="1.5" fill="none" />
      <Path d="M30,8 Q38,4 42,6" stroke={l} strokeWidth="2" fill="none" />
      <Path d="M29,14 Q36,10 40,12" stroke={color} strokeWidth="1.5" fill="none" />
    </Svg>
  );
};

// FLOWER — blooming flower in pot
const FLOWER: SpriteFn = ({ size, color = '#EC4899' }) => {
  const d = darken(color, 40), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Pot — narrow H=8 box */}
      <Polygon points="24,32 30,35 24,38 18,35" fill="#B45309" opacity="0.9" />
      <Polygon points="18,35 24,38 24,44 18,41" fill="#78350F" />
      <Polygon points="24,38 30,35 30,41 24,44" fill="#92400E" />
      {/* Stem */}
      <Line x1="24" y1="32" x2="24" y2="18" stroke="#16A34A" strokeWidth="2.5" />
      <Line x1="24" y1="26" x2="20" y2="22" stroke="#16A34A" strokeWidth="1.5" opacity="0.7" />
      {/* Petals */}
      <Circle cx="24" cy="12" r="5" fill={color} opacity="0.9" />
      <Circle cx="30" cy="15" r="4.5" fill={color} opacity="0.85" />
      <Circle cx="30" cy="9" r="4.5" fill={d} opacity="0.85" />
      <Circle cx="18" cy="9" r="4.5" fill={color} opacity="0.85" />
      <Circle cx="18" cy="15" r="4.5" fill={d} opacity="0.85" />
      {/* Center */}
      <Circle cx="24" cy="12" r="4" fill="#FCD34D" />
      <Circle cx="24" cy="12" r="2.5" fill="#F59E0B" />
      {/* Shine */}
      <Circle cx="22" cy="10" r="1" fill="#fff" opacity="0.6" />
    </Svg>
  );
};

// CANDLE — classic candle with flame glow
const CANDLE: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Candle holder — H=4 box */}
      <Polygon points="24,36 30,39 24,42 18,39" fill={d} opacity="0.9" />
      <Polygon points="18,39 24,42 24,44 18,41" fill={darken(color, 70)} />
      <Polygon points="24,42 30,39 30,41 24,44" fill={d} />
      {/* Candle body — H=20, narrow */}
      <Polygon points="24,14 29,17 24,20 19,17" fill={lighten(color, 60)} opacity="0.9" />
      <Polygon points="19,17 24,20 24,38 19,35" fill={color} />
      <Polygon points="24,20 29,17 29,35 24,38" fill={d} />
      {/* Wax drip */}
      <Path d="M22,20 Q20,24 20,28" stroke={lighten(color, 70)} strokeWidth="2" fill="none" opacity="0.7" />
      {/* Wick */}
      <Line x1="24" y1="14" x2="24" y2="10" stroke="#1F1F2E" strokeWidth="1.5" />
      {/* Flame glow */}
      <Ellipse cx="24" cy="9" rx="5" ry="5" fill="#FCD34D" opacity="0.2" />
      {/* Flame */}
      <Path d="M24,4 C26,7 27,10 24,12 C21,10 22,7 24,4" fill="#F97316" />
      <Path d="M24,6 C25,8 25.5,10 24,11 C22.5,10 23,8 24,6" fill="#FCD34D" />
      <Circle cx="24" cy="11" r="1.5" fill="#FEF3C7" opacity="0.9" />
    </Svg>
  );
};

// CRYSTAL — floating gem with facets
const CRYSTAL: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 55);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Pedestal */}
      <Polygon points="24,32 30,35 24,38 18,35" fill={d} />
      <Polygon points="18,35 24,38 24,44 18,41" fill={darken(color, 70)} />
      <Polygon points="24,38 30,35 30,41 24,44" fill={d} opacity="0.8" />
      {/* Crystal body */}
      <Polygon points="24,4 34,16 30,30 18,30 14,16" fill={color} opacity="0.85" />
      {/* Crystal facets */}
      <Polygon points="24,4 34,16 24,16" fill={l} opacity="0.5" />
      <Polygon points="24,4 14,16 24,16" fill={l} opacity="0.25" />
      <Polygon points="24,16 34,16 30,30" fill={d} opacity="0.4" />
      <Polygon points="24,16 14,16 18,30" fill={color} opacity="0.6" />
      {/* Shine */}
      <Circle cx="20" cy="12" r="2.5" fill="#fff" opacity="0.65" />
      <Circle cx="20" cy="12" r="1" fill="#fff" opacity="0.9" />
      {/* Inner glow */}
      <Polygon points="24,8 30,16 24,22 18,16" fill={l} opacity="0.15" />
    </Svg>
  );
};

// PORTAL — glowing dimensional portal
const PORTAL: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 40), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Portal frame ring — isometric oval */}
      <Ellipse cx="24" cy="22" rx="18" ry="12" fill="none" stroke={color} strokeWidth="4" opacity="0.8" />
      <Ellipse cx="24" cy="22" rx="16" ry="10" fill="none" stroke={l} strokeWidth="2" opacity="0.6" />
      {/* Portal inner glow */}
      <Ellipse cx="24" cy="22" rx="14" ry="8" fill={color} opacity="0.1" />
      <Ellipse cx="24" cy="22" rx="10" ry="6" fill={color} opacity="0.2" />
      <Ellipse cx="24" cy="22" rx="6" ry="4" fill={l} opacity="0.4" />
      <Ellipse cx="24" cy="22" rx="3" ry="2" fill="#fff" opacity="0.8" />
      {/* Swirl lines */}
      <Path d="M24,10 Q36,14 36,22" stroke={l} strokeWidth="1.5" fill="none" opacity="0.6" />
      <Path d="M24,34 Q12,30 12,22" stroke={l} strokeWidth="1.5" fill="none" opacity="0.6" />
      {/* Base shadow */}
      <Ellipse cx="24" cy="38" rx="10" ry="4" fill={d} opacity="0.3" />
      {/* Floating stand */}
      <Line x1="24" y1="34" x2="24" y2="40" stroke={d} strokeWidth="2" />
      <Ellipse cx="24" cy="40" rx="6" ry="3" fill={d} opacity="0.5" />
    </Svg>
  );
};

// JOYSTICK — arcade joystick on console
const JOYSTICK: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Console base — H=10, full width */}
      <Polygon points="24,22 44,32 24,42 4,32" fill={d} opacity="0.9" />
      <Polygon points="4,32 24,42 24,44 4,34" fill={darken(color, 70)} />
      <Polygon points="24,42 44,32 44,34 24,44" fill={d} opacity="0.7" />
      {/* Console top */}
      <Polygon points="24,24 42,33 24,42 6,33" fill="#0A0A1A" />
      {/* D-pad */}
      <Rect x="8" y="34" width="8" height="3" rx="1" fill={color} opacity="0.6" />
      <Rect x="10.5" y="31" width="3" height="9" rx="1" fill={color} opacity="0.6" />
      {/* Action buttons */}
      <Circle cx="34" cy="35" r="3" fill="#EF4444" opacity="0.9" />
      <Circle cx="39" cy="33" r="2.5" fill="#10B981" opacity="0.9" />
      <Circle cx="34" cy="40" r="2.5" fill="#3B82F6" opacity="0.9" />
      {/* Stick base */}
      <Circle cx="20" cy="36" r="5" fill={color} opacity="0.5" />
      {/* Stick pole */}
      <Line x1="20" y1="36" x2="18" y2="18" stroke={l} strokeWidth="3" strokeLinecap="round" />
      {/* Stick knob */}
      <Circle cx="18" cy="16" r="5" fill={l} />
      <Circle cx="16" cy="14" r="2" fill="#fff" opacity="0.5" />
    </Svg>
  );
};

// GAMEPAD — modern gaming controller
const GAMEPAD: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Body — wing-shaped, slightly elevated */}
      <Ellipse cx="24" cy="26" rx="18" ry="10" fill={d} />
      <Ellipse cx="24" cy="24" rx="16" ry="9" fill={darken(color, 30)} />
      {/* Left grip */}
      <Ellipse cx="10" cy="30" rx="8" ry="6" fill={d} opacity="0.9" />
      {/* Right grip */}
      <Ellipse cx="38" cy="30" rx="8" ry="6" fill={d} opacity="0.9" />
      {/* D-pad */}
      <Rect x="8" y="22" width="7" height="3" rx="1" fill={l} opacity="0.8" />
      <Rect x="10" y="19" width="3" height="9" rx="1" fill={l} opacity="0.8" />
      {/* Face buttons */}
      <Circle cx="34" cy="21" r="2.5" fill="#10B981" />
      <Circle cx="38" cy="24" r="2.5" fill="#EF4444" />
      <Circle cx="34" cy="27" r="2.5" fill="#3B82F6" />
      <Circle cx="30" cy="24" r="2.5" fill="#F59E0B" />
      {/* Center buttons */}
      <Circle cx="21" cy="24" r="2" fill={color} opacity="0.7" />
      <Circle cx="27" cy="24" r="2" fill={color} opacity="0.7" />
      {/* Analog sticks */}
      <Circle cx="14" cy="29" r="4" fill={darken(color, 40)} />
      <Circle cx="14" cy="29" r="2.5" fill={color} opacity="0.6" />
      <Circle cx="33" cy="29" r="4" fill={darken(color, 40)} />
      <Circle cx="33" cy="29" r="2.5" fill={color} opacity="0.6" />
    </Svg>
  );
};

// DIAMOND_WALL — framed gem artwork on a stand
const DIAMOND_WALL: SpriteFn = ({ size, color = '#06B6D4' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Frame stand */}
      <Polygon points="24,34 30,37 24,40 18,37" fill={d} />
      <Polygon points="18,37 24,40 24,44 18,41" fill={darken(color, 70)} />
      <Polygon points="24,40 30,37 30,41 24,44" fill={d} opacity="0.8" />
      <Line x1="24" y1="34" x2="24" y2="26" stroke={d} strokeWidth="2.5" />
      {/* Frame body — H=20 flat box */}
      <Polygon points="16,4 32,4 32,28 16,28" fill={d} />
      <Polygon points="18,6 30,6 30,26 18,26" fill="#0A0A1A" />
      {/* Diamond inside */}
      <Polygon points="24,10 30,18 24,26 18,18" fill={color} />
      <Polygon points="24,10 30,18 24,18" fill={l} opacity="0.5" />
      <Polygon points="24,10 18,18 24,18" fill={l} opacity="0.25" />
      {/* Diamond shine */}
      <Circle cx="21" cy="14" r="2" fill="#fff" opacity="0.6" />
      {/* Frame details */}
      <Circle cx="16" cy="4" r="2" fill={l} opacity="0.7" />
      <Circle cx="32" cy="4" r="2" fill={l} opacity="0.7" />
    </Svg>
  );
};

// POOL TABLE — billiard table viewed isometrically
const POOL_TABLE: SpriteFn = ({ size, color = '#10B981' }) => {
  const d = darken(color, 55), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Table legs — visible on front */}
      <Line x1="6" y1="34" x2="6" y2="44" stroke="#4A3520" strokeWidth="3" />
      <Line x1="42" y1="30" x2="42" y2="40" stroke="#4A3520" strokeWidth="3" />
      {/* Table frame — H=8, full width */}
      <Polygon points="24,16 44,26 24,36 4,26" fill="#4A3520" opacity="0.95" />
      <Polygon points="4,26 24,36 24,44 4,34" fill="#3B2813" />
      <Polygon points="24,36 44,26 44,34 24,44" fill="#2E1F0F" />
      {/* Felt surface */}
      <Polygon points="24,18 42,27 24,36 6,27" fill={color} />
      {/* Felt sheen */}
      <Polygon points="24,19 40,27 24,35 8,27" fill={l} opacity="0.1" />
      {/* Corner pockets */}
      <Circle cx="7" cy="27" r="2.5" fill="#0A0A1A" />
      <Circle cx="41" cy="27" r="2.5" fill="#0A0A1A" />
      <Circle cx="24" cy="18" r="2" fill="#0A0A1A" />
      <Circle cx="24" cy="36" r="2" fill="#0A0A1A" />
      {/* Balls */}
      <Circle cx="20" cy="27" r="2.5" fill="#fff" />
      <Circle cx="27" cy="24" r="2.5" fill="#EF4444" />
      <Circle cx="30" cy="29" r="2.5" fill="#3B82F6" />
    </Svg>
  );
};

// COFFEE — coffee table with cup
const COFFEE: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  const wd = '#6B4226', wl = '#A0602A';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Low coffee table — H=6 */}
      <Polygon points="24,22 44,32 24,42 4,32" fill={wl} opacity="0.95" />
      <Polygon points="4,32 24,42 24,44 4,34" fill={wd} />
      <Polygon points="24,42 44,32 44,34 24,44" fill={darken(wd, 20)} />
      {/* Mug body */}
      <Polygon points="24,14 28,16 24,18 20,16" fill="#E8E8E8" opacity="0.9" />
      <Polygon points="20,16 24,18 24,26 20,24" fill="#D0D0D0" />
      <Polygon points="24,18 28,16 28,24 24,26" fill="#C0C0C0" />
      {/* Coffee inside mug */}
      <Polygon points="24,14 27,15.5 24,17 21,15.5" fill="#78350F" opacity="0.85" />
      {/* Handle */}
      <Path d="M28,17 Q32,17 32,20 Q32,23 28,23" fill="none" stroke="#C0C0C0" strokeWidth="2" />
      {/* Steam */}
      <Path d="M22,13 Q20,10 22,7" stroke="#fff" strokeWidth="1" fill="none" opacity="0.4" />
      <Path d="M25,12 Q23,9 25,6" stroke="#fff" strokeWidth="1" fill="none" opacity="0.4" />
      {/* Saucer */}
      <Ellipse cx="24" cy="22" rx="7" ry="4" fill="#B0B0B0" opacity="0.7" />
    </Svg>
  );
};

// RUG — decorative rug (flat, isometric diamond)
const RUG: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 40), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Rug surface — flat isometric tile */}
      <Polygon points="24,16 44,26 24,36 4,26" fill={color} opacity="0.85" />
      {/* Border */}
      <Polygon points="24,18 42,27 24,36 6,27" fill="none" stroke={l} strokeWidth="1.5" opacity="0.7" />
      {/* Inner border */}
      <Polygon points="24,20 38,28 24,36 10,28" fill="none" stroke={d} strokeWidth="1" opacity="0.5" />
      {/* Center pattern */}
      <Polygon points="24,22 32,26 24,30 16,26" fill={l} opacity="0.35" />
      {/* Fringe edges */}
      {[-2, 2, 6, 10].map(off => (
        <Line key={off} x1={6 + off} y1={26 + off / 2} x2={4 + off} y2={29 + off / 2}
          stroke={d} strokeWidth="1.5" opacity="0.6" />
      ))}
      {[0, 4, 8, 12].map(off => (
        <Line key={off} x1={42 - off} y1={27 - off / 2} x2={44 - off} y2={30 - off / 2}
          stroke={d} strokeWidth="1.5" opacity="0.6" />
      ))}
    </Svg>
  );
};

// TORCH — mounted wall torch
const TORCH: SpriteFn = ({ size, color = '#F59E0B' }) => {
  const d = darken(color, 50);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Wall mount */}
      <Rect x="20" y="20" width="8" height="4" rx="2" fill="#374151" />
      {/* Handle */}
      <Line x1="24" y1="22" x2="24" y2="32" stroke="#6B4226" strokeWidth="3.5" strokeLinecap="round" />
      {/* Bowl */}
      <Polygon points="18,30 30,30 28,36 20,36" fill="#D97706" />
      <Polygon points="18,30 30,30 30,32 18,32" fill={color} opacity="0.7" />
      {/* Fire glow */}
      <Ellipse cx="24" cy="26" rx="8" ry="6" fill={color} opacity="0.12" />
      <Ellipse cx="24" cy="24" rx="6" ry="5" fill={color} opacity="0.15" />
      {/* Flames */}
      <Path d="M24,16 C26,20 28,24 24,28 C20,24 22,20 24,16" fill="#F97316" />
      <Path d="M24,18 C25.5,21 26,25 24,27 C22,25 22.5,21 24,18" fill={color} />
      <Circle cx="24" cy="27" r="2.5" fill="#FEF3C7" opacity="0.8" />
    </Svg>
  );
};

// STATUE — decorative figure on pedestal
const STATUE: SpriteFn = ({ size, color = '#6B7280' }) => {
  const d = darken(color, 40), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Pedestal — H=10 box */}
      <Polygon points="24,26 34,31 24,36 14,31" fill={d} opacity="0.9" />
      <Polygon points="14,31 24,36 24,44 14,39" fill={darken(color, 60)} />
      <Polygon points="24,36 34,31 34,39 24,44" fill={d} opacity="0.8" />
      {/* Figure base */}
      <Line x1="21" y1="26" x2="21" y2="12" stroke={color} strokeWidth="3.5" />
      <Line x1="27" y1="26" x2="27" y2="12" stroke={d} strokeWidth="3.5" />
      {/* Arms outstretched */}
      <Line x1="14" y1="16" x2="34" y2="16" stroke={d} strokeWidth="2.5" />
      {/* Head */}
      <Circle cx="24" cy="8" r="5" fill={color} />
      <Circle cx="22" cy="7" r="1.5" fill={d} />
      <Circle cx="26" cy="7" r="1.5" fill={d} />
      {/* Highlight */}
      <Circle cx="22" cy="6" r="1" fill={l} opacity="0.4" />
    </Svg>
  );
};

// FIRE — bonfire / flame effect
const FIRE: SpriteFn = ({ size, color = '#EF4444' }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Log base */}
      <Ellipse cx="24" cy="38" rx="12" ry="5" fill="#5C3009" />
      <Polygon points="14,36 34,36 32,40 16,40" fill="#78350F" />
      <Line x1="16" y1="37" x2="32" y2="37" stroke="#92400E" strokeWidth="1.5" />
      {/* Outer flame */}
      <Path d="M24,4 C30,10 34,18 32,26 C28,30 20,30 16,26 C14,18 18,10 24,4" fill="#F97316" />
      {/* Middle flame */}
      <Path d="M24,8 C28,14 30,20 28,26 C26,28 22,28 20,26 C18,20 20,14 24,8" fill={color} />
      {/* Inner flame */}
      <Path d="M24,14 C26,18 27,22 25,26 C24,27 22,26 22,26 C21,22 22,18 24,14" fill="#FCD34D" />
      {/* Sparks */}
      <Circle cx="18" cy="8" r="1.5" fill="#FCD34D" opacity="0.8" />
      <Circle cx="31" cy="12" r="1" fill="#FCD34D" opacity="0.7" />
      <Circle cx="15" cy="16" r="1" fill="#F97316" opacity="0.6" />
    </Svg>
  );
};

// CHAMPAGNE — bottle with cork popping
const CHAMPAGNE: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Bottle base — narrow H=24 box */}
      <Polygon points="24,14 28,16 24,18 20,16" fill={lighten('#10B981', 30)} opacity="0.9" />
      <Polygon points="20,16 24,18 24,42 20,40" fill="#10B981" />
      <Polygon points="24,18 28,16 28,40 24,42" fill={darken('#10B981', 40)} />
      {/* Foil neck */}
      <Polygon points="22,12 26,14 26,16 22,14" fill="#FCD34D" />
      <Polygon points="22,14 26,16 24,18 20,16" fill="#F59E0B" />
      {/* Cage wire */}
      <Line x1="22" y1="14" x2="20" y2="18" stroke="#D97706" strokeWidth="1" />
      <Line x1="26" y1="14" x2="28" y2="18" stroke="#D97706" strokeWidth="1" />
      {/* Cork */}
      <Rect x="22" y="8" width="4" height="5" rx="1.5" fill="#D97706" />
      {/* Cork pop motion */}
      <Circle cx="30" cy="4" r="2" fill="#D97706" opacity="0.7" />
      {/* Bubbles */}
      <Circle cx="22" cy="22" r="1" fill="#fff" opacity="0.5" />
      <Circle cx="26" cy="28" r="1" fill="#fff" opacity="0.4" />
      <Circle cx="22" cy="34" r="1" fill="#fff" opacity="0.35" />
      {/* Label */}
      <Polygon points="20,24 24,26 24,34 20,32" fill="#fff" opacity="0.2" />
    </Svg>
  );
};

// COIN — Solana coin
const COIN: SpriteFn = ({ size, color = '#9945FF' }) => {
  const d = darken(color, 40), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Coin stack — isometric cylinder-ish */}
      <Polygon points="24,28 36,34 24,40 12,34" fill={d} opacity="0.9" />
      <Polygon points="12,34 24,40 24,44 12,38" fill={darken(color, 60)} />
      <Polygon points="24,40 36,34 36,38 24,44" fill={d} opacity="0.8" />
      {/* Coin face top */}
      <Ellipse cx="24" cy="28" rx="12" ry="6" fill={color} />
      <Ellipse cx="24" cy="27" rx="11" ry="5.5" fill={l} opacity="0.3" />
      {/* SOL symbol */}
      <Rect x="18" y="24" width="12" height="2" rx="1" fill="#fff" opacity="0.9" />
      <Rect x="18" y="27" width="12" height="2" rx="1" fill="#fff" opacity="0.9" />
      <Rect x="18" y="30" width="12" height="2" rx="1" fill="#fff" opacity="0.9" />
      {/* Shine */}
      <Circle cx="18" cy="24" r="2" fill="#fff" opacity="0.3" />
    </Svg>
  );
};

// LIGHTNING — electric bolt effect
const LIGHTNING: SpriteFn = ({ size, color = '#F59E0B' }) => {
  const l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Glow aura */}
      <Ellipse cx="24" cy="24" rx="16" ry="16" fill={color} opacity="0.08" />
      {/* Outer bolt */}
      <Polygon points="26,2 16,22 24,22 18,42 32,18 22,18" fill={color} />
      {/* Inner bolt highlight */}
      <Polygon points="25,4 18,20 24,20 19,38 30,18 22,18" fill={l} opacity="0.5" />
      {/* Electric sparks */}
      <Line x1="34" y1="10" x2="38" y2="6" stroke={l} strokeWidth="2" opacity="0.7" />
      <Line x1="10" y1="32" x2="6" y2="36" stroke={l} strokeWidth="1.5" opacity="0.6" />
      <Circle cx="38" cy="5" r="2" fill={l} opacity="0.8" />
    </Svg>
  );
};

// CHAIN — blockchain link chain
const CHAIN: SpriteFn = ({ size, color = '#6B7280' }) => {
  const d = darken(color, 40), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Link 1 — upper left */}
      <Rect x="6" y="10" width="16" height="10" rx="5" fill="none" stroke={color} strokeWidth="4" />
      <Rect x="9" y="13" width="10" height="4" rx="2" fill={d} />
      {/* Connector */}
      <Rect x="19" y="15" width="10" height="4" rx="2" fill={d} opacity="0.7" />
      {/* Link 2 — lower right */}
      <Rect x="26" y="20" width="16" height="10" rx="5" fill="none" stroke={l} strokeWidth="4" />
      <Rect x="29" y="23" width="10" height="4" rx="2" fill={d} />
      {/* Shadow */}
      <Ellipse cx="26" cy="38" rx="12" ry="4" fill={d} opacity="0.2" />
    </Svg>
  );
};

// BANK — classic building facade
const BANK: SpriteFn = ({ size, color = '#F59E0B' }) => {
  const d = darken(color, 50), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Building body — H=24 box */}
      <Polygon points="24,4 44,14 24,24 4,14" fill={l} opacity="0.85" />
      <Polygon points="4,14 24,24 24,44 4,34" fill={color} opacity="0.9" />
      <Polygon points="24,24 44,14 44,34 24,44" fill={d} />
      {/* Roof/pediment */}
      <Polygon points="24,4 44,14 40,10 24,0 8,10 4,14" fill={d} opacity="0.7" />
      {/* Columns on left face */}
      {[18, 22, 26, 30].map(y => (
        <Line key={y} x1="6" y1={y} x2="22" y2={y + 8} stroke={l} strokeWidth="0.8" opacity="0.4" />
      ))}
      {/* Door on right face */}
      <Polygon points="28,32 34,28 34,40 28,44" fill="#0A0A1A" opacity="0.7" />
    </Svg>
  );
};

// DOOR — ornate entrance door
const DOOR: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  const wd = '#92400E', wl = '#B45309';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Door frame — H=24 box */}
      <Polygon points="24,4 36,10 24,16 12,10" fill={l} opacity="0.6" />
      <Polygon points="12,10 24,16 24,44 12,38" fill={d} opacity="0.9" />
      <Polygon points="24,16 36,10 36,38 24,44" fill={d} opacity="0.8" />
      {/* Door panel on left face */}
      <Polygon points="13,13 22,18 22,42 13,37" fill={wd} />
      {/* Door panels (indented rectangles) */}
      <Polygon points="14,16 21,20 21,28 14,24" fill={darken(wd, 20)} opacity="0.5" />
      <Polygon points="14,30 21,34 21,40 14,36" fill={darken(wd, 20)} opacity="0.5" />
      {/* Doorknob */}
      <Circle cx="21" cy="31" r="2" fill="#FCD34D" />
      {/* Arch on right face */}
      <Polygon points="25,8 34,12 34,38 25,44" fill="#0A0A1A" opacity="0.5" />
    </Svg>
  );
};

// SPARKLES — magical sparkle effect
const SPARKLES: SpriteFn = ({ size, color = '#FCD34D' }) => {
  const l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Main star — large center */}
      <Polygon points="24,4 26.5,18 40,20 26.5,22 24,36 21.5,22 8,20 21.5,18" fill={color} />
      <Polygon points="24,7 25.5,18 36,20 25.5,22 24,33 22.5,22 12,20 22.5,18" fill="#fff" opacity="0.4" />
      {/* Small star TL */}
      <Polygon points="8,6 9,12 15,14 9,16 8,22 7,16 1,14 7,12" fill={color} opacity="0.8" />
      {/* Small star BR */}
      <Polygon points="40,24 41,30 47,32 41,34 40,40 39,34 33,32 39,30" fill={color} opacity="0.7" />
      {/* Dots */}
      <Circle cx="38" cy="8" r="2.5" fill={color} opacity="0.8" />
      <Circle cx="10" cy="36" r="2" fill={l} opacity="0.7" />
      <Circle cx="42" cy="14" r="1.5" fill={l} opacity="0.6" />
      <Circle cx="6" cy="28" r="1.5" fill={l} opacity="0.6" />
    </Svg>
  );
};

// STAR — 5-pointed star
const STAR: SpriteFn = ({ size, color = '#FCD34D' }) => {
  const l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      <Polygon points="24,4 28,16 40,16 30,24 34,36 24,28 14,36 18,24 8,16 20,16" fill={color} />
      <Polygon points="24,7 27,16 37,16 29,23 32,33 24,27 16,33 19,23 11,16 21,16" fill="#fff" opacity="0.4" />
      <Circle cx="24" cy="20" r="5" fill={l} opacity="0.4" />
      <Circle cx="20" cy="15" r="2" fill="#fff" opacity="0.5" />
    </Svg>
  );
};

// VIP_ROPE — velvet rope barrier
const VIP_ROPE: SpriteFn = ({ size, color = '#EF4444' }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Left post — isometric pillar */}
      <Polygon points="8,4 12,6 8,8 4,6" fill="#FCD34D" />
      <Polygon points="4,6 8,8 8,38 4,36" fill="#D97706" />
      <Polygon points="8,8 12,6 12,36 8,38" fill="#B45309" />
      {/* Right post */}
      <Polygon points="40,4 44,6 40,8 36,6" fill="#FCD34D" />
      <Polygon points="36,6 40,8 40,38 36,36" fill="#D97706" />
      <Polygon points="40,8 44,6 44,36 40,38" fill="#B45309" />
      {/* Post tops (gold caps) */}
      <Ellipse cx="8" cy="4" rx="4" ry="2.5" fill="#FEF3C7" />
      <Ellipse cx="40" cy="4" rx="4" ry="2.5" fill="#FEF3C7" />
      {/* Rope */}
      <Path d="M8,16 Q24,10 40,16" stroke={color} strokeWidth="3" fill="none" />
      <Path d="M8,22 Q24,16 40,22" stroke={color} strokeWidth="2.5" fill="none" opacity="0.8" />
    </Svg>
  );
};

// SIGN — business/welcome sign
const SIGN: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Post */}
      <Polygon points="23,16 25,17 25,44 23,43" fill={d} />
      {/* Sign board — H=14 flat box */}
      <Polygon points="8,4 40,4 40,18 8,18" fill={color} />
      <Polygon points="40,4 44,6 44,20 40,18" fill={d} />
      <Polygon points="8,18 40,18 44,20 12,20" fill={darken(color, 35)} />
      {/* Text lines */}
      <Rect x="12" y="8" width="22" height="2.5" rx="1" fill="#fff" opacity="0.85" />
      <Rect x="12" y="12.5" width="16" height="2" rx="1" fill="#fff" opacity="0.6" />
      {/* Mounting screws */}
      <Circle cx="11" cy="11" r="1.5" fill={d} opacity="0.7" />
      <Circle cx="37" cy="11" r="1.5" fill={d} opacity="0.7" />
    </Svg>
  );
};

// FRAME — isometric artwork frame on wall stand
const FRAME: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Stand */}
      <Polygon points="24,36 28,38 24,40 20,38" fill={d} />
      <Polygon points="20,38 24,40 24,44 20,42" fill={darken(color, 70)} />
      <Polygon points="24,40 28,38 28,42 24,44" fill={d} opacity="0.8" />
      <Line x1="24" y1="36" x2="24" y2="28" stroke={d} strokeWidth="2.5" />
      {/* Frame — flat panel */}
      <Rect x="6" y="2" width="36" height="28" rx="2" fill={color} />
      <Rect x="10" y="6" width="28" height="20" rx="1" fill="#0A0A1A" />
      {/* City art inside */}
      <Rect x="11" y="17" width="5" height="8" fill={color} opacity="0.5" />
      <Rect x="17" y="13" width="4" height="12" fill={l} opacity="0.5" />
      <Rect x="22" y="19" width="4" height="6" fill={color} opacity="0.4" />
      <Rect x="27" y="14" width="5" height="11" fill={l} opacity="0.45" />
      <Circle cx="34" cy="9" r="3" fill="#FCD34D" opacity="0.6" />
      {/* Frame corners */}
      {[[8, 4], [40, 4], [8, 28], [40, 28]].map(([cx, cy]) => (
        <Circle key={`${cx}${cy}`} cx={cx} cy={cy} r="2.5" fill={l} opacity="0.6" />
      ))}
    </Svg>
  );
};

// CHART — trading/analytics screen
const CHART: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 30);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Screen stand — H=4 box */}
      <Polygon points="24,36 30,39 24,42 18,39" fill={d} />
      <Polygon points="18,39 24,42 24,44 18,41" fill={darken(color, 70)} />
      <Polygon points="24,42 30,39 30,41 24,44" fill={d} opacity="0.8" />
      <Line x1="24" y1="30" x2="24" y2="36" stroke={d} strokeWidth="3" />
      {/* Monitor housing — H=20 flat box */}
      <Polygon points="6,4 42,4 42,30 6,30" fill={darken(color, 40)} />
      <Polygon points="42,4 46,6 46,32 42,30" fill={d} />
      <Polygon points="6,30 42,30 46,32 10,32" fill={d} opacity="0.6" />
      {/* Screen */}
      <Rect x="8" y="6" width="32" height="22" rx="1" fill="#050510" />
      {/* Chart content */}
      <Polygon points="8,24 16,20 22,16 28,18 36,10 40,14 40,26 8,26" fill={color} opacity="0.12" />
      <Path d="M8,24 L16,20 L22,16 L28,18 L36,10 L40,14" stroke={color} strokeWidth="1.5" fill="none" opacity="0.9" />
      {/* Grid lines */}
      <Line x1="8" y1="20" x2="40" y2="20" stroke={color} strokeWidth="0.5" opacity="0.25" />
      <Line x1="8" y1="14" x2="40" y2="14" stroke={color} strokeWidth="0.5" opacity="0.25" />
      {/* Current price dot */}
      <Circle cx="40" cy="14" r="2.5" fill={color} />
      <Circle cx="40" cy="14" r="1.2" fill="#fff" opacity="0.8" />
    </Svg>
  );
};

// CRYSTAL_BALL — mystic orb
const CRYSTAL_BALL: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 40), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Stand */}
      <Polygon points="24,34 32,38 24,42 16,38" fill={d} />
      <Polygon points="16,38 24,42 24,44 16,40" fill={darken(color, 60)} />
      <Polygon points="24,42 32,38 32,40 24,44" fill={d} opacity="0.8" />
      <Line x1="24" y1="30" x2="24" y2="34" stroke={d} strokeWidth="4" />
      {/* Ball shadow */}
      <Ellipse cx="24" cy="30" rx="13" ry="5" fill={d} opacity="0.3" />
      {/* Ball body */}
      <Circle cx="24" cy="18" r="14" fill={darken(color, 30)} />
      {/* Ball glow layers */}
      <Circle cx="24" cy="18" r="12" fill={color} opacity="0.4" />
      <Circle cx="24" cy="18" r="8" fill={l} opacity="0.25" />
      <Circle cx="24" cy="18" r="4" fill={l} opacity="0.4" />
      <Circle cx="24" cy="18" r="2" fill="#fff" opacity="0.7" />
      {/* Shine highlights */}
      <Circle cx="18" cy="11" r="4" fill="#fff" opacity="0.25" />
      <Circle cx="16" cy="10" r="2" fill="#fff" opacity="0.5" />
    </Svg>
  );
};

// SATELLITE — communication dish
const SATELLITE: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Base mount — H=6 box */}
      <Polygon points="24,32 30,35 24,38 18,35" fill={d} opacity="0.9" />
      <Polygon points="18,35 24,38 24,44 18,41" fill={darken(color, 70)} />
      <Polygon points="24,38 30,35 30,41 24,44" fill={d} opacity="0.8" />
      {/* Mast */}
      <Line x1="24" y1="32" x2="24" y2="22" stroke={d} strokeWidth="2.5" />
      {/* Dish curved surface */}
      <Path d="M8,22 Q24,8 40,22" stroke={color} strokeWidth="3" fill="none" />
      <Path d="M8,22 Q24,8 40,22 Q24,14 8,22" fill={color} opacity="0.2" />
      {/* Dish rim */}
      <Ellipse cx="24" cy="22" rx="16" ry="4" fill="none" stroke={color} strokeWidth="2" />
      {/* Signal feed */}
      <Line x1="24" y1="22" x2="24" y2="12" stroke={d} strokeWidth="1.5" />
      <Circle cx="24" cy="11" r="3" fill={color} opacity="0.9" />
      {/* Signal dot */}
      <Circle cx="24" cy="11" r="1.5" fill="#FCD34D" />
    </Svg>
  );
};

// PILLAR — decorative column
const PILLAR: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Capital (top) */}
      <Polygon points="18,4 30,4 30,8 18,8" fill={l} opacity="0.8" />
      <Polygon points="16,6 32,6 32,10 16,10" fill={color} />
      {/* Column shaft */}
      <Polygon points="22,10 26,10 26,36 22,36" fill={d} />
      <Polygon points="19,10 22,10 22,36 19,36" fill={color} />
      <Polygon points="26,10 29,10 29,36 26,36" fill={d} opacity="0.7" />
      {/* Fluting lines */}
      <Line x1="21" y1="10" x2="21" y2="36" stroke={l} strokeWidth="0.8" opacity="0.3" />
      <Line x1="24" y1="10" x2="24" y2="36" stroke={l} strokeWidth="0.8" opacity="0.2" />
      <Line x1="27" y1="10" x2="27" y2="36" stroke={d} strokeWidth="0.8" opacity="0.2" />
      {/* Base */}
      <Polygon points="16,36 32,36 32,40 16,40" fill={color} />
      <Polygon points="14,38 34,38 34,44 14,44" fill={l} opacity="0.7" />
    </Svg>
  );
};

// FALLBACK — generic crate/box
const FALLBACK: SpriteFn = ({ size, color = '#8B5CF6' }) => {
  const d = darken(color, 55), l = lighten(color, 40);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      <Polygon points={topFace(16)} fill={l} opacity="0.85" />
      <Polygon points={leftFace(16)} fill={color} />
      <Polygon points={rightFace(16)} fill={d} />
      {/* Tape cross on top */}
      <Line x1="24" y1="8" x2="24" y2="28" stroke={darken(color, 20)} strokeWidth="1.5" opacity="0.4" />
      <Line x1="10" y1="22" x2="38" y2="18" stroke={darken(color, 20)} strokeWidth="1.5" opacity="0.4" />
      {/* Left face lines */}
      <Line x1="6" y1="20" x2="22" y2="30" stroke={d} strokeWidth="0.8" opacity="0.3" />
      {/* Right face lines */}
      <Line x1="26" y1="32" x2="42" y2="22" stroke={darken(color, 70)} strokeWidth="0.8" opacity="0.3" />
    </Svg>
  );
};

// TARGET — bullseye target
const TARGET: SpriteFn = ({ size, color = '#EF4444' }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 44">
      {/* Stand base */}
      <Polygon points="24,34 30,37 24,40 18,37" fill="#374151" />
      <Polygon points="18,37 24,40 24,44 18,41" fill="#1F2937" />
      <Polygon points="24,40 30,37 30,41 24,44" fill="#374151" opacity="0.8" />
      <Line x1="24" y1="34" x2="24" y2="26" stroke="#374151" strokeWidth="2.5" />
      {/* Target board — flat circle */}
      <Circle cx="24" cy="16" r="14" fill={color} opacity="0.12" />
      <Circle cx="24" cy="16" r="14" fill="none" stroke={color} strokeWidth="2" />
      <Circle cx="24" cy="16" r="10" fill="#fff" opacity="0.05" />
      <Circle cx="24" cy="16" r="10" fill="none" stroke={color} strokeWidth="2" />
      <Circle cx="24" cy="16" r="6" fill={color} opacity="0.2" />
      <Circle cx="24" cy="16" r="6" fill="none" stroke={color} strokeWidth="2" />
      <Circle cx="24" cy="16" r="3" fill={color} />
      <Circle cx="24" cy="16" r="1.5" fill="#fff" opacity="0.8" />
    </Svg>
  );
};

// ─── Hair sprite components ────────────────────────────────────────────────────
export const HAIR_SPRITES = [
  null, // 0: default cap (handled in avatar component)
  // 1: spiky
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 20 10">
      <Polygon points="2,10 5,2 8,10" fill="#FCD34D" />
      <Polygon points="7,10 10,1 13,10" fill="#FBBF24" />
      <Polygon points="12,10 15,2 18,10" fill="#FCD34D" />
    </Svg>
  ),
  // 2: purple flow
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 20 10">
      <Path d="M2,4 Q6,1 10,3 Q14,5 18,2" stroke="#A78BFA" strokeWidth="3" fill="none" />
      <Path d="M4,7 Q8,4 12,6 Q16,8 18,5" stroke="#8B5CF6" strokeWidth="2" fill="none" opacity="0.7" />
      <Circle cx="17" cy="3" r="2.5" fill="#FCD34D" opacity="0.9" />
    </Svg>
  ),
  // 3: top hat
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 20 16">
      <Rect x="2" y="12" width="16" height="3" rx="1.5" fill="#111827" />
      <Rect x="5" y="2" width="10" height="11" rx="1.5" fill="#1F2937" />
      <Rect x="7" y="3" width="4" height="5" fill="#fff" opacity="0.07" />
      <Line x1="5" y1="10" x2="15" y2="10" stroke="#374151" strokeWidth="1" />
    </Svg>
  ),
  // 4: sun hat
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 20 14">
      <Rect x="0" y="9" width="20" height="3" rx="1.5" fill="#D97706" />
      <Rect x="5" y="2" width="10" height="8" rx="3" fill="#F59E0B" />
      <Line x1="3" y1="9" x2="17" y2="9" stroke="#B45309" strokeWidth="1" opacity="0.6" />
      <Rect x="6" y="3" width="3" height="4" fill="#FCD34D" opacity="0.3" />
    </Svg>
  ),
  // 5: halo
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 20 10">
      <Ellipse cx="10" cy="6" rx="7" ry="3" fill="none" stroke="#FCD34D" strokeWidth="2" />
      <Circle cx="16" cy="4" r="2" fill="#FCD34D" opacity="0.8" />
    </Svg>
  ),
];

// ─── emoji → sprite map ───────────────────────────────────────────────────────

const SPRITE_MAP: Record<string, SpriteFn> = {
  '🪑': CHAIR,
  '🛋️': SOFA,
  '🛏️': BED,
  '🗃️': TABLE,
  '☕': COFFEE,
  '🎱': POOL_TABLE,
  '💡': LAMP,
  '🕯️': CANDLE,
  '💎': CRYSTAL,
  '🔦': TORCH,
  '🟫': RUG,
  '🟪': RUG,
  '⬛': RUG,
  '🔲': RUG,
  '🌴': PALM,
  '🎋': BAMBOO,
  '🌸': FLOWER,
  '🌀': PORTAL,
  '👑': CROWN,
  '📡': SATELLITE,
  '🏛️': PILLAR,
  '🕹️': JOYSTICK,
  '🥇': TROPHY,
  '🎮': GAMEPAD,
  '🎯': TARGET,
  '🏆': TROPHY,
  '📱': PHONE,
  '💻': LAPTOP,
  '📺': MONITOR,
  '🗄️': SERVER,
  '🖥️': MONITOR,
  '💠': DIAMOND_WALL,
  '🗿': STATUE,
  '🔥': FIRE,
  '🍾': CHAMPAGNE,
  '🔮': CRYSTAL_BALL,
  '🪙': COIN,
  '⚡': LIGHTNING,
  '🔗': CHAIN,
  '🏦': BANK,
  '🚪': DOOR,
  '✨': SPARKLES,
  '🌟': STAR,
  '⭐': STAR,
  '🔴': VIP_ROPE,
  '🪧': SIGN,
  '🖼️': FRAME,
  '📊': CHART,
  '📦': FALLBACK,
};

// ─── WorldSprite component ────────────────────────────────────────────────────

interface WorldSpriteProps {
  emoji: string;
  size: number;
  color?: string;
}

export function WorldSprite({ emoji, size, color = '#8B5CF6' }: WorldSpriteProps) {
  const SpriteFn = SPRITE_MAP[emoji] ?? FALLBACK;
  return <SpriteFn size={size} color={color} />;
}
