import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { formatCents, type PricePoint } from '@pokedex/shared';

import { colors, spacing } from '../theme';

export interface PriceChartProps {
  points: readonly PricePoint[];
  height?: number;
  width?: number;
}

/**
 * Price history sparkline. Hand-rolled on react-native-svg rather than pulled
 * from a chart library: this is one series with no axes or interaction, and a
 * charting dependency that has to work identically on iOS, Android and web is
 * a lot of surface area for a polyline.
 */
export function PriceChart({ points, height = 160, width = 320 }: PriceChartProps) {
  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Not enough history yet</Text>
      </View>
    );
  }

  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const values = sorted.map((point) => point.marketCents);

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A perfectly flat series would divide by zero; render it as a mid-line.
  const range = max - min || Math.max(1, max * 0.1);

  const padding = { top: 8, bottom: 8, left: 0, right: 0 };
  const plotHeight = height - padding.top - padding.bottom;

  const toX = (index: number) => (index / (sorted.length - 1)) * width;
  const toY = (value: number) => padding.top + plotHeight - ((value - min) / range) * plotHeight;

  const line = sorted
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(index).toFixed(2)},${toY(point.marketCents).toFixed(2)}`)
    .join(' ');

  const area = `${line} L${width},${height - padding.bottom} L0,${height - padding.bottom} Z`;

  const first = values[0]!;
  const last = values[values.length - 1]!;
  const stroke = last >= first ? colors.up : colors.down;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity="0.28" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#priceFill)" />
        <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
      </Svg>

      <View style={styles.bounds}>
        <Text style={styles.boundText}>low {formatCents(min)}</Text>
        <Text style={styles.boundText}>high {formatCents(max)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textFaint, fontSize: 13 },
  bounds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  boundText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
});
