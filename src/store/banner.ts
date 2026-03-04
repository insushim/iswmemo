import { create } from "zustand";
import { AppState } from "react-native";
import * as Battery from "expo-battery";
import { getWeather, WeatherData } from "../lib/weather";

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

    // Weather: 즉시 로드 + 10분 간격 + foreground 복귀 시 새로고침
    getWeather().then((w) => set({ weather: w }));
    const weatherInterval = setInterval(
      () => getWeather().then((w) => set({ weather: w })),
      10 * 60 * 1000,
    );
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        getWeather(true).then((w) => set({ weather: w }));
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
      clearInterval(batteryInterval);
      batterySub.remove();
    };
  },
}));
