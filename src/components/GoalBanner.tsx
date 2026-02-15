import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar as RNStatusBar, Platform } from 'react-native';
import { Target } from 'lucide-react-native';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTheme } from '../lib/theme';
import { useGoalStore } from '../store/goals';
import { getWeather, getDustLevel, getDustLevel10, getDustColor, getDustColor10, WeatherData } from '../lib/weather';

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0;

export default function GoalBanner() {
  const { colors } = useTheme();
  const { pinnedGoals } = useGoalStore();
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getWeather().then(setWeather);
    const interval = setInterval(() => { getWeather().then(setWeather); }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const hour = now.getHours();
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minuteStr = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hour12}:${minuteStr}`;
  const dateStr = format(now, 'M/d');
  const dayStr = format(now, 'EEE', { locale: ko });

  // 날씨 텍스트: "☀4°" 또는 "🌧비4°"
  const weatherText = weather
    ? `${weather.weatherIcon}${weather.weatherDesc || ''}${weather.temperature}°`
    : '';

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border, marginTop: -STATUS_BAR_HEIGHT, paddingTop: STATUS_BAR_HEIGHT + 4 }]}>
      {/* 시간+날짜+날씨+미세먼지 전부 한 줄, 시계 크기 */}
      <Text
        style={[styles.mainLine, { color: colors.foreground }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {timeStr} {dateStr}{dayStr} {weatherText}
        {weather && (
          <>
            {' '}<Text style={{ color: getDustColor10(weather.pm10) }}>미세{weather.pm10}{getDustLevel10(weather.pm10)}</Text>
            {' '}<Text style={{ color: getDustColor(weather.pm25) }}>초미세{weather.pm25}{getDustLevel(weather.pm25)}</Text>
          </>
        )}
      </Text>
      {weather && weather.alerts.length > 0 && (
        <Text style={styles.alertText}>{weather.alerts.join(' ')}</Text>
      )}

      {/* 출처 */}
      {weather && (
        <Text style={[styles.sourceText, { color: colors.mutedForeground }]}>
          {weather.dustSource}
        </Text>
      )}

      {/* 고정 목표 - 한 줄에 2개 */}
      {pinnedGoals.length > 0 ? (
        <View style={styles.goalsGrid}>
          {pinnedGoals.map((goal) => (
            <View key={goal.id} style={[styles.goalCell, { backgroundColor: (goal.color || colors.primary) + '10' }]}>
              <View style={[styles.goalDot, { backgroundColor: goal.color || colors.primary }]} />
              <Text style={[styles.goalText, { color: colors.foreground }]} numberOfLines={1}>
                {goal.title}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyRow}>
          <Target size={14} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            목표를 고정해보세요
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
  },
  mainLine: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 2,
  },
  alertText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ef4444',
  },
  sourceText: {
    fontSize: 7,
    opacity: 0.4,
    textAlign: 'right',
    marginBottom: 2,
  },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  goalCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    width: '48.5%',
  },
  goalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  goalText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
  },
});
