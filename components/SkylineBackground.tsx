import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Polygon, Line, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

interface SkylineBackgroundProps {
  width: number;
  height: number;
}

export default function SkylineBackground({ width, height }: SkylineBackgroundProps) {
  const baseY = height * 0.75;
  const buildingColor = '#0d1525';
  const windowColor = 'rgba(59, 130, 246, 0.3)';
  const accentGlow = 'rgba(236, 72, 153, 0.15)';

  const buildings = [
    { x: 0, w: 28, h: 90 },
    { x: 26, w: 22, h: 130 },
    { x: 46, w: 32, h: 170 },
    { x: 76, w: 20, h: 110 },
    { x: 94, w: 36, h: 200 },
    { x: 128, w: 24, h: 150 },
    { x: 150, w: 30, h: 120 },
    { x: 178, w: 26, h: 185 },
    { x: 202, w: 34, h: 145 },
    { x: 234, w: 22, h: 210 },
    { x: 254, w: 28, h: 160 },
    { x: 280, w: 32, h: 130 },
    { x: 310, w: 20, h: 175 },
    { x: 328, w: 36, h: 140 },
    { x: 362, w: 24, h: 195 },
    { x: 384, w: 30, h: 115 },
    { x: 412, w: 28, h: 165 },
  ];

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#06060c" stopOpacity="1" />
            <Stop offset="0.4" stopColor="#0a1225" stopOpacity="1" />
            <Stop offset="0.7" stopColor="#0d1a35" stopOpacity="1" />
            <Stop offset="1" stopColor="#06060c" stopOpacity="1" />
          </SvgGradient>
          <SvgGradient id="buildGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#141c30" stopOpacity="1" />
            <Stop offset="1" stopColor="#08101e" stopOpacity="1" />
          </SvgGradient>
        </Defs>

        <Rect x="0" y="0" width={width} height={height} fill="url(#skyGrad)" />

        <Circle cx={width * 0.15} cy={height * 0.15} r="1" fill="rgba(255,255,255,0.5)" />
        <Circle cx={width * 0.35} cy={height * 0.08} r="0.8" fill="rgba(255,255,255,0.4)" />
        <Circle cx={width * 0.55} cy={height * 0.12} r="1.2" fill="rgba(255,255,255,0.3)" />
        <Circle cx={width * 0.75} cy={height * 0.06} r="0.7" fill="rgba(255,255,255,0.5)" />
        <Circle cx={width * 0.9} cy={height * 0.18} r="1" fill="rgba(255,255,255,0.35)" />
        <Circle cx={width * 0.25} cy={height * 0.22} r="0.6" fill="rgba(255,255,255,0.3)" />
        <Circle cx={width * 0.65} cy={height * 0.2} r="0.9" fill="rgba(255,255,255,0.4)" />

        <Circle cx={width * 0.5} cy={baseY - 180} r="60" fill="rgba(59, 130, 246, 0.03)" />
        <Circle cx={width * 0.3} cy={baseY - 100} r="40" fill={accentGlow} />

        {buildings.map((b, i) => {
          const bx = (b.x / 440) * width;
          const bw = (b.w / 440) * width;
          const bh = (b.h / 300) * (height * 0.45);
          const by = baseY - bh;

          return (
            <Rect
              key={`b-${i}`}
              x={bx}
              y={by}
              width={bw}
              height={bh + (height - baseY)}
              fill="url(#buildGrad)"
              stroke="rgba(59, 130, 246, 0.08)"
              strokeWidth="0.5"
            />
          );
        })}

        {buildings.map((b, i) => {
          const bx = (b.x / 440) * width;
          const bw = (b.w / 440) * width;
          const bh = (b.h / 300) * (height * 0.45);
          const by = baseY - bh;
          const windowRows = Math.floor(bh / 12);
          const windowCols = Math.max(1, Math.floor(bw / 10));
          const windows = [];

          for (let r = 1; r < windowRows; r++) {
            for (let c = 0; c < windowCols; c++) {
              const lit = Math.random() > 0.55;
              if (lit) {
                const wx = bx + 3 + c * ((bw - 6) / windowCols);
                const wy = by + 4 + r * 12;
                windows.push(
                  <Rect
                    key={`w-${i}-${r}-${c}`}
                    x={wx}
                    y={wy}
                    width={3}
                    height={4}
                    fill={Math.random() > 0.7 ? 'rgba(236, 72, 153, 0.25)' : windowColor}
                    rx={0.5}
                  />
                );
              }
            }
          }
          return windows;
        })}

        {[94, 234, 362].map((bx, i) => {
          const x = (bx / 440) * width;
          const matchingBuilding = buildings.find(b => b.x === bx);
          if (!matchingBuilding) return null;
          const bh = (matchingBuilding.h / 300) * (height * 0.45);
          const topY = baseY - bh;
          return (
            <Circle
              key={`ant-${i}`}
              cx={x + 10}
              cy={topY - 2}
              r="1.5"
              fill="#ef4444"
              opacity={0.8}
            />
          );
        })}

        <Line
          x1="0"
          y1={baseY + 2}
          x2={width}
          y2={baseY + 2}
          stroke="rgba(59, 130, 246, 0.1)"
          strokeWidth="1"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});
