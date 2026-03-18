import { create } from "zustand";
import { AppState } from "react-native";
import * as Battery from "expo-battery";
import {
  getWeather,
  WeatherData,
  startLocationWatch,
  stopLocationWatch,
} from "../lib/weather";

interface BannerState {
  weather: WeatherData | null;
  battery: number | null;
  initialized: boolean;
  init: () => void;
}

let cleanup: (() => void) | null = null;

export const useBannerStore = create<BannerState>((set, get) => ({
  weather: null,
  battery: null,
  initialized: false,
  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    const refreshWeather = (force = false) =>
      getWeather(force).then((w) => {
        if (w) set({ weather: w });
      });

    // Weather: 즉시 로드 + 5분 간격 + foreground 복귀 시 새로고침
    refreshWeather();
    const weatherInterval = setInterval(() => refreshWeather(), 5 * 60 * 1000);

    // 실시간 GPS 추적 시작 → 1km 이상 이동 시 날씨 자동 갱신
    startLocationWatch(() => refreshWeather(true));

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // foreground 복귀: GPS watch 재시작 + 날씨 강제 갱신
        startLocationWatch(() => refreshWeather(true));
        refreshWeather(true);
      } else if (state === "background") {
        // background: GPS watch 중지 (배터리 절약)
        stopLocationWatch();
      }
    });

    // Battery: 즉시 + 30초 폴링 + 리스너
    const pollBattery = () =>
      Battery.getBatteryLevelAsync()
        .then((level) => {
          if (level >= 0) set({ battery: Math.round(level * 100) });
        })
        .catch(() => {});
    pollBattery();
    const batteryInterval = setInterval(pollBattery, 30000);
    const batterySub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel >= 0) set({ battery: Math.round(batteryLevel * 100) });
    });

    cleanup = () => {
      clearInterval(weatherInterval);
      appStateSub.remove();
      stopLocationWatch();
      clearInterval(batteryInterval);
      batterySub.remove();
    };
  },
}));
