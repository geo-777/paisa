import { Fragment, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import type { DailyTotal } from '@/src/lib/calc';
import { colors } from '@/src/theme/tokens';

type Props = {
  values: DailyTotal[];
  todayKey: string;
};

const chartHeight = 140;
const plotTop = 8;
const plotBottom = 105;
const axisDays = new Set([1, 8, 15, 22]);

export function DashboardBarChart({ values, todayKey }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const maxValue = Math.max(...values.map((value) => value.total), 1);
  const slotWidth = width / Math.max(values.length, 1);
  const barWidth = Math.min(8, slotWidth * 0.58);
  const plotHeight = plotBottom - plotTop;

  return (
    <View onLayout={onLayout} style={styles.wrap} accessibilityLabel="Daily spending bar chart">
      {width > 0 && values.length > 0 ? (
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`}>
          <Line x1={0} y1={plotBottom} x2={width} y2={plotBottom} stroke={colors.border} strokeWidth={1} />
          {values.map((value, index) => {
            const day = index + 1;
            const isToday = value.date === todayKey;
            const isAboveUsual = value.aboveThreshold === true;
            const barHeight = value.total > 0 ? Math.max(2, value.total / maxValue * plotHeight) : 0;
            const x = index * slotWidth + (slotWidth - barWidth) / 2;
            const y = plotBottom - barHeight;
            const fill = isAboveUsual ? colors.up : isToday ? colors.text : colors.textFaint;
            return (
              <Fragment key={value.date}>
                {barHeight > 0 && (
                  <Rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(2, barWidth / 2)}
                    fill={fill}
                    stroke={isToday && isAboveUsual ? colors.text : 'none'}
                    strokeWidth={isToday && isAboveUsual ? 1 : 0}
                  />
                )}
                {(axisDays.has(day) || day === values.length) && (
                  <SvgText
                    x={index * slotWidth + slotWidth / 2}
                    y={chartHeight - 4}
                    fill={isToday ? colors.text : colors.textMuted}
                    fontSize={10}
                    fontFamily="Inter_500Medium"
                    textAnchor="middle"
                  >{day}</SvgText>
                )}
              </Fragment>
            );
          })}
        </Svg>
      ) : <View style={styles.placeholder} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: chartHeight },
  placeholder: { flex: 1 },
});
