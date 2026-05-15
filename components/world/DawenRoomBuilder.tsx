import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions, ActivityIndicator,
  Image,
} from 'react-native';
import Svg, { Polygon, Defs, ClipPath, G, Image as SvgImage } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, Eraser, DoorOpen, Grid3x3, Plus, Minus } from 'lucide-react-native';
import { RoomLayout, RoomDoor, WorldRoom, buildDefaultLayout } from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

// ─── PNG sprite catalogs ──────────────────────────────────────────────────────

const FLOOR_SPRITES = [
  {
    id: 'wood', label: 'Wood',
    leftSrc:  require('../../wood_stripe_floor_left.png'),
    rightSrc: require('../../wood_stripe_floor_right.png'),
  },
  {
    id: 'dark', label: 'Dark',
    leftSrc:  require('../../dark_floor_left.png'),
    rightSrc: require('../../dark_floor_right.png'),
  },
  {
    id: 'bright', label: 'Bright',
    leftSrc:  require('../../bright_wood_stripe_floor_left.png'),
    rightSrc: require('../../bright_wood_stripe_floor_left.png'),
  },
];

const WALL_SPRITES = [
  {
    id: 'grey', label: 'Grey',
    leftSrc:  require('../../grey_wall_left.png'),
    rightSrc: require('../../grey_wall_right.png'),
  },
  {
    id: 'grey_blue', label: 'Grey Blue',
    leftSrc:  require('../../grey_blue_stripe_wall_left.png'),
    rightSrc: require('../../grey_blue_stripe_wall_right.png'),
  },
  {
    id: 'dual', label: 'Dual',
    leftSrc:  require('../../dual_color_wall_left.png'),
    rightSrc: require('../../grey_wall_right.png'),
  },
  {
    id: 'white', label: 'White',
    leftSrc:  require('../../grey_wall_left.png'),
    rightSrc: require('../../white_stripe_wall_right.png'),
  },
];

const DOOR_SPRITES = [
  {
    id: 'wooden', label: 'Wooden',
    leftSrc:  require('../../wooden_door_entrance_left.png'),
    rightSrc: require('../../wooden_door_entrance_left.png'),
  },
  {
    id: 'black', label: 'Black',
    leftSrc:  require('../../black_door_entrance_left.png'),
    rightSrc: require('../../black_door_entrance_right.png'),
  },
  {
    id: 'blue', label: 'Blue',
    leftSrc:  require('../../blue_door_entrance_left.png'),
    rightSrc: require('../../blue_door_entrance_right.png'),
  },
  {
    id: 'sliding', label: 'Sliding',
    leftSrc:  require('../../double_sliding_door_closed_left.png'),
    rightSrc: require('../../double_sliding_door_closed_right.png'),
  },
];

type Tool = 'paint' | 'erase' | 'door';
type PickerTab = 'floor' | 'wall' | 'door';

const MIN_W = 4, MAX_W = 20, MIN_H = 4, MAX_H = 16;

interface Props {
  room: WorldRoom;
  onSave: (layout: RoomLayout) => Promise<void>;
  onCancel: () => void;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

function makeGeo(W: number, H: number, tileW: number) {
  const tileH  = Math.round(tileW / 2);
  const hw     = tileW / 2;
  const hh     = tileH / 2;
  const wallH  = Math.round(tileW * 0.9);
  const originX = H * hw + 4;
  const originY = wallH + 8;
  const canvasW = (W + H) * hw + 8;
  const canvasH = originY + (W + H) * hh + tileH + 8;

  function isoXY(col: number, row: number) {
    return {
      x: originX + (col - row) * hw,
      y: originY + (col + row) * hh,
    };
  }
  function tilePts(col: number, row: number): string {
    const { x, y } = isoXY(col, row);
    return `${x},${y} ${x + hw},${y + hh} ${x},${y + tileH} ${x - hw},${y + hh}`;
  }
  function leftWallPts(row: number): string {
    const { x, y } = isoXY(0, row);
    const lx = x - hw, ly = y + hh;
    return `${x},${y} ${lx},${ly} ${lx},${ly - wallH} ${x},${y - wallH}`;
  }
  function backWallPts(col: number): string {
    const { x, y } = isoXY(col, 0);
    const rx = x + hw, ry = y + hh;
    return `${x},${y} ${rx},${ry} ${rx},${ry - wallH} ${x},${y - wallH}`;
  }

  return { tileW, tileH, hw, hh, wallH, canvasW, canvasH, isoXY, tilePts, leftWallPts, backWallPts };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DawenRoomBuilder({ room, onSave, onCancel }: Props) {
  const { width: screenW } = useWindowDimensions();

  const initial = useMemo((): RoomLayout => {
    if (room.room_layout_data?.version === '1.0') return room.room_layout_data;
    const w = room.room_width  ?? 10;
    const h = room.room_height ?? 8;
    return buildDefaultLayout(w, h);
  }, [room]);

  const [tiles,      setTiles]      = useState<boolean[][]>(() => initial.tiles.map(c => [...c]));
  const [doors,      setDoors]      = useState<RoomDoor[]>([...initial.doors]);
  const [floorStyle, setFloorStyle] = useState(initial.floor_style ?? 'wood');
  const [wallStyle,  setWallStyle]  = useState(initial.wall_style  ?? 'grey');
  const [doorStyle,  setDoorStyle]  = useState('wooden');
  const [roomW,      setRoomW]      = useState(initial.width);
  const [roomH,      setRoomH]      = useState(initial.height);
  const [tool,       setTool]       = useState<Tool>('paint');
  const [pickerTab,  setPickerTab]  = useState<PickerTab>('floor');
  const [saving,     setSaving]     = useState(false);

  const floorDef = FLOOR_SPRITES.find(s => s.id === floorStyle) ?? FLOOR_SPRITES[0];
  const wallDef  = WALL_SPRITES.find(s => s.id === wallStyle)   ?? WALL_SPRITES[0];
  const doorDef  = DOOR_SPRITES.find(s => s.id === doorStyle)   ?? DOOR_SPRITES[0];

  const tileW = useMemo(() => {
    const avail = Math.min(screenW - 32, 580);
    return Math.max(24, Math.floor(avail / ((roomW + roomH) * 0.55)));
  }, [screenW, roomW, roomH]);

  const geo = useMemo(() => makeGeo(roomW, roomH, tileW), [roomW, roomH, tileW]);
  const { tileH, hw, hh, wallH, canvasW, canvasH, isoXY, tilePts, leftWallPts, backWallPts } = geo;

  const hasDoor = useCallback((col: number, row: number, wall: 'left' | 'back') =>
    doors.some(d => d.col === col && d.row === row && d.wall === wall),
  [doors]);

  const handleTileTap = useCallback((col: number, row: number) => {
    if (tool === 'door') {
      const wall: 'left' | 'back' | null = col === 0 ? 'left' : row === 0 ? 'back' : null;
      if (!wall) return;
      setDoors(prev => {
        const exists = prev.some(d => d.col === col && d.row === row && d.wall === wall);
        return exists
          ? prev.filter(d => !(d.col === col && d.row === row && d.wall === wall))
          : [...prev, { col, row, wall }];
      });
    } else {
      setTiles(prev => {
        const next = prev.map(c => [...c]);
        if (col < next.length && row < (next[col]?.length ?? 0)) {
          next[col][row] = tool === 'paint';
        }
        return next;
      });
    }
  }, [tool]);

  const resizeRoom = (newW: number, newH: number) => {
    newW = Math.max(MIN_W, Math.min(MAX_W, newW));
    newH = Math.max(MIN_H, Math.min(MAX_H, newH));
    if (newW === roomW && newH === roomH) return;
    setRoomW(newW);
    setRoomH(newH);
    setTiles(prev => {
      const next: boolean[][] = [];
      for (let c = 0; c < newW; c++) {
        const col: boolean[] = [];
        for (let r = 0; r < newH; r++) col.push(prev[c]?.[r] ?? true);
        next.push(col);
      }
      return next;
    });
    setDoors(prev => prev.filter(d => d.col < newW && d.row < newH));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        version: '1.0',
        width: roomW, height: roomH,
        floor_style: floorStyle, wall_style: wallStyle,
        tiles: tiles.map(c => [...c]),
        doors: [...doors],
        builder_used: 'sprite',
      });
    } finally {
      setSaving(false);
    }
  };

  const walkableCount = useMemo(
    () => tiles.reduce((s, col) => s + col.filter(Boolean).length, 0),
    [tiles],
  );

  // ── Build SVG elements ───────────────────────────────────────────────────────

  const clipPaths: React.ReactNode[] = [];
  const renderElems: React.ReactNode[] = [];

  // ClipPaths for every floor tile
  for (let c = 0; c < roomW; c++) {
    for (let r = 0; r < roomH; r++) {
      clipPaths.push(
        <ClipPath key={`cpf-${c}-${r}`} id={`cpf-${c}-${r}`}>
          <Polygon points={tilePts(c, r)} />
        </ClipPath>,
      );
    }
  }
  // ClipPaths for back wall panels
  for (let c = 0; c < roomW; c++) {
    clipPaths.push(
      <ClipPath key={`cpbw-${c}`} id={`cpbw-${c}`}>
        <Polygon points={backWallPts(c)} />
      </ClipPath>,
    );
  }
  // ClipPaths for left wall panels
  for (let r = 0; r < roomH; r++) {
    clipPaths.push(
      <ClipPath key={`cplw-${r}`} id={`cplw-${r}`}>
        <Polygon points={leftWallPts(r)} />
      </ClipPath>,
    );
  }

  // Back wall sprites (row = 0 edge)
  for (let c = 0; c < roomW; c++) {
    const { x, y } = isoXY(c, 0);
    const isDoorHere = hasDoor(c, 0, 'back');
    renderElems.push(
      <SvgImage
        key={`bw-${c}`}
        href={isDoorHere ? doorDef.rightSrc : wallDef.rightSrc}
        x={x}
        y={y - wallH}
        width={hw}
        height={wallH + hh}
        clipPath={`url(#cpbw-${c})`}
        preserveAspectRatio="none"
      />,
    );
  }

  // Left wall sprites (col = 0 edge)
  for (let r = 0; r < roomH; r++) {
    const { x, y } = isoXY(0, r);
    const lx = x - hw;
    const ly = y + hh;
    const isDoorHere = hasDoor(0, r, 'left');
    renderElems.push(
      <SvgImage
        key={`lw-${r}`}
        href={isDoorHere ? doorDef.leftSrc : wallDef.leftSrc}
        x={lx}
        y={ly - wallH}
        width={hw}
        height={wallH + hh}
        clipPath={`url(#cplw-${r})`}
        preserveAspectRatio="none"
      />,
    );
  }

  // Floor tiles — depth-sorted front to back
  for (let d = 0; d < roomW + roomH - 1; d++) {
    for (let c = 0; c < roomW; c++) {
      const r = d - c;
      if (r < 0 || r >= roomH) continue;
      const { x, y } = isoXY(c, r);
      const isFloor = tiles[c]?.[r] ?? false;

      if (isFloor) {
        renderElems.push(
          <SvgImage
            key={`ft-${c}-${r}`}
            href={floorDef.leftSrc}
            x={x - hw}
            y={y}
            width={tileW}
            height={tileH}
            clipPath={`url(#cpf-${c}-${r})`}
            preserveAspectRatio="none"
          />,
        );
      } else {
        renderElems.push(
          <Polygon
            key={`vd-${c}-${r}`}
            points={tilePts(c, r)}
            fill="#040210"
            stroke="#080318"
            strokeWidth={0.5}
          />,
        );
      }

      // Transparent touch target on top
      const isDoorEdge = tool === 'door' && (c === 0 || r === 0);
      const hasDoorOnEdge = isDoorEdge && hasDoor(c, r, c === 0 ? 'left' : 'back');
      renderElems.push(
        <Polygon
          key={`tt-${c}-${r}`}
          points={tilePts(c, r)}
          fill={
            isDoorEdge
              ? (hasDoorOnEdge ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.12)')
              : 'transparent'
          }
          stroke={isDoorEdge ? 'rgba(59,130,246,0.6)' : 'transparent'}
          strokeWidth={isDoorEdge ? 1 : 0}
          onPress={() => handleTileTap(c, r)}
        />,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0B0917', '#12082A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.iconBtn} disabled={saving}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle}>Room Builder</Text>
          <Text style={styles.headerSub}>{room.name} · {roomW}×{roomH} · {walkableCount} tiles</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Save size={14} color="#fff" strokeWidth={2.5} /><Text style={styles.saveBtnText}>Save Room</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        {([
          { id: 'paint', label: 'Paint', icon: Grid3x3 },
          { id: 'erase', label: 'Erase', icon: Eraser  },
          { id: 'door',  label: 'Door',  icon: DoorOpen },
        ] as const).map(({ id, label, icon: Icon }) => (
          <TouchableOpacity
            key={id}
            style={[styles.toolBtn, tool === id && styles.toolBtnActive]}
            onPress={() => setTool(id)}
          >
            <Icon size={15} color={tool === id ? '#fff' : 'rgba(255,255,255,0.4)'} strokeWidth={2} />
            <Text style={[styles.toolLabel, tool === id && styles.toolLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.toolSep} />

        {/* Width control */}
        <View style={styles.sizeCtrl}>
          <Text style={styles.sizeLabel}>W</Text>
          <TouchableOpacity style={styles.sizeBtn} onPress={() => resizeRoom(roomW - 1, roomH)}>
            <Minus size={10} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.sizeVal}>{roomW}</Text>
          <TouchableOpacity style={styles.sizeBtn} onPress={() => resizeRoom(roomW + 1, roomH)}>
            <Plus size={10} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Height control */}
        <View style={styles.sizeCtrl}>
          <Text style={styles.sizeLabel}>H</Text>
          <TouchableOpacity style={styles.sizeBtn} onPress={() => resizeRoom(roomW, roomH - 1)}>
            <Minus size={10} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.sizeVal}>{roomH}</Text>
          <TouchableOpacity style={styles.sizeBtn} onPress={() => resizeRoom(roomW, roomH + 1)}>
            <Plus size={10} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Hint */}
      <View style={styles.hintRow}>
        <Text style={styles.hintText}>
          {tool === 'paint' && 'Tap tiles to paint walkable floor'}
          {tool === 'erase' && 'Tap tiles to erase (make void / non-walkable)'}
          {tool === 'door'  && 'Tap edge tiles (left or back wall) to place or remove a door'}
        </Text>
      </View>

      {/* Isometric canvas */}
      <ScrollView
        style={styles.canvasScroll}
        contentContainerStyle={[styles.canvasWrap, { minWidth: canvasW, minHeight: canvasH }]}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <Svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}>
          <Defs>{clipPaths}</Defs>
          <G>{renderElems}</G>
        </Svg>
      </ScrollView>

      {/* Style picker */}
      <View style={styles.picker}>
        <View style={styles.pickerTabs}>
          {(['floor', 'wall', 'door'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.pickerTab, pickerTab === t && styles.pickerTabActive]}
              onPress={() => setPickerTab(t)}
            >
              <Text style={[styles.pickerTabText, pickerTab === t && styles.pickerTabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
          {pickerTab === 'floor' && FLOOR_SPRITES.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.swatch, floorStyle === s.id && styles.swatchActive]}
              onPress={() => setFloorStyle(s.id)}
            >
              <Image source={s.leftSrc} style={styles.swatchImg} resizeMode="cover" />
              <Text style={styles.swatchLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          {pickerTab === 'wall' && WALL_SPRITES.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.swatch, wallStyle === s.id && styles.swatchActive]}
              onPress={() => setWallStyle(s.id)}
            >
              <Image source={s.leftSrc} style={styles.swatchImg} resizeMode="cover" />
              <Text style={styles.swatchLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          {pickerTab === 'door' && DOOR_SPRITES.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.swatch, doorStyle === s.id && styles.swatchActive]}
              onPress={() => setDoorStyle(s.id)}
            >
              <Image source={s.leftSrc} style={styles.swatchImg} resizeMode="cover" />
              <Text style={styles.swatchLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0917' },

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
  headerSub:   { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginTop: 1 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  toolBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: colors.primary,
  },
  toolLabel:       { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  toolLabelActive: { color: '#fff' },
  toolSep: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 },

  sizeCtrl:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sizeLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', width: 12 },
  sizeBtn: {
    width: 20, height: 20, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  sizeVal: { fontSize: 11, fontWeight: '800', color: '#fff', minWidth: 18, textAlign: 'center' },

  hintRow: {
    paddingHorizontal: spacing.lg, paddingVertical: 4,
    backgroundColor: 'rgba(139,92,246,0.05)',
  },
  hintText: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '500' },

  canvasScroll: { flex: 1 },
  canvasWrap: {
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: spacing.md,
  },

  picker: {
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.15)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pickerTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  pickerTab: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  pickerTabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  pickerTabText: {
    fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pickerTabTextActive: { color: colors.primary },

  swatchRow: { flexDirection: 'row', gap: 8, padding: spacing.sm },
  swatch: {
    alignItems: 'center', gap: 4,
    borderRadius: 8, padding: 4,
    borderWidth: 1.5, borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  swatchActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  swatchImg:   { width: 56, height: 38, borderRadius: 5 },
  swatchLabel: {
    fontSize: 9, fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
});
