import React from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { Target } from "lucide-react-native";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";
import { useGoalStore } from "../store/goals";
import { useBannerStore } from "../store/banner";
import { useMinuteClock } from "../lib/minuteClock";
import {
  getDustLevel,
  getDustLevel10,
  getDustColor,
  getDustColor10,
} from "../lib/weather";

export default function GoalBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { pinnedGoals } = useGoalStore();
  const weather = useBannerStore((s) => s.weather);
  const battery = useBannerStore((s) => s.battery);
  // 시계는 분까지만 보여준다 → 초당 갱신은 필요 없다. 앱 전체가 공유하는 타이머 하나가
  // '분이 바뀔 때만' 깨어난다(백그라운드에선 멈춤). 예전엔 화면마다 1초 타이머가 따로 돌아
  // 탭을 여러 개 열면 그만큼 겹쳐 돌았다 — 배터리만 먹고 화면은 똑같았다.
  const now = useMinuteClock();

  // 화면 폭 기준 스케일 — 헤더가 고정 px 였어서 작은 폰에선 글씨가 상대적으로 커
  // 내용이 잘리거나 축약됐다. S25(≈393dp)를 기준(1.0)으로 좁을수록 줄인다(하한 0.82).
  // 큰 폰은 1.0 고정(과대 확대 방지). rem 처럼 폰트·핵심 치수에 곱한다.
  const { width } = useWindowDimensions();
  const s = Math.min(1, Math.max(0.82, width / 393));
  const fs = (n: number) => Math.round(n * s);

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
          // 안드로이드는 상태바를 숨겨 헤더가 화면 맨 위(가운데 펀치홀 카메라 자리)까지
          // 올라간다. 디스플레이 컷아웃 높이(insets.top)만큼 위 여백을 줘 내용이 카메라
          // 아래로 내려오게 한다(2026-07-15: 작은 폰에서 헤더가 펀치홀에 잘림). 컷아웃이
          // 없거나 이미 안전하면 insets.top≈0 이라 큰 폰(S25 Ultra) 레이아웃은 그대로.
          paddingTop: insets.top + 4,
        },
      ]}
    >
      {/* 시계(좌) + 날짜/기온·날씨아이콘 2줄(flex:1) + 우측 2줄 블록(미세먼지·배터리/출처) */}
      <View style={styles.mainRow}>
        {/* 시계 */}
        <Text
          style={[styles.clock, { color: colors.foreground, fontSize: fs(32) }]}
          allowFontScaling={false}
        >
          {clockStr}
        </Text>
        {/* 날짜+기온 / 날씨아이콘 — 2줄 블록 */}
        <View style={styles.infoBlock}>
          <Text
            style={[styles.infoLine1, { color: colors.foreground, fontSize: fs(14) }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {dateStr}({dayStr}){weather ? ` ${weather.temperature}°` : ""}
          </Text>
          {weather && (
            <Text
              style={[styles.infoLine2, { color: colors.foreground, fontSize: fs(13) }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              오전{weather.morningIcon} 오후{weather.afternoonIcon}
            </Text>
          )}
        </View>
        {/* 우측 2줄 블록: 윗줄 미세먼지+배터리 / 아랫줄 출처 —
            출처가 전용 행을 차지하지 않게 메인 행 안으로(왼쪽 여백 낭비 제거) */}
        <View style={styles.rightBlock}>
          <View style={styles.rightTopRow}>
            {weather && (
              <View style={styles.dustRow}>
                <Text
                  style={[
                    styles.dustText,
                    { color: getDustColor10(weather.pm10), fontSize: fs(13) },
                  ]}
                  allowFontScaling={false}
                >
                  미세{weather.pm10}
                  {getDustLevel10(weather.pm10)}
                </Text>
                <Text
                  style={[
                    styles.dustText,
                    { color: getDustColor(weather.pm25), marginLeft: 3, fontSize: fs(13) },
                  ]}
                  allowFontScaling={false}
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
                  <Text style={styles.batteryLabel} allowFontScaling={false}>
                    {battery}%
                  </Text>
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
          {/* 현재 위치 + 출처 + 측정소명 — 미세먼지 바로 아래 우측 정렬 */}
          {weather && (
            <Text
              style={[styles.sourceText, { color: colors.mutedForeground }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {weather.locationName ? `📍${weather.locationName} · ` : ""}
              {weather.stationName ? `${weather.stationName} · ` : ""}
              {weather.dustSource}
            </Text>
          )}
        </View>
      </View>
      {/* 기상특보(폭염 등) 줄은 표시하지 않는다 — 한 줄을 통째로 차지해 제거(2026-07-11 사용자 요청) */}

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
                allowFontScaling={false}
              >
                {goal.title}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyRow}>
          <Target size={14} color={colors.mutedForeground} />
          <Text
            style={[styles.emptyText, { color: colors.mutedForeground }]}
            allowFontScaling={false}
          >
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
  rightBlock: {
    marginLeft: 5,
    alignItems: "flex-end",
  },
  rightTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dustRow: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  batteryFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  batteryLabel: {
    fontSize: 9,
    fontWeight: "900",
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
  sourceText: {
    fontSize: 7,
    opacity: 0.4,
    textAlign: "right",
    // 미세먼지 줄과의 간격 — 시계(행 최고높이)보다 블록이 낮아 행 높이·목표 위치는 불변
    marginTop: 6,
    maxWidth: 180, // 좁은 화면에서 좌측 날짜/기온 블록을 밀어내지 않게 캡
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
