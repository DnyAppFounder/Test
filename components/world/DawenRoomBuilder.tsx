import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import Svg, { Polygon, Rect, G, Line, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, Eraser, DoorOpen, Grid3x3 } from 'lucide-react-native';
import { RoomLayout, RoomDoor, WorldRoom, buildDefaultLayout } from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

// ─── Floor / wall style palettes ──────────────────────────────────────────────

export const FLOOR_STYLES: { id: string; label: string; color: string; accent: string }[] = [
  { id: 'default', label: 'Default', color: '#3D2B5E', accent: '#4D3B6E' },
  { id: 'wood',    label: 'Wood',    color: '#6B4C1E', accent: '#7C5A2A' },
  { id: 'tile',    label: 'Tile',    color: '#2B4B6B', accent: '#3A5C7C' },
  { id: 'stone',   label: 'Stone',   color: '#4A4A4A', accent: '#5A5A5A' },
  { id: 'neon',    label: 'Neon',    color: '#1A0050', accent: '#2A0070' },
];

export const WALL_STYLES: { id: string; label: string; color: string }[] = [
  { id: 'default', label: 'Default', color: '#2D1B4E' },
  { id: 'dark',    label: 'Dark',    color: '#0D0A1A' },
  { id: 'light',   label: 'Light',   color: '#6B5B8B' },
  { id: 'neon',    label: 'Neon',    color: '#1A003A' },
];

type Tool = 'floor' | 'erase' | 'door';

interface Props {
  room: WorldRoom;
  onSave: (layout: RoomLayout) => Promise<void>;
  onCancel: () => void;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function makeGeo(w: number, h: number, tileW: number) {
  const tileH = Math.round(tileW / 2);
  const wallH = Math.round(tileW * 0.8);
  const originX = Math.round(h * tileW / 2);
  const originY = wallH + 4;
  const canvasW = (w + h) * Math.round(tileW / 2) + 4;
  const canvasH = wallH + (w + h) * Math.round(tileH / 2) + tileH + 16;

  function isoXY(col: number, row: number) {
    return {
      x: originX + (col - row) * (tileW / 2),
      y: originY + (col + row) * (tileH / 2),
    };
  }

  function tilePoly(col: number, row: number): string {
    const { x, y } = isoXY(col, row);
    const hw = tileW / 2, hh = tileH / 2;
    return `${x},${y} ${x + hw},${y + hh} ${x},${y + tileH} ${x - hw},${y + hh}`;
  }

  function leftWallPoly(row: number): string {
    const { x, y } = isoXY(0, row);
    const lx = x - tileW / 2, ly = y + tileH / 2;
    return `${x},${y} ${lx},${ly} ${lx},${ly - wallH} ${x},${y - wallH}`;
  }

  function backWallPoly(col: number): string {
    const { x, y } = isoXY(col, 0);
    const rx = x + tileW / 2, ry = y + tileH / 2;
    return `${x},${y} ${rx},${ry} ${rx},${ry - wallH} ${x},${y - wallH}`;
  }

  return { tileW, tileH, wallH, canvasW, canvasH, isoXY, tilePoly, leftWallPoly, backWallPoly };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DawenRoomBuilder({ room, onSave, onCancel }: Props) {
  const { width: screenW } = useWindowDimensions();

  // Initialise from saved layout or default
  const initial = useMemo((): RoomLayout => {
    if (room.room_layout_data?.version === '1.0') return room.room_layout_data;
    const w = room.room_width ?? 10;
    const h = room.room_height ?? 8;
    return buildDefaultLayout(w, h);
  }, [room]);

  const [tiles, setTiles] = useState<boolean[][]>(() =>
    initial.tiles.map(col => [...col])
  );
  const [doors, setDoors] = useState<RoomDoor[]>([...initial.doors]);
  const [floorStyle, setFloorStyle] = useState(initial.floor_style);
  const [wallStyle, setWallStyle] = useState(initial.wall_style);
  const [tool, setTool] = useState<Tool>('floor');
  const [saving, setSaving] = useState(false);

  const W = initial.width;
  const H = initial.height;

  // Responsive tile size: fit grid in screen width with padding
  const tileW = useMemo(() => {
    const available = Math.min(screenW - 32, 520);
    return Math.max(20, Math.floor(available / ((W + H) * 0.5)));
  }, [screenW, W, H]);

  const geo = useMemo(() => makeGeo(W, H, tileW), [W, H, tileW]);

  const floorPalette = FLOOR_STYLES.find(s => s.id === floorStyle) ?? FLOOR_STYLES[0];
  const wallPalette = WALL_STYLES.find(s => s.id === wallStyle) ?? WALL_STYLES[0];

  const isDoor = useCallback((col: number, row: number, wall: 'left' | 'back') =>
    doors.some(d => d.col === col && d.row === row && d.wall === wall),
  [doors]);

  const toggleTile = useCallback((col: number, row: number) => {
    setTiles(prev => {
      const next = prev.map(c => [...c]);
      if (tool === 'floor') next[col][row] = true;
      else if (tool === 'erase') next[col][row] = false;
      return next;
    });
  }, [tool]);

  const toggleDoor = useCallback((col: number, row: number, wall: 'left' | 'back') => {
    setDoors(prev => {
      const exists = prev.some(d => d.col === col && d.row === row && d.wall === wall);
      if (exists) return prev.filter(d => !(d.col === col && d.row === row && d.wall === wall));
      return [...prev, { col, row, wall }];
    });
  }, []);

  const handleTileTap = useCallback((col: number, row: number) => {
    if (tool === 'door') {
      // Door tool only acts on perimeter tiles
      if (col === 0) toggleDoor(col, row, 'left');
      else if (row === 0) toggleDoor(col, row, 'back');
    } else {
      toggleTile(col, row);
    }
  }, [tool, toggleDoor, toggleTile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const layout: RoomLayout = {
        version: '1.0',
        width: W,
        height: H,
        floor_style: floorStyle,
        wall_style: wallStyle,
        tiles: tiles.map(col => [...col]),
        doors: [...doors],
        builder_used: 'native',
      };
      await onSave(layout);
    } finally {
      setSaving(false);
    }
  };

  const walkableCount = useMemo(() =>
    tiles.reduce((s, col) => s + col.filter(Boolean).length, 0),
  [tiles]);

  // ── Render SVG grid ──────────────────────────────────────────────────────────
  const { tileH, wallH, canvasW, canvasH, isoXY, tilePoly, leftWallPoly, backWallPoly } = geo;

  const VOID_COLOR = '#0A0614';
  const VOID_DARK = '#060410';
  const LEFT_WALL_BASE = wallPalette.color;
  const BACK_WALL_BASE = adjustBrightness(wallPalette.color, 15);
  const DOOR_COLOR = '#8B5CF6';
  const DOOR_ACCENT = '#A78BFA';

  const gridElements: React.ReactNode[] = [];

  // Back wall (row=0) — rendered first so floor goes on top
  for (let col = 0; col < W; col++) {
    const isDoorHere = isDoor(col, 0, 'back');
    gridElements.push(
      <Polygon
        key={`bw-${col}`}
        points={backWallPoly(col)}
        fill={isDoorHere ? DOOR_COLOR : BACK_WALL_BASE}
        stroke={isDoorHere ? DOOR_ACCENT : adjustBrightness(BACK_WALL_BASE, 20)}
        strokeWidth={0.5}
      />
    );
  }

  // Left wall (col=0) — rendered early
  for (let row = 0; row < H; row++) {
    const isDoorHere = isDoor(0, row, 'left');
    gridElements.push(
      <Polygon
        key={`lw-${row}`}
        points={leftWallPoly(row)}
        fill={isDoorHere ? DOOR_COLOR : LEFT_WALL_BASE}
        stroke={isDoorHere ? DOOR_ACCENT : adjustBrightness(LEFT_WALL_BASE, 20)}
        strokeWidth={0.5}
      />
    );
  }

  // Floor tiles — depth sorted
  for (let d = 0; d < W + H - 1; d++) {
    for (let col = 0; col < W; col++) {
      const row = d - col;
      if (row < 0 || row >= H) continue;
      const isFloor = tiles[col]?.[row] ?? false;

      if (isFloor) {
        const isPerimeter = col === 0 || row === 0 || col === W - 1 || row === H - 1;
        gridElements.push(
          <Polygon
            key={`t-${col}-${row}`}
            points={tilePoly(col, row)}
            fill={floorPalette.color}
            stroke={floorPalette.accent}
            strokeWidth={0.5}
            onPress={() => handleTileTap(col, row)}
          />
        );
        // Subtle grid lines for orientation
        if (tool !== 'door') {
          const { x, y } = isoXY(col, row);
          gridElements.push(
            <Polygon
              key={`to-${col}-${row}`}
              points={`${x},${y} ${x + tileW / 2},${y + tileH / 2} ${x},${y + tileH} ${x - tileW / 2},${y + tileH / 2}`}
              fill="transparent"
              stroke={floorPalette.accent}
              strokeWidth={0.3}
              onPress={() => handleTileTap(col, row)}
            />
          );
        }
      } else {
        // Void tile — dark, still tappable
        gridElements.push(
          <Polygon
            key={`v-${col}-${row}`}
            points={tilePoly(col, row)}
            fill={VOID_COLOR}
            stroke={VOID_DARK}
            strokeWidth={0.5}
            onPress={() => handleTileTap(col, row)}
          />
        );
      }

      // Door-tool indicator: highlight edge tiles
      if (tool === 'door' && (col === 0 || row === 0)) {
        gridElements.push(
          <Polygon
            key={`dh-${col}-${row}`}
            points={tilePoly(col, row)}
            fill={isDoor(col, row, col === 0 ? 'left' : 'back') ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.15)'}
            stroke="#8B5CF6"
            strokeWidth={1}
            onPress={() => handleTileTap(col, row)}
          />
        );
      }
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.iconBtn} disabled={saving}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle}>Room Builder</Text>
          <Text style={styles.headerSub}>{room.name} · {W}×{H} · {walkableCount} tiles</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Save size={14} color="#fff" strokeWidth={2.5} /><Text style={styles.saveBtnText}>Save</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Tool selector */}
      <View style={styles.toolbar}>
        {([
          { id: 'floor', label: 'Paint Floor', icon: Grid3x3 },
          { id: 'erase', label: 'Erase Tile',  icon: Eraser  },
          { id: 'door',  label: 'Add Door',    icon: DoorOpen },
        ] as const).map(({ id, label, icon: Icon }) => (
          <TouchableOpacity
            key={id}
            style={[styles.toolBtn, tool === id && styles.toolBtnActive]}
            onPress={() => setTool(id)}
          >
            <Icon size={14} color={tool === id ? '#fff' : 'rgba(255,255,255,0.45)'} strokeWidth={2} />
            <Text style={[styles.toolLabel, tool === id && styles.toolLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Hint for active tool */}
      <View style={styles.hintRow}>
        <Text style={styles.hintText}>
          {tool === 'floor' && 'Tap tiles to paint walkable floor'}
          {tool === 'erase' && 'Tap tiles to erase (make void / non-walkable)'}
          {tool === 'door'  && 'Tap edge tiles (col=0 or row=0) to place / remove a door'}
        </Text>
      </View>

      {/* Grid canvas */}
      <ScrollView
        style={styles.canvasScroll}
        contentContainerStyle={[styles.canvasContent, { minWidth: canvasW, minHeight: canvasH }]}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEnabled
      >
        <Svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}>
          <G>{gridElements}</G>
        </Svg>
      </ScrollView>

      {/* Style pickers */}
      <View style={styles.pickerSection}>
        <Text style={styles.pickerLabel}>Floor Style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
          {FLOOR_STYLES.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.swatch, { backgroundColor: s.color }, floorStyle === s.id && styles.swatchActive]}
              onPress={() => setFloorStyle(s.id)}
            >
              <Text style={styles.swatchLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.pickerLabel, { marginTop: 8 }]}>Wall Style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
          {WALL_STYLES.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.swatch, { backgroundColor: s.color }, wallStyle === s.id && styles.swatchActive]}
              onPress={() => setWallStyle(s.id)}
            >
              <Text style={styles.swatchLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Colour helpers ────────────────────────────────────────────────────────────

function adjustBrightness(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0A1A' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerMid: { flex: 1 },
  headerTitle: { fontSize: fontSize.md, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginTop: 1 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  toolbar: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  toolBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'transparent',
  },
  toolBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: colors.primary,
  },
  toolLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
  toolLabelActive: { color: '#fff' },

  hintRow: {
    paddingHorizontal: spacing.lg, paddingVertical: 4,
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  hintText: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },

  canvasScroll: { flex: 1 },
  canvasContent: {
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: spacing.md,
  },

  pickerSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.15)',
    gap: 4,
  },
  pickerLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pickerRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  swatch: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1.5, borderColor: 'transparent',
    minWidth: 60, alignItems: 'center',
  },
  swatchActive: { borderColor: colors.primary },
  swatchLabel: { fontSize: 10, fontWeight: '700', color: '#fff' },
});
