import React from 'react';
import Svg, { Rect, Circle, G, Polygon, Path, Line } from 'react-native-svg';

interface SpriteProps {
  size: number;
  color?: string;
}

// All sprites render in a 32x32 viewBox
type SpriteFn = (p: SpriteProps) => React.ReactElement;

// ─── helpers ─────────────────────────────────────────────────────────────────

function lighten(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 60);
  const g = Math.min(255, ((n >> 8) & 0xff) + 60);
  const b = Math.min(255, (n & 0xff) + 60);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darken(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 50);
  const g = Math.max(0, ((n >> 8) & 0xff) - 50);
  const b = Math.max(0, (n & 0xff) - 50);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── sprite definitions ───────────────────────────────────────────────────────

const CHAIR: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Backrest */}
    <Rect x="6" y="4" width="8" height="14" rx="2" fill={color} />
    <Rect x="7" y="5" width="6" height="10" fill={lighten(color)} opacity="0.5" />
    {/* Seat */}
    <Rect x="6" y="16" width="18" height="7" rx="2" fill={color} />
    <Rect x="7" y="17" width="16" height="3" fill={lighten(color)} opacity="0.4" />
    {/* Legs */}
    <Rect x="8" y="23" width="3" height="6" rx="1" fill={darken(color)} />
    <Rect x="19" y="23" width="3" height="6" rx="1" fill={darken(color)} />
    {/* Armrest right */}
    <Rect x="20" y="14" width="4" height="4" rx="1" fill={darken(color)} />
  </Svg>
);

const SOFA: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Back */}
    <Rect x="2" y="8" width="28" height="10" rx="3" fill={color} />
    <Rect x="3" y="9" width="26" height="6" fill={lighten(color)} opacity="0.35" />
    {/* Seat base */}
    <Rect x="2" y="18" width="28" height="8" rx="2" fill={darken(color)} />
    {/* Seat cushions */}
    <Rect x="3" y="19" width="12" height="6" rx="2" fill={color} />
    <Rect x="17" y="19" width="12" height="6" rx="2" fill={color} />
    {/* Arms */}
    <Rect x="0" y="12" width="4" height="14" rx="2" fill={darken(color)} />
    <Rect x="28" y="12" width="4" height="14" rx="2" fill={darken(color)} />
    {/* Feet */}
    <Rect x="4" y="26" width="3" height="4" rx="1" fill={darken(color)} />
    <Rect x="25" y="26" width="3" height="4" rx="1" fill={darken(color)} />
  </Svg>
);

const BED: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Frame */}
    <Rect x="2" y="12" width="28" height="16" rx="2" fill={darken(color)} />
    {/* Headboard */}
    <Rect x="2" y="6" width="8" height="10" rx="2" fill={color} />
    {/* Sheet/bedding */}
    <Rect x="10" y="13" width="19" height="13" rx="1" fill={lighten(color)} opacity="0.8" />
    {/* Pillow */}
    <Rect x="11" y="14" width="8" height="5" rx="2" fill="#fff" opacity="0.85" />
    {/* Blanket fold */}
    <Rect x="10" y="21" width="19" height="4" rx="1" fill={color} />
    {/* Legs */}
    <Rect x="3" y="27" width="3" height="4" rx="1" fill={darken(color)} />
    <Rect x="26" y="27" width="3" height="4" rx="1" fill={darken(color)} />
  </Svg>
);

const TABLE: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Tabletop */}
    <Rect x="1" y="10" width="30" height="5" rx="2" fill={color} />
    <Rect x="2" y="11" width="28" height="2" fill={lighten(color)} opacity="0.45" />
    {/* Legs */}
    <Rect x="4" y="15" width="4" height="14" rx="1" fill={darken(color)} />
    <Rect x="24" y="15" width="4" height="14" rx="1" fill={darken(color)} />
    {/* Shelf */}
    <Rect x="4" y="22" width="24" height="3" rx="1" fill={color} opacity="0.6" />
  </Svg>
);

const LAMP: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Glow */}
    <Circle cx="16" cy="8" r="7" fill="#FCD34D" opacity="0.2" />
    {/* Shade */}
    <Polygon points="8,12 24,12 20,4 12,4" fill="#FCD34D" />
    <Rect x="9" y="8" width="14" height="3" fill="#fff" opacity="0.2" />
    {/* Pole */}
    <Rect x="14" y="12" width="4" height="12" rx="1" fill={darken(color)} />
    {/* Base */}
    <Rect x="8" y="24" width="16" height="4" rx="2" fill={color} />
  </Svg>
);

const CANDLE: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Glow */}
    <Circle cx="16" cy="8" r="6" fill="#FCD34D" opacity="0.25" />
    {/* Flame */}
    <Polygon points="16,3 18,9 16,7 14,9" fill="#F97316" />
    <Polygon points="16,5 17,9 16,8 15,9" fill="#FCD34D" />
    {/* Wick */}
    <Rect x="15" y="9" width="2" height="3" fill="#1F1F2E" />
    {/* Body */}
    <Rect x="11" y="12" width="10" height="14" rx="2" fill={color} />
    <Rect x="12" y="13" width="5" height="10" fill={lighten(color)} opacity="0.3" />
    {/* Base */}
    <Rect x="9" y="26" width="14" height="3" rx="1" fill={darken(color)} />
  </Svg>
);

const CRYSTAL: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Gem body */}
    <Polygon points="16,3 26,12 22,28 10,28 6,12" fill={color} />
    <Polygon points="16,3 26,12 22,28 10,28 6,12" fill="url(#shine)" opacity="0.4" />
    {/* Facets */}
    <Polygon points="16,3 26,12 16,10" fill={lighten(color)} opacity="0.5" />
    <Polygon points="16,3 6,12 16,10" fill={lighten(color)} opacity="0.25" />
    {/* Shine dot */}
    <Circle cx="12" cy="12" r="2" fill="#fff" opacity="0.6" />
    <Circle cx="12" cy="12" r="1" fill="#fff" opacity="0.9" />
  </Svg>
);

const TORCH: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Head/light source */}
    <Rect x="8" y="4" width="16" height="10" rx="5" fill="#FCD34D" />
    <Rect x="10" y="6" width="8" height="4" fill="#fff" opacity="0.4" />
    {/* Light cone */}
    <Polygon points="8,14 24,14 28,28 4,28" fill="#FCD34D" opacity="0.2" />
    {/* Body */}
    <Rect x="13" y="14" width="6" height="12" rx="1" fill={color} />
    <Rect x="14" y="15" width="3" height="8" fill={lighten(color)} opacity="0.4" />
    {/* Handle */}
    <Rect x="14" y="26" width="4" height="4" rx="1" fill={darken(color)} />
  </Svg>
);

const RUG: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Rug base */}
    <Rect x="2" y="8" width="28" height="18" rx="3" fill={color} opacity="0.85" />
    {/* Border */}
    <Rect x="3" y="9" width="26" height="16" rx="2" fill="none" stroke={lighten(color)} strokeWidth="1.5" />
    {/* Pattern lines */}
    <Rect x="8" y="13" width="16" height="2" rx="1" fill={lighten(color)} opacity="0.4" />
    <Rect x="8" y="17" width="16" height="2" rx="1" fill={lighten(color)} opacity="0.4" />
    {/* Corner dots */}
    <Circle cx="7" cy="12" r="1.5" fill={lighten(color)} opacity="0.6" />
    <Circle cx="25" cy="12" r="1.5" fill={lighten(color)} opacity="0.6" />
    <Circle cx="7" cy="22" r="1.5" fill={lighten(color)} opacity="0.6" />
    <Circle cx="25" cy="22" r="1.5" fill={lighten(color)} opacity="0.6" />
  </Svg>
);

const PALM: SpriteFn = ({ size, color = '#10B981' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Trunk */}
    <Rect x="13" y="16" width="6" height="14" rx="2" fill="#92400E" />
    <Rect x="14" y="17" width="2" height="12" fill="#D97706" opacity="0.5" />
    {/* Leaves */}
    <Polygon points="16,6 10,16 16,14" fill={color} />
    <Polygon points="16,6 22,16 16,14" fill={color} />
    <Polygon points="16,8 5,14 16,14" fill={color} opacity="0.85" />
    <Polygon points="16,8 27,14 16,14" fill={color} opacity="0.85" />
    <Polygon points="16,10 16,4 14,10" fill={lighten(color)} opacity="0.5" />
    {/* Coconuts */}
    <Circle cx="14" cy="16" r="2" fill="#92400E" />
    <Circle cx="18" cy="15" r="2" fill="#92400E" />
  </Svg>
);

const BAMBOO: SpriteFn = ({ size, color = '#10B981' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Left stalk */}
    <Rect x="7" y="2" width="5" height="30" rx="2" fill={color} />
    <Rect x="7" y="9" width="5" height="2" fill={darken(color)} />
    <Rect x="7" y="18" width="5" height="2" fill={darken(color)} />
    <Rect x="8" y="3" width="2" height="6" fill={lighten(color)} opacity="0.5" />
    <Rect x="8" y="11" width="2" height="6" fill={lighten(color)} opacity="0.5" />
    {/* Right stalk */}
    <Rect x="20" y="5" width="5" height="27" rx="2" fill={color} />
    <Rect x="20" y="12" width="5" height="2" fill={darken(color)} />
    <Rect x="20" y="21" width="5" height="2" fill={darken(color)} />
    <Rect x="21" y="6" width="2" height="6" fill={lighten(color)} opacity="0.5" />
    {/* Leaves */}
    <Polygon points="12,8 18,4 14,10" fill={color} />
    <Polygon points="12,17 19,13 15,19" fill={color} />
    <Polygon points="20,11 14,7 18,13" fill={lighten(color)} opacity="0.6" />
  </Svg>
);

const FLOWER: SpriteFn = ({ size, color = '#EC4899' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Petals */}
    <Circle cx="16" cy="9" r="4" fill={color} opacity="0.9" />
    <Circle cx="22" cy="13" r="4" fill={color} opacity="0.9" />
    <Circle cx="22" cy="20" r="4" fill={color} opacity="0.9" />
    <Circle cx="16" cy="24" r="4" fill={color} opacity="0.9" />
    <Circle cx="10" cy="20" r="4" fill={color} opacity="0.9" />
    <Circle cx="10" cy="13" r="4" fill={color} opacity="0.9" />
    {/* Center */}
    <Circle cx="16" cy="16" r="5" fill="#FCD34D" />
    <Circle cx="16" cy="16" r="3" fill="#F59E0B" />
    {/* Stem */}
    <Rect x="14" y="26" width="4" height="4" rx="1" fill="#10B981" />
  </Svg>
);

const MONITOR: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Screen body */}
    <Rect x="2" y="3" width="28" height="20" rx="3" fill={darken(color)} />
    {/* Screen content */}
    <Rect x="4" y="5" width="24" height="16" rx="1" fill="#0A0A1A" />
    <Rect x="5" y="6" width="22" height="12" fill={color} opacity="0.2" />
    {/* Data lines on screen */}
    <Rect x="7" y="8" width="14" height="2" rx="1" fill={color} opacity="0.7" />
    <Rect x="7" y="12" width="10" height="2" rx="1" fill={lighten(color)} opacity="0.5" />
    <Rect x="7" y="15" width="12" height="2" rx="1" fill={color} opacity="0.4" />
    {/* Stand */}
    <Rect x="13" y="23" width="6" height="4" rx="1" fill={darken(color)} />
    <Rect x="9" y="27" width="14" height="3" rx="1" fill={darken(color)} />
  </Svg>
);

const LAPTOP: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Screen (open) */}
    <Rect x="4" y="4" width="24" height="16" rx="2" fill={darken(color)} />
    <Rect x="5" y="5" width="22" height="13" rx="1" fill="#0A0A1A" />
    <Rect x="6" y="6" width="10" height="8" fill={color} opacity="0.15" />
    <Rect x="7" y="7" width="7" height="1.5" rx="0.5" fill={color} opacity="0.7" />
    <Rect x="7" y="10" width="5" height="1.5" rx="0.5" fill={color} opacity="0.5" />
    <Rect x="7" y="13" width="6" height="1.5" rx="0.5" fill={color} opacity="0.4" />
    {/* Hinge */}
    <Rect x="4" y="19" width="24" height="2" fill={color} opacity="0.5" />
    {/* Keyboard base */}
    <Rect x="3" y="20" width="26" height="8" rx="2" fill={darken(color)} />
    <Rect x="5" y="21" width="22" height="5" rx="1" fill="#0A0A1A" />
    {/* Keys */}
    <Rect x="6" y="22" width="3" height="2" rx="0.5" fill={color} opacity="0.4" />
    <Rect x="10" y="22" width="3" height="2" rx="0.5" fill={color} opacity="0.4" />
    <Rect x="14" y="22" width="3" height="2" rx="0.5" fill={color} opacity="0.4" />
    <Rect x="18" y="22" width="3" height="2" rx="0.5" fill={color} opacity="0.4" />
    <Rect x="22" y="22" width="3" height="2" rx="0.5" fill={color} opacity="0.4" />
    <Rect x="9" y="24" width="12" height="2" rx="0.5" fill={color} opacity="0.35" />
  </Svg>
);

const PHONE: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Body */}
    <Rect x="8" y="2" width="16" height="28" rx="4" fill={darken(color)} />
    {/* Screen */}
    <Rect x="9" y="5" width="14" height="22" rx="2" fill="#0A0A1A" />
    <Rect x="10" y="6" width="12" height="18" fill={color} opacity="0.15" />
    {/* App icons on screen */}
    <Rect x="11" y="8" width="4" height="4" rx="1" fill={color} opacity="0.7" />
    <Rect x="17" y="8" width="4" height="4" rx="1" fill="#10B981" opacity="0.7" />
    <Rect x="11" y="14" width="4" height="4" rx="1" fill="#F59E0B" opacity="0.7" />
    <Rect x="17" y="14" width="4" height="4" rx="1" fill={lighten(color)} opacity="0.7" />
    {/* Home indicator */}
    <Rect x="13" y="25" width="6" height="2" rx="1" fill={color} opacity="0.5" />
  </Svg>
);

const SERVER: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Rack units */}
    <Rect x="4" y="4" width="24" height="6" rx="1" fill={darken(color)} />
    <Rect x="5" y="5" width="22" height="4" fill="#0A0A1A" />
    <Circle cx="24" cy="7" r="1.5" fill="#10B981" />
    <Rect x="6" y="6" width="14" height="2" rx="0.5" fill={color} opacity="0.4" />

    <Rect x="4" y="12" width="24" height="6" rx="1" fill={darken(color)} />
    <Rect x="5" y="13" width="22" height="4" fill="#0A0A1A" />
    <Circle cx="24" cy="15" r="1.5" fill={color} />
    <Rect x="6" y="14" width="12" height="2" rx="0.5" fill={color} opacity="0.4" />

    <Rect x="4" y="20" width="24" height="6" rx="1" fill={darken(color)} />
    <Rect x="5" y="21" width="22" height="4" fill="#0A0A1A" />
    <Circle cx="24" cy="23" r="1.5" fill="#F59E0B" />
    <Rect x="6" y="22" width="10" height="2" rx="0.5" fill={color} opacity="0.4" />

    {/* Base */}
    <Rect x="4" y="28" width="24" height="3" rx="1" fill={darken(color)} />
  </Svg>
);

const CROWN: SpriteFn = ({ size, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Crown body */}
    <Polygon points="3,24 3,14 10,20 16,8 22,20 29,14 29,24" fill={color} />
    {/* Band */}
    <Rect x="3" y="22" width="26" height="4" rx="1" fill={darken(color)} />
    {/* Jewels */}
    <Circle cx="16" cy="10" r="2.5" fill="#EC4899" />
    <Circle cx="10" cy="21" r="2" fill="#8B5CF6" />
    <Circle cx="22" cy="21" r="2" fill="#3B82F6" />
    <Circle cx="16" cy="24" r="2" fill="#10B981" />
    {/* Shine */}
    <Polygon points="12,14 14,18 10,18" fill="#fff" opacity="0.25" />
  </Svg>
);

const TROPHY: SpriteFn = ({ size, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Cup */}
    <Rect x="9" y="3" width="14" height="14" rx="2" fill={color} />
    <Rect x="10" y="4" width="12" height="8" fill={lighten(color)} opacity="0.35" />
    {/* Handles */}
    <Rect x="4" y="5" width="5" height="8" rx="3" fill="none" stroke={color} strokeWidth="3" />
    <Rect x="23" y="5" width="5" height="8" rx="3" fill="none" stroke={color} strokeWidth="3" />
    {/* Stem */}
    <Rect x="13" y="17" width="6" height="8" rx="1" fill={darken(color)} />
    {/* Base */}
    <Rect x="8" y="25" width="16" height="4" rx="2" fill={color} />
    {/* Star inside cup */}
    <Polygon points="16,6 17.5,10 13.5,8 18.5,8 14.5,10" fill={darken(color)} opacity="0.6" />
  </Svg>
);

const FIRE: SpriteFn = ({ size, color = '#EF4444' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Outer flame */}
    <Polygon points="16,2 22,12 24,8 26,18 22,28 10,28 6,18 8,8 10,12" fill="#F97316" />
    {/* Middle flame */}
    <Polygon points="16,6 20,14 21,10 23,18 20,26 12,26 9,18 11,10 12,14" fill={color} />
    {/* Inner flame */}
    <Polygon points="16,10 18,16 19,14 20,19 18,24 14,24 12,19 13,14 14,16" fill="#FCD34D" />
    {/* Core */}
    <Circle cx="16" cy="22" r="3" fill="#FCD34D" />
    {/* Base embers */}
    <Rect x="10" y="28" width="12" height="3" rx="1" fill={darken(color)} />
  </Svg>
);

const CHAMPAGNE: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Cork */}
    <Rect x="13" y="2" width="6" height="4" rx="1" fill="#D97706" />
    {/* Neck */}
    <Rect x="14" y="6" width="4" height="8" rx="1" fill="#10B981" />
    {/* Foil */}
    <Rect x="12" y="10" width="8" height="5" rx="1" fill="#FCD34D" />
    {/* Body */}
    <Rect x="9" y="14" width="14" height="14" rx="4" fill="#10B981" />
    <Rect x="10" y="15" width="6" height="10" rx="2" fill="#fff" opacity="0.15" />
    {/* Label */}
    <Rect x="10" y="18" width="12" height="6" rx="2" fill="#fff" opacity="0.25" />
    {/* Bubbles */}
    <Circle cx="14" cy="17" r="1" fill="#fff" opacity="0.5" />
    <Circle cx="18" cy="20" r="1" fill="#fff" opacity="0.4" />
    <Circle cx="15" cy="23" r="0.8" fill="#fff" opacity="0.35" />
  </Svg>
);

const DIAMOND_WALL: SpriteFn = ({ size, color = '#06B6D4' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Frame */}
    <Rect x="2" y="4" width="28" height="24" rx="2" fill={darken(color)} />
    <Rect x="3" y="5" width="26" height="22" rx="1" fill="#0A0A1A" />
    {/* Diamond shape */}
    <Polygon points="16,8 26,16 16,24 6,16" fill={color} />
    <Polygon points="16,8 26,16 16,16" fill={lighten(color)} opacity="0.5" />
    <Polygon points="16,8 6,16 16,16" fill={lighten(color)} opacity="0.25" />
    {/* Shine */}
    <Circle cx="12" cy="13" r="1.5" fill="#fff" opacity="0.7" />
  </Svg>
);

const STATUE: SpriteFn = ({ size, color = '#6B7280' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Head */}
    <Circle cx="16" cy="6" r="5" fill={color} />
    <Circle cx="14" cy="5" r="1" fill={darken(color)} />
    <Circle cx="18" cy="5" r="1" fill={darken(color)} />
    {/* Body */}
    <Rect x="11" y="11" width="10" height="12" rx="2" fill={color} />
    <Rect x="12" y="12" width="4" height="8" fill={lighten(color)} opacity="0.2" />
    {/* Arms */}
    <Rect x="5" y="12" width="6" height="4" rx="2" fill={color} />
    <Rect x="21" y="12" width="6" height="4" rx="2" fill={color} />
    {/* Legs */}
    <Rect x="11" y="23" width="4" height="7" rx="1" fill={color} />
    <Rect x="17" y="23" width="4" height="7" rx="1" fill={color} />
    {/* Base */}
    <Rect x="7" y="29" width="18" height="2" rx="1" fill={darken(color)} />
  </Svg>
);

const PORTAL: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Outer ring */}
    <Circle cx="16" cy="16" r="14" fill="none" stroke={color} strokeWidth="3" />
    {/* Mid ring */}
    <Circle cx="16" cy="16" r="10" fill="none" stroke={lighten(color)} strokeWidth="2" opacity="0.7" />
    {/* Inner ring */}
    <Circle cx="16" cy="16" r="6" fill="none" stroke={color} strokeWidth="2" opacity="0.5" />
    {/* Center glow */}
    <Circle cx="16" cy="16" r="3" fill={color} opacity="0.8" />
    <Circle cx="16" cy="16" r="1.5" fill="#fff" opacity="0.9" />
    {/* Swirl lines */}
    <Path d="M16,2 Q28,10 22,16" stroke={lighten(color)} strokeWidth="1.5" fill="none" opacity="0.6" />
    <Path d="M30,16 Q22,28 16,22" stroke={lighten(color)} strokeWidth="1.5" fill="none" opacity="0.6" />
    <Path d="M16,30 Q4,22 10,16" stroke={lighten(color)} strokeWidth="1.5" fill="none" opacity="0.6" />
    <Path d="M2,16 Q10,4 16,10" stroke={lighten(color)} strokeWidth="1.5" fill="none" opacity="0.6" />
  </Svg>
);

const SATELLITE: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Dish */}
    <Path d="M4,28 Q4,6 28,4" stroke={color} strokeWidth="3" fill="none" />
    <Path d="M4,28 Q14,20 28,4" stroke={lighten(color)} strokeWidth="1.5" fill="none" opacity="0.5" />
    {/* Dish fill */}
    <Path d="M4,28 Q4,6 28,4 Q20,16 4,28" fill={color} opacity="0.25" />
    {/* Mount */}
    <Rect x="14" y="20" width="4" height="8" rx="1" fill={darken(color)} />
    <Rect x="10" y="27" width="12" height="3" rx="1" fill={darken(color)} />
    {/* Signal dot */}
    <Circle cx="26" cy="6" r="3" fill="#FCD34D" />
    <Circle cx="26" cy="6" r="1.5" fill="#fff" opacity="0.8" />
  </Svg>
);

const PILLAR: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Capital */}
    <Rect x="4" y="4" width="24" height="5" rx="1" fill={color} />
    <Rect x="2" y="7" width="28" height="3" rx="1" fill={lighten(color)} opacity="0.6" />
    {/* Column */}
    <Rect x="10" y="10" width="12" height="17" rx="2" fill={color} />
    <Rect x="11" y="11" width="4" height="15" fill={lighten(color)} opacity="0.2" />
    {/* Fluting lines */}
    <Rect x="14" y="10" width="2" height="17" fill={lighten(color)} opacity="0.15" />
    <Rect x="17" y="10" width="2" height="17" fill={lighten(color)} opacity="0.1" />
    {/* Base */}
    <Rect x="2" y="27" width="28" height="3" rx="1" fill={lighten(color)} opacity="0.6" />
    <Rect x="4" y="29" width="24" height="2" rx="1" fill={color} />
  </Svg>
);

const JOYSTICK: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Base unit */}
    <Rect x="4" y="16" width="24" height="14" rx="4" fill={darken(color)} />
    <Rect x="5" y="17" width="22" height="10" fill="#0A0A1A" />
    {/* Action buttons */}
    <Circle cx="22" cy="22" r="3" fill="#EF4444" />
    <Circle cx="22" cy="22" r="1.5" fill="#fff" opacity="0.4" />
    <Circle cx="26" cy="18" r="2.5" fill={color} />
    {/* Stick */}
    <Circle cx="13" cy="22" r="5" fill={color} opacity="0.6" />
    <Rect x="10" y="10" width="6" height="13" rx="3" fill={color} />
    {/* Stick top knob */}
    <Circle cx="13" cy="9" r="4" fill={lighten(color)} />
    <Circle cx="12" cy="8" r="1.5" fill="#fff" opacity="0.5" />
  </Svg>
);

const GAMEPAD: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Body */}
    <Rect x="3" y="8" width="26" height="18" rx="6" fill={darken(color)} />
    <Rect x="4" y="9" width="24" height="14" fill="#0A0A1A" />
    {/* D-Pad left */}
    <Rect x="7" y="14" width="9" height="3" rx="1" fill={color} opacity="0.7" />
    <Rect x="9.5" y="11" width="4" height="9" rx="1" fill={color} opacity="0.7" />
    {/* Right buttons */}
    <Circle cx="22" cy="13" r="2.5" fill="#10B981" />
    <Circle cx="26" cy="17" r="2.5" fill="#EF4444" />
    <Circle cx="22" cy="21" r="2.5" fill="#3B82F6" />
    <Circle cx="18" cy="17" r="2.5" fill="#F59E0B" />
    {/* Center buttons */}
    <Circle cx="14" cy="17" r="1.5" fill={color} opacity="0.5" />
    <Circle cx="17" cy="17" r="1.5" fill={color} opacity="0.5" />
  </Svg>
);

const TARGET: SpriteFn = ({ size, color = '#EF4444' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Rings */}
    <Circle cx="16" cy="16" r="14" fill={color} opacity="0.15" stroke={color} strokeWidth="2" />
    <Circle cx="16" cy="16" r="10" fill="#fff" opacity="0.05" stroke={color} strokeWidth="2" />
    <Circle cx="16" cy="16" r="6" fill={color} opacity="0.3" stroke={color} strokeWidth="2" />
    {/* Bullseye */}
    <Circle cx="16" cy="16" r="3" fill={color} />
    <Circle cx="16" cy="16" r="1.5" fill="#fff" opacity="0.8" />
    {/* Crosshairs */}
    <Rect x="14" y="1" width="4" height="4" rx="1" fill={color} opacity="0.4" />
    <Rect x="14" y="27" width="4" height="4" rx="1" fill={color} opacity="0.4" />
    <Rect x="1" y="14" width="4" height="4" rx="1" fill={color} opacity="0.4" />
    <Rect x="27" y="14" width="4" height="4" rx="1" fill={color} opacity="0.4" />
  </Svg>
);

const CRYSTAL_BALL: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Stand */}
    <Rect x="10" y="26" width="12" height="4" rx="2" fill={darken(color)} />
    <Rect x="14" y="24" width="4" height="4" rx="1" fill={darken(color)} />
    {/* Ball */}
    <Circle cx="16" cy="15" r="13" fill={color} opacity="0.3" />
    <Circle cx="16" cy="15" r="12" fill={darken(color)} />
    {/* Inner glow */}
    <Circle cx="16" cy="15" r="9" fill={color} opacity="0.4" />
    <Circle cx="16" cy="15" r="6" fill={lighten(color)} opacity="0.3" />
    {/* Swirl */}
    <Circle cx="16" cy="15" r="3" fill={color} opacity="0.8" />
    {/* Shine */}
    <Circle cx="11" cy="10" r="3" fill="#fff" opacity="0.3" />
    <Circle cx="11" cy="10" r="1.5" fill="#fff" opacity="0.6" />
    <Circle cx="14" cy="8" r="1" fill="#fff" opacity="0.4" />
  </Svg>
);

const COIN: SpriteFn = ({ size, color = '#9945FF' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Coin body */}
    <Circle cx="16" cy="16" r="14" fill={darken(color)} />
    <Circle cx="16" cy="16" r="12" fill={color} />
    <Circle cx="16" cy="16" r="10" fill={lighten(color)} opacity="0.25" />
    {/* SOL symbol (S shape) */}
    <Rect x="10" y="11" width="12" height="3" rx="1.5" fill="#fff" opacity="0.9" />
    <Rect x="10" y="14" width="12" height="3" rx="1.5" fill="#fff" opacity="0.9" />
    <Rect x="10" y="17" width="12" height="3" rx="1.5" fill="#fff" opacity="0.9" />
    {/* Shine */}
    <Circle cx="11" cy="11" r="2" fill="#fff" opacity="0.3" />
  </Svg>
);

const LIGHTNING: SpriteFn = ({ size, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Glow */}
    <Circle cx="16" cy="16" r="12" fill={color} opacity="0.1" />
    {/* Bolt */}
    <Polygon points="19,2 10,16 16,16 13,30 22,16 16,16" fill={color} />
    <Polygon points="18,4 11,16 16,16 14,26 21,16 16,16" fill={lighten(color)} opacity="0.5" />
  </Svg>
);

const CHAIN: SpriteFn = ({ size, color = '#6B7280' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Link 1 */}
    <Rect x="4" y="6" width="12" height="8" rx="4" fill="none" stroke={color} strokeWidth="4" />
    <Rect x="6" y="8" width="8" height="4" rx="2" fill={darken(color)} />
    {/* Link 2 */}
    <Rect x="16" y="18" width="12" height="8" rx="4" fill="none" stroke={color} strokeWidth="4" />
    <Rect x="18" y="20" width="8" height="4" rx="2" fill={darken(color)} />
    {/* Connector */}
    <Rect x="13" y="10" width="6" height="12" rx="2" fill={color} opacity="0.6" />
  </Svg>
);

const BANK: SpriteFn = ({ size, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Pediment (roof triangle) */}
    <Polygon points="16,2 30,10 2,10" fill={color} />
    {/* Columns */}
    <Rect x="4" y="10" width="4" height="16" rx="1" fill={darken(color)} />
    <Rect x="10" y="10" width="4" height="16" rx="1" fill={darken(color)} />
    <Rect x="18" y="10" width="4" height="16" rx="1" fill={darken(color)} />
    <Rect x="24" y="10" width="4" height="16" rx="1" fill={darken(color)} />
    {/* Door */}
    <Rect x="12" y="19" width="8" height="7" rx="1" fill="#0A0A1A" />
    {/* Base */}
    <Rect x="2" y="26" width="28" height="4" rx="1" fill={color} />
  </Svg>
);

const COFFEE: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Steam */}
    <Path d="M11,6 Q9,3 11,1" stroke={color} strokeWidth="2" fill="none" opacity="0.6" />
    <Path d="M16,6 Q14,3 16,1" stroke={color} strokeWidth="2" fill="none" opacity="0.6" />
    <Path d="M21,6 Q19,3 21,1" stroke={color} strokeWidth="2" fill="none" opacity="0.6" />
    {/* Cup */}
    <Rect x="6" y="7" width="20" height="16" rx="3" fill={darken(color)} />
    <Rect x="7" y="8" width="18" height="12" rx="2" fill="#0A0A1A" />
    {/* Coffee liquid */}
    <Rect x="7" y="14" width="18" height="6" rx="2" fill="#92400E" opacity="0.8" />
    <Rect x="8" y="15" width="10" height="2" fill="#D97706" opacity="0.4" />
    {/* Handle */}
    <Rect x="26" y="10" width="4" height="9" rx="3" fill="none" stroke={darken(color)} strokeWidth="3" />
    {/* Saucer */}
    <Rect x="3" y="23" width="26" height="4" rx="2" fill={color} opacity="0.7" />
  </Svg>
);

const POOL_TABLE: SpriteFn = ({ size, color = '#10B981' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Table */}
    <Rect x="2" y="8" width="28" height="18" rx="3" fill={darken(color)} />
    <Rect x="4" y="10" width="24" height="14" rx="2" fill={color} />
    <Rect x="4" y="10" width="24" height="5" fill={lighten(color)} opacity="0.2" />
    {/* Pocket corners */}
    <Circle cx="5" cy="11" r="2" fill="#0A0A1A" />
    <Circle cx="27" cy="11" r="2" fill="#0A0A1A" />
    <Circle cx="5" cy="23" r="2" fill="#0A0A1A" />
    <Circle cx="27" cy="23" r="2" fill="#0A0A1A" />
    <Circle cx="16" cy="11" r="1.5" fill="#0A0A1A" />
    <Circle cx="16" cy="23" r="1.5" fill="#0A0A1A" />
    {/* Balls */}
    <Circle cx="12" cy="17" r="2.5" fill="#fff" />
    <Circle cx="16" cy="15" r="2.5" fill="#EF4444" />
    <Circle cx="20" cy="17" r="2.5" fill="#F59E0B" />
    <Circle cx="18" cy="20" r="2.5" fill="#3B82F6" />
    {/* Legs */}
    <Rect x="4" y="26" width="4" height="4" rx="1" fill={darken(color)} />
    <Rect x="24" y="26" width="4" height="4" rx="1" fill={darken(color)} />
  </Svg>
);

const DOOR: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Frame */}
    <Rect x="4" y="2" width="24" height="30" rx="2" fill={darken(color)} />
    {/* Door panel */}
    <Rect x="6" y="4" width="20" height="27" rx="1" fill={color} />
    <Rect x="7" y="5" width="10" height="15" rx="1" fill={lighten(color)} opacity="0.2" />
    {/* Panel detail */}
    <Rect x="8" y="6" width="7" height="6" rx="1" fill="none" stroke={lighten(color)} strokeWidth="0.8" opacity="0.5" />
    <Rect x="17" y="6" width="7" height="6" rx="1" fill="none" stroke={lighten(color)} strokeWidth="0.8" opacity="0.5" />
    <Rect x="8" y="14" width="7" height="10" rx="1" fill="none" stroke={lighten(color)} strokeWidth="0.8" opacity="0.5" />
    <Rect x="17" y="14" width="7" height="10" rx="1" fill="none" stroke={lighten(color)} strokeWidth="0.8" opacity="0.5" />
    {/* Knob */}
    <Circle cx="22" cy="17" r="2.5" fill="#FCD34D" />
    <Circle cx="22" cy="17" r="1.2" fill={darken(color)} />
  </Svg>
);

const SPARKLES: SpriteFn = ({ size, color = '#FCD34D' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Main star */}
    <Polygon points="16,2 18,12 28,14 18,16 16,26 14,16 4,14 14,12" fill={color} />
    <Polygon points="16,5 17.5,12 24,14 17.5,16 16,23 14.5,16 8,14 14.5,12" fill="#fff" opacity="0.5" />
    {/* Small star TL */}
    <Polygon points="6,4 7,8 11,9 7,10 6,14 5,10 1,9 5,8" fill={color} opacity="0.7" />
    {/* Small star BR */}
    <Polygon points="26,18 27,22 31,23 27,24 26,28 25,24 21,23 25,22" fill={color} opacity="0.7" />
    {/* Dot TBR */}
    <Circle cx="26" cy="6" r="2" fill={color} opacity="0.6" />
    <Circle cx="7" cy="27" r="1.5" fill={color} opacity="0.5" />
  </Svg>
);

const STAR: SpriteFn = ({ size, color = '#FCD34D' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* 5-point star */}
    <Polygon
      points="16,2 20,11 30,11 22,18 25,28 16,22 7,28 10,18 2,11 12,11"
      fill={color}
    />
    <Polygon
      points="16,5 19,12 27,12 21,17 23,25 16,20 9,25 11,17 5,12 13,12"
      fill="#fff"
      opacity="0.4"
    />
    {/* Center glow */}
    <Circle cx="16" cy="16" r="4" fill={lighten(color)} opacity="0.4" />
    <Circle cx="14" cy="13" r="1.5" fill="#fff" opacity="0.5" />
  </Svg>
);

const VIP_ROPE: SpriteFn = ({ size, color = '#EF4444' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Post left */}
    <Rect x="3" y="6" width="6" height="24" rx="2" fill="#D97706" />
    <Circle cx="6" cy="6" r="4" fill="#F59E0B" />
    {/* Post right */}
    <Rect x="23" y="6" width="6" height="24" rx="2" fill="#D97706" />
    <Circle cx="26" cy="6" r="4" fill="#F59E0B" />
    {/* Rope segments */}
    <Path d="M9,14 Q16,10 23,14" stroke={color} strokeWidth="3" fill="none" />
    <Path d="M9,20 Q16,16 23,20" stroke={color} strokeWidth="3" fill="none" />
  </Svg>
);

const SIGN: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Pole */}
    <Rect x="14" y="2" width="4" height="30" rx="1" fill={darken(color)} />
    {/* Sign board */}
    <Rect x="3" y="4" width="26" height="16" rx="3" fill={color} />
    <Rect x="4" y="5" width="24" height="12" rx="2" fill={lighten(color)} opacity="0.15" />
    {/* Text lines */}
    <Rect x="7" y="8" width="14" height="2" rx="1" fill="#fff" opacity="0.8" />
    <Rect x="7" y="12" width="10" height="2" rx="1" fill="#fff" opacity="0.5" />
    {/* Mounting holes */}
    <Circle cx="7" cy="12" r="1.5" fill={darken(color)} opacity="0.6" />
    <Circle cx="25" cy="12" r="1.5" fill={darken(color)} opacity="0.6" />
  </Svg>
);

const FRAME: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Outer frame */}
    <Rect x="2" y="2" width="28" height="26" rx="3" fill={color} />
    {/* Inner picture area */}
    <Rect x="6" y="6" width="20" height="18" rx="1" fill="#0A0A1A" />
    {/* Abstract city art */}
    <Rect x="7" y="14" width="3" height="9" fill={color} opacity="0.5" />
    <Rect x="11" y="11" width="3" height="12" fill={lighten(color)} opacity="0.5" />
    <Rect x="15" y="16" width="3" height="7" fill={color} opacity="0.4" />
    <Rect x="19" y="12" width="3" height="11" fill={lighten(color)} opacity="0.4" />
    <Circle cx="24" cy="9" r="2" fill="#FCD34D" opacity="0.6" />
    {/* Frame corners */}
    <Circle cx="4" cy="4" r="2" fill={lighten(color)} opacity="0.5" />
    <Circle cx="28" cy="4" r="2" fill={lighten(color)} opacity="0.5" />
    <Circle cx="4" cy="26" r="2" fill={lighten(color)} opacity="0.5" />
    <Circle cx="28" cy="26" r="2" fill={lighten(color)} opacity="0.5" />
  </Svg>
);

const CHART: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Background */}
    <Rect x="2" y="2" width="28" height="24" rx="3" fill={darken(color)} />
    <Rect x="3" y="3" width="26" height="20" fill="#0A0A1A" />
    {/* Grid lines */}
    <Rect x="3" y="9" width="26" height="0.5" fill={color} opacity="0.2" />
    <Rect x="3" y="15" width="26" height="0.5" fill={color} opacity="0.2" />
    {/* Bars */}
    <Rect x="5" y="14" width="5" height="9" rx="1" fill="#10B981" />
    <Rect x="12" y="8" width="5" height="15" rx="1" fill={color} />
    <Rect x="19" y="11" width="5" height="12" rx="1" fill={lighten(color)} />
    <Rect x="26" y="6" width="3" height="17" rx="1" fill="#F59E0B" />
    {/* X axis */}
    <Rect x="3" y="23" width="26" height="1" fill={color} opacity="0.4" />
    {/* Label */}
    <Rect x="5" y="27" width="22" height="2" rx="1" fill={color} opacity="0.25" />
  </Svg>
);

const FALLBACK: SpriteFn = ({ size, color = '#8B5CF6' }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32">
    {/* Box */}
    <Rect x="4" y="8" width="24" height="20" rx="2" fill={color} opacity="0.7" />
    {/* Top flap */}
    <Rect x="4" y="6" width="24" height="4" rx="2" fill={lighten(color)} opacity="0.6" />
    {/* Box corner lines */}
    <Line x1="16" y1="8" x2="16" y2="28" stroke={darken(color)} strokeWidth="1.5" />
    <Line x1="4" y1="14" x2="28" y2="14" stroke={darken(color)} strokeWidth="1.5" />
    {/* Tape strip */}
    <Rect x="13" y="6" width="6" height="8" rx="1" fill={darken(color)} opacity="0.4" />
    {/* Shine */}
    <Rect x="5" y="9" width="8" height="4" rx="1" fill="#fff" opacity="0.12" />
  </Svg>
);

// Hair sprite components (used in WorldAvatarChar)
export const HAIR_SPRITES = [
  null, // 0: no hair
  // 1: spiky bright (was ✨)
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 16 8">
      <Polygon points="2,8 4,2 6,8" fill="#FCD34D" />
      <Polygon points="6,8 8,1 10,8" fill="#FCD34D" />
      <Polygon points="10,8 12,2 14,8" fill="#FCD34D" />
    </Svg>
  ),
  // 2: flowing streaks (was 💫)
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 16 8">
      <Rect x="0" y="3" width="16" height="3" rx="1.5" fill="#A78BFA" opacity="0.8" />
      <Rect x="2" y="1" width="10" height="2" rx="1" fill="#8B5CF6" opacity="0.6" />
      <Circle cx="14" cy="4" r="2" fill="#FCD34D" opacity="0.9" />
    </Svg>
  ),
  // 3: top hat (was 🎩)
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 16 14">
      <Rect x="2" y="10" width="12" height="3" rx="1" fill="#1F1F2E" />
      <Rect x="4" y="2" width="8" height="9" rx="1" fill="#1F1F2E" />
      <Rect x="5" y="3" width="4" height="4" fill="#fff" opacity="0.08" />
    </Svg>
  ),
  // 4: wide brim hat (was 👒)
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 16 12">
      <Rect x="0" y="8" width="16" height="3" rx="1.5" fill="#D97706" />
      <Rect x="4" y="2" width="8" height="7" rx="2" fill="#F59E0B" />
      <Rect x="2" y="7" width="12" height="2" rx="1" fill="#B45309" opacity="0.5" />
    </Svg>
  ),
  // 5: star halo (was ⭐)
  ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 16 8">
      <Circle cx="8" cy="5" r="5" fill="none" stroke="#FCD34D" strokeWidth="1.5" />
      <Polygon points="8,1 9,4 12,4 10,6 11,9 8,7 5,9 6,6 4,4 7,4" fill="#FCD34D" opacity="0.8" />
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
