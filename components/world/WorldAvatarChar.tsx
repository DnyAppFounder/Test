import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import Svg, {
  Rect as SvgRect, Text as SvgText, Circle as SvgCircle,
  Ellipse as SvgEllipse, Path as SvgPath,
} from 'react-native-svg';
import { Crown } from 'lucide-react-native';
import { AvatarConfig } from '@/services/worldService';
import { HAIR_SPRITES } from './WorldSprite';

export type AvatarGesture = 'none' | 'wave' | 'dance';

export interface AvatarCharProps {
  config: AvatarConfig;
  username: string;
  isPremium: boolean;
  size?: number;
  sitting?: boolean;
  walking?: boolean;
  gesture?: AvatarGesture;
}

export function WorldAvatarChar({
  config, username, isPremium, size = 48,
  sitting = false, walking = false, gesture = 'none',
}: AvatarCharProps) {
  const walkAnim  = useRef(new Animated.Value(0)).current;
  const waveAnim  = useRef(new Animated.Value(0)).current;
  const danceAnim = useRef(new Animated.Value(0)).current;
  const walkLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const danceLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (walking && !sitting && gesture === 'none') {
      walkLoopRef.current = Animated.loop(Animated.sequence([
        Animated.timing(walkAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(walkAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]));
      walkLoopRef.current.start();
    } else {
      walkLoopRef.current?.stop();
      walkLoopRef.current = null;
      walkAnim.setValue(0);
    }
    return () => { walkLoopRef.current?.stop(); };
  }, [walking, sitting, gesture]);

  useEffect(() => {
    if (gesture === 'wave') {
      waveLoopRef.current = Animated.loop(Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(waveAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]));
      waveLoopRef.current.start();
    } else {
      waveLoopRef.current?.stop();
      waveLoopRef.current = null;
      waveAnim.setValue(0);
    }
    return () => { waveLoopRef.current?.stop(); };
  }, [gesture]);

  useEffect(() => {
    if (gesture === 'dance') {
      danceLoopRef.current = Animated.loop(Animated.sequence([
        Animated.timing(danceAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(danceAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]));
      danceLoopRef.current.start();
    } else {
      danceLoopRef.current?.stop();
      danceLoopRef.current = null;
      danceAnim.setValue(0);
    }
    return () => { danceLoopRef.current?.stop(); };
  }, [gesture]);

  const sc = Math.max(0.5, size / 56);
  const s = (n: number) => Math.max(1, Math.round(n * sc));

  // Habbo CDN avatar: render image if figureCode is set
  if (config.figureCode) {
    const habboUrl = `https://www.habbo.com/habbo-imaging/avatarimage?figure=${config.figureCode}&direction=4&head_direction=4&size=s&gender=${config.gender ?? 'M'}`;
    const imgSize = Math.max(72, size);
    return (
      <View style={[styles.habboRoot, { width: imgSize, alignItems: 'center' }]}>
        {isPremium && (
          <View style={styles.crownWrap}><Crown size={s(10)} color="#F59E0B" fill="#F59E0B" strokeWidth={0} /></View>
        )}
        <Image
          source={{ uri: habboUrl }}
          style={{ width: imgSize, height: Math.round(imgSize * 1.4) }}
          resizeMode="contain"
        />
        <View style={styles.nameTag}>
          <Text style={[styles.nameText, { fontSize: Math.max(7, s(8)) }]} numberOfLines={1}>{username}</Text>
        </View>
      </View>
    );
  }

  const skinColor   = config.bodyColor ?? '#F4C08A';
  const outfitColor = config.outfitColor ?? '#3B82F6';
  const hairIdx     = config.hairStyle ?? 0;
  const HairSprite  = HAIR_SPRITES[hairIdx] ?? null;
  const hairSize    = s(18);

  const leg1Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(4)] });
  const leg2Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [-s(4), 0] });
  const arm1Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, s(2)] });
  const arm2Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [s(2), 0] });

  const waveArmRot = waveAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-70deg'] });
  const waveArmTY  = waveAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(8)] });

  const danceBodyY = danceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(5)] });
  const danceArm1R = danceAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '40deg'] });
  const danceArm2R = danceAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-40deg'] });

  const leftArmTransform  = gesture === 'dance' ? [{ rotate: danceArm1R }] : [{ translateY: arm1Y }];
  const rightArmTransform = gesture === 'wave'
    ? [{ rotate: waveArmRot }, { translateY: waveArmTY }]
    : gesture === 'dance' ? [{ rotate: danceArm2R }] : [{ translateY: arm2Y }];

  return (
    <Animated.View style={[styles.root, gesture === 'dance' && { transform: [{ translateY: danceBodyY }] }]}>
      {config.auraColor ? (
        <View style={[styles.aura, {
          width: s(30), height: s(50), borderColor: config.auraColor, shadowColor: config.auraColor,
        }]} />
      ) : null}

      {isPremium ? (
        <View style={styles.crownWrap}><Crown size={s(10)} color="#F59E0B" fill="#F59E0B" strokeWidth={0} /></View>
      ) : null}

      {HairSprite ? (
        <View style={{ height: hairSize, marginBottom: -s(2) }}>
          <HairSprite size={hairSize} />
        </View>
      ) : (
        <Svg width={s(26)} height={s(14)} viewBox="0 0 26 14" style={{ marginBottom: -s(2) }}>
          <SvgEllipse cx={13} cy={7} rx={11} ry={6.5} fill={outfitColor} />
          <SvgEllipse cx={10} cy={4.5} rx={4.5} ry={2.5} fill="rgba(255,255,255,0.18)" />
          <SvgRect x={1} y={10} width={24} height={4} rx={2} fill={outfitColor} opacity={0.85} />
          <SvgRect x={1} y={12} width={24} height={2} rx={1} fill="rgba(0,0,0,0.2)" />
          <SvgCircle cx={13} cy={7} r={3.5} fill="rgba(0,0,0,0.2)" />
          <SvgText x={13} y={9} fill="rgba(255,255,255,0.9)" fontSize={5.5} fontWeight="900" textAnchor="middle">D</SvgText>
        </Svg>
      )}

      <Svg width={s(24)} height={s(23)} viewBox="0 0 24 23">
        <SvgEllipse cx={1.8} cy={12} rx={2.2} ry={3} fill={skinColor} />
        <SvgEllipse cx={2} cy={12} rx={1.2} ry={2} fill="rgba(0,0,0,0.08)" />
        <SvgEllipse cx={22.2} cy={12} rx={2.2} ry={3} fill={skinColor} />
        <SvgEllipse cx={22} cy={12} rx={1.2} ry={2} fill="rgba(0,0,0,0.08)" />
        <SvgEllipse cx={12} cy={11.5} rx={9.8} ry={9.5} fill={skinColor} />
        <SvgEllipse cx={10} cy={6} rx={4.5} ry={2.5} fill="rgba(255,255,255,0.12)" />
        <SvgPath d="M5,8 Q7.5,6.2 9.5,7.5" stroke="rgba(0,0,0,0.5)" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <SvgPath d="M14.5,7.5 Q16.5,6.2 19,8" stroke="rgba(0,0,0,0.5)" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <SvgEllipse cx={8} cy={11.5} rx={3.2} ry={2.8} fill="white" />
        <SvgEllipse cx={16} cy={11.5} rx={3.2} ry={2.8} fill="white" />
        <SvgEllipse cx={8.4} cy={11.5} rx={1.8} ry={2} fill={outfitColor} />
        <SvgEllipse cx={16.4} cy={11.5} rx={1.8} ry={2} fill={outfitColor} />
        <SvgEllipse cx={8.6} cy={11.4} rx={1} ry={1.1} fill="#0A0A0A" />
        <SvgEllipse cx={16.6} cy={11.4} rx={1} ry={1.1} fill="#0A0A0A" />
        <SvgEllipse cx={9.1} cy={10.8} rx={0.5} ry={0.5} fill="white" />
        <SvgEllipse cx={17.1} cy={10.8} rx={0.5} ry={0.5} fill="white" />
        <SvgPath d="M11,14.5 Q12,16 13,14.5" stroke="rgba(0,0,0,0.25)" strokeWidth={1.1} fill="none" strokeLinecap="round" />
        <SvgEllipse cx={10.5} cy={15.5} rx={0.8} ry={0.5} fill="rgba(0,0,0,0.15)" />
        <SvgEllipse cx={13.5} cy={15.5} rx={0.8} ry={0.5} fill="rgba(0,0,0,0.15)" />
        <SvgPath d="M8,18 Q12,21 16,18" stroke="rgba(0,0,0,0.45)" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <SvgEllipse cx={5} cy={15} rx={3} ry={2} fill="rgba(255,150,130,0.22)" />
        <SvgEllipse cx={19} cy={15} rx={3} ry={2} fill="rgba(255,150,130,0.22)" />
      </Svg>

      <Svg width={s(10)} height={s(5)} viewBox="0 0 10 5" style={{ marginTop: -s(1) }}>
        <SvgRect x={1} y={0} width={8} height={5} rx={2} fill={skinColor} />
      </Svg>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: -s(1) }}>
        {sitting ? (
          <Svg width={s(7)} height={s(10)} viewBox="0 0 7 10"
            style={{ transform: [{ rotate: '50deg' }, { translateX: s(2) }] as any, marginTop: s(1) }}>
            <SvgRect x={0.5} y={0} width={6} height={7.5} rx={3} fill={outfitColor} />
            <SvgRect x={0.5} y={6} width={6} height={2} rx={1} fill="rgba(255,255,255,0.15)" />
            <SvgEllipse cx={3.5} cy={9.5} rx={3} ry={2} fill={skinColor} />
          </Svg>
        ) : (
          <Animated.View style={{ marginTop: s(1), transform: leftArmTransform as any }}>
            <Svg width={s(7)} height={s(16)} viewBox="0 0 7 16">
              <SvgRect x={0.5} y={0} width={6} height={12} rx={3} fill={outfitColor} />
              <SvgRect x={0.5} y={10} width={6} height={2} rx={1} fill="rgba(255,255,255,0.15)" />
              <SvgEllipse cx={3.5} cy={14.5} rx={3} ry={2.5} fill={skinColor} />
            </Svg>
          </Animated.View>
        )}

        <Svg width={s(16)} height={sitting ? s(12) : s(15)} viewBox={`0 0 16 ${sitting ? 12 : 15}`}>
          <SvgRect x={0} y={0} width={16} height={sitting ? 12 : 15} rx={2} fill={outfitColor} />
          <SvgPath d={`M10,0 L16,0 L16,${sitting ? 12 : 15} L10,${sitting ? 12 : 15} Z`} fill="rgba(0,0,0,0.1)" />
          <SvgPath d="M8,0 L4,4 L7,10 L8,6 Z" fill="rgba(255,255,255,0.14)" />
          <SvgPath d="M8,0 L12,4 L9,10 L8,6 Z" fill="rgba(0,0,0,0.14)" />
          <SvgPath d="M5,0 L8,5 L11,0" stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} fill="none" />
          <SvgPath d="M6.5,0 L8,3 L9.5,0" fill="rgba(255,255,255,0.3)" />
          <SvgRect x={2} y={6} width={4.5} height={3.5} rx={1} fill="rgba(0,0,0,0.18)" />
          <SvgRect x={2.5} y={5.5} width={3.5} height={0.8} rx={0.4} fill="rgba(255,255,255,0.15)" />
          <SvgCircle cx={8} cy={7} r={0.8} fill="rgba(255,255,255,0.5)" />
          <SvgCircle cx={8} cy={9.5} r={0.8} fill="rgba(255,255,255,0.5)" />
          {sitting ? null : <SvgCircle cx={8} cy={12} r={0.8} fill="rgba(255,255,255,0.5)" />}
          <SvgText x={8} y={4.2} fill="rgba(255,255,255,0.7)" fontSize={2.4} fontWeight="900" textAnchor="middle">DAWEN</SvgText>
          <SvgRect x={0} y={sitting ? 10 : 13} width={16} height={2} rx={0} fill="rgba(0,0,0,0.32)" />
          <SvgRect x={6} y={sitting ? 10 : 13} width={4} height={2} rx={0.8} fill="rgba(200,180,60,0.7)" />
          <SvgRect x={7.2} y={sitting ? 10.3 : 13.3} width={1.6} height={1.4} rx={0.5} fill="rgba(0,0,0,0.4)" />
        </Svg>

        {sitting ? (
          <Svg width={s(7)} height={s(10)} viewBox="0 0 7 10"
            style={{ transform: [{ rotate: '-50deg' }, { translateX: -s(2) }] as any, marginTop: s(1) }}>
            <SvgRect x={0.5} y={0} width={6} height={7.5} rx={3} fill={outfitColor} />
            <SvgRect x={0.5} y={6} width={6} height={2} rx={1} fill="rgba(0,0,0,0.12)" />
            <SvgEllipse cx={3.5} cy={9.5} rx={3} ry={2} fill={skinColor} />
          </Svg>
        ) : (
          <Animated.View style={{ marginTop: s(1), transform: rightArmTransform as any }}>
            <Svg width={s(7)} height={s(16)} viewBox="0 0 7 16">
              <SvgRect x={0.5} y={0} width={6} height={12} rx={3} fill={outfitColor} />
              <SvgRect x={0.5} y={10} width={6} height={2} rx={1} fill="rgba(0,0,0,0.12)" />
              <SvgEllipse cx={3.5} cy={14.5} rx={3} ry={2.5} fill={skinColor} />
            </Svg>
          </Animated.View>
        )}
      </View>

      {sitting ? (
        <Svg width={s(18)} height={s(9)} viewBox="0 0 18 9" style={{ marginTop: s(1) }}>
          <SvgRect x={0} y={0} width={8} height={7} rx={3} fill="#1C1F3A" />
          <SvgRect x={0} y={5} width={10} height={4} rx={2} fill="#1A1A22" />
          <SvgRect x={10} y={0} width={8} height={7} rx={3} fill="#1C1F3A" />
          <SvgRect x={9} y={5} width={10} height={4} rx={2} fill="#1A1A22" />
        </Svg>
      ) : (
        <View style={{ flexDirection: 'row', gap: s(2), marginTop: s(1) }}>
          <Animated.View style={{ transform: [{ translateY: leg1Y }] }}>
            <Svg width={s(9)} height={s(16)} viewBox="0 0 9 16">
              <SvgRect x={0} y={0} width={9} height={10} rx={3} fill="#1C1F3A" />
              <SvgEllipse cx={4.5} cy={6} rx={3} ry={1.5} fill="rgba(255,255,255,0.06)" />
              <SvgRect x={1} y={9.5} width={7} height={2} rx={1} fill="#252545" />
              <SvgRect x={-1} y={11.5} width={11} height={4.5} rx={2.5} fill="#1A1A22" />
              <SvgEllipse cx={9} cy={14.5} rx={2} ry={2} fill="#1A1A22" />
              <SvgRect x={-1} y={14.5} width={12} height={1.5} rx={0.75} fill="#303038" />
            </Svg>
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: leg2Y }] }}>
            <Svg width={s(9)} height={s(16)} viewBox="0 0 9 16">
              <SvgRect x={0} y={0} width={9} height={10} rx={3} fill="#1C1F3A" />
              <SvgEllipse cx={4.5} cy={6} rx={3} ry={1.5} fill="rgba(255,255,255,0.06)" />
              <SvgRect x={1} y={9.5} width={7} height={2} rx={1} fill="#252545" />
              <SvgRect x={-1} y={11.5} width={11} height={4.5} rx={2.5} fill="#1A1A22" />
              <SvgEllipse cx={9} cy={14.5} rx={2} ry={2} fill="#1A1A22" />
              <SvgRect x={-1} y={14.5} width={12} height={1.5} rx={0.75} fill="#303038" />
            </Svg>
          </Animated.View>
        </View>
      )}

      <View style={styles.nameTag}>
        <Text style={styles.nameText} numberOfLines={1}>{username || '???'}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  habboRoot: { alignItems: 'center', position: 'relative' },
  root: { alignItems: 'center' },
  aura: {
    position: 'absolute', top: 0, borderWidth: 1.5, opacity: 0.7,
    borderRadius: 20, shadowRadius: 8, shadowOpacity: 0.7, elevation: 4,
  },
  crownWrap: { position: 'absolute', top: -6, right: -2, zIndex: 10 },
  nameTag: {
    backgroundColor: 'rgba(0,0,0,0.78)', paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4, maxWidth: 64, marginTop: 3,
  },
  nameText: { fontSize: 9, color: '#fff', fontWeight: '700', textAlign: 'center' },
});
