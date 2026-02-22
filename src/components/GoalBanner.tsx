import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Target } from "lucide-react-native";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import * as Battery from "expo-battery";
import { useTheme } from "../lib/theme";
import { useGoalStore } from "../store/goals";
import {
  getWeather,
  getDustLevel,
  getDustLevel10,
  getDustColor,
  getDustColor10,
  WeatherData,
} from "../lib/weather";

export default function GoalBanner() {
  const { colors } = useTheme();
  const { pinnedGoals } = useGoalStore();
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [battery, setBattery] = useState<number | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    // 다음 분 경계까지 대기 후 매 분 정각에 갱신 (밀리초 단위 정확도)
    const now = new Date();
    const msToNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeout = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60000);
    }, msToNextMin);
    return () => {
      clearTimeout(timeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    getWeather().then(setWeather);
    const interval = setInterval(
      () => {
        getWeather().then(setWeather);
      },
      15 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const poll = () =>
      Battery.getBatteryLevelAsync()
        .then((level) => {
          if (level >= 0) setBattery(Math.round(level * 100));
        })
        .catch(() => {});
    poll();
    // 30초마다 폴링 (로컬 네이티브 호출, 비용 없음)
    const interval = setInterval(poll, 30000);
    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel >= 0) setBattery(Math.round(batteryLevel * 100));
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const hour = now.getHours();
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const minuteStr = String(now.getMinutes()).padStart(2, "0");
  // 시계: 12시간제, AM/PM 없음, 앞 0 없음 (1:29, 10:05)
  const clockStr = `${hour12}:${minuteStr}`;
  const dateStr = format(now, "M/d");
  const dayStr = format(now, "EEE", { locale: ko });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingTop: 4,
        },
      ]}
    >
      {/* 시계(좌) + 날짜/기온·날씨아이콘 2줄(flex:1) + 미세먼지(고정) + 배터리(고정) */}
      <View style={styles.mainRow}>
        {/* 시계 */}
        <Text style={[styles.clock, { color: colors.foreground }]}>
          {clockStr}
        </Text>
        {/* 날짜+기온 / 날씨아이콘 — 2줄 블록 */}
        <View style={styles.infoBlock}>
          <Text
            style={[styles.infoLine1, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {dateStr}({dayStr}){weather ? ` ${weather.temperature}°` : ""}
          </Text>
          {weather && (
            <Text
              style={[styles.infoLine2, { color: colors.foreground }]}
              numberOfLines={1}
            >
              오전{weather.morningIcon} 오후{weather.afternoonIcon}
            </Text>
          )}
        </View>
        {/* 미세먼지: 고정 */}
        {weather && (
          <View style={styles.dustRow}>
            <Text
              style={[styles.dustText, { color: getDustColor10(weather.pm10) }]}
            >
              미세{weather.pm10}
              {getDustLevel10(weather.pm10)}
            </Text>
            <Text
              style={[
                styles.dustText,
                { color: getDustColor(weather.pm25), marginLeft: 3 },
              ]}
            >
              초미세{weather.pm25}
              {getDustLevel(weather.pm25)}
            </Text>
          </View>
        )}
        {/* 배터리: 아이콘 (작게) */}
        {battery !== null && (
          <View style={styles.batteryWrap}>
            <View
              style={[
                styles.batteryBody,
                {
                  borderColor:
                    battery <= 20
                      ? "#ef4444"
                      : battery <= 50
                        ? "#f97316"
                        : colors.mutedForeground,
                },
              ]}
            >
              <View
                style={[
                  styles.batteryFill,
                  {
                    width: `${battery}%`,
                    backgroundColor:
                      battery <= 20
                        ? "#ef4444"
                        : battery <= 50
                          ? "#f97316"
                          : "#22c55e",
                  },
                ]}
              />
              <Text style={styles.batteryLabel}>{battery}%</Text>
            </View>
            <View
              style={[
                styles.batteryNub,
                {
                  backgroundColor:
                    battery <= 20
                      ? "#ef4444"
                      : battery <= 50
                        ? "#f97316"
                        : colors.mutedForeground,
                },
              ]}
            />
          </View>
        )}
      </View>
      {weather && weather.alerts.length > 0 && (
        <Text style={styles.alertText}>{weather.alerts.join(" ")}</Text>
      )}

      {/* 출처 + 측정소명 */}
      {weather && (
        <Text style={[styles.sourceText, { color: colors.mutedForeground }]}>
          {weather.stationName ? `${weather.stationName} · ` : ""}
          {weather.dustSource}
        </Text>
      )}

      {/* 고정 목표 - 한 줄에 2개 */}
      {pinnedGoals.length > 0 ? (
        <View style={styles.goalsGrid}>
          {pinnedGoals.map((goal) => (
            <View
              key={goal.id}
              style={[
                styles.goalCell,
                { backgroundColor: (goal.color || colors.primary) + "10" },
              ]}
            >
              <View
                style={[
                  styles.goalDot,
                  { backgroundColor: goal.color || colors.primary },
                ]}
              />
              <Text
                style={[styles.goalText, { color: colors.foreground }]}
                numberOfLines={1}
              >
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
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  clock: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1,
  },
  infoBlock: {
    flex: 1,
    marginLeft: 6,
    justifyContent: "center",
  },
  infoLine1: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 17,
  },
  infoLine2: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
  },
  dustRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 5,
  },
  dustText: {
    fontSize: 13,
    fontWeight: "700",
  },
  batteryWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 5,
  },
  batteryBody: {
    width: 28,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  batteryFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  batteryLabel: {
    fontSize: 6.5,
    fontWeight: "800",
    color: "#fff",
    zIndex: 1,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  batteryNub: {
    width: 2,
    height: 6,
    borderRadius: 1,
    marginLeft: 1.5,
  },
  alertText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ef4444",
  },
  sourceText: {
    fontSize: 7,
    opacity: 0.4,
    textAlign: "right",
    marginBottom: 2,
  },
  goalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  goalCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    width: "48.5%",
  },
  goalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  goalText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
  },
});
