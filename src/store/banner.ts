import { create } from "zustand";
import { AppState, AppStateStatus } from "react-native";
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

// 화면을 켤 때마다 GPS 를 다시 켜지 않도록 하는 쿨다운.
// 이 앱은 화면이 켜질 때마다 잠금화면 위로 뜨므로 '복귀'가 하루에도 수십~수백 번이다.
// 그때마다 강제 측위를 하면 절약한 배터리를 도로 까먹는다 — 90초 안에 이미 잡았으면 재사용.
const FORCE_REFRESH_COOLDOWN_MS = 90 * 1000;

export const useBannerStore = create<BannerState>((set, get) => ({
  weather: null,
  battery: null,
  initialized: false,
  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    let lastForceAt = 0;

    const refreshWeather = (force = false) => {
      const now = Date.now();
      // 방금 강제 갱신했으면(90초 이내) 캐시 경로로 — GPS 를 다시 켜지 않는다.
      const useForce = force && now - lastForceAt > FORCE_REFRESH_COOLDOWN_MS;
      if (useForce) lastForceAt = now;
      return getWeather(useForce).then((w) => {
        if (w) set({ weather: w });
      });
    };

    const readBattery = () =>
      Battery.getBatteryLevelAsync()
        .then((level) => {
          if (level >= 0) set({ battery: Math.round(level * 100) });
        })
        .catch(() => {});

    // ── 날씨/미세먼지 5분 주기 ────────────────────────────────────────
    // ⚠️ 배터리 핵심: 이 갱신은 GPS 측위를 동반한다. 예전엔 인터벌이 정리되지 않아
    //    **화면이 꺼져 있어도 5분마다 GPS 를 켰다**(잠금화면 서비스가 프로세스를 살려 둠).
    //    → 이제 깨어나서 "앱이 보이는가"를 직접 확인하고, 안 보이면 아무것도 안 하고 되돌아간다.
    //
    // ⚠️ 타이머를 아예 멈추지 않는 이유(교차검증 지적): AppState 의 'active' 이벤트에만
    //    의존해 재가동하면, 잠금화면 전환 race 로 그 이벤트가 한 번 씹혔을 때 날씨·GPS 가
    //    **재부팅 전까지 영영 갱신되지 않는다**. 타이머를 살려 두고 매번 현재 상태를 확인하면
    //    이벤트가 씹혀도 다음 주기에 스스로 복구된다(백그라운드 비용은 5분에 한 번 깨어나 즉시 종료).
    const tick = () => {
      if (AppState.currentState !== "active") return; // 안 보이면 GPS·네트워크 0
      startLocationWatch(() => refreshWeather(true)); // 멱등 — 끊겨 있었으면 자가 복구
      refreshWeather();
    };
    refreshWeather();
    readBattery();
    startLocationWatch(() => refreshWeather(true));
    const weatherTimer = setInterval(tick, 5 * 60 * 1000);

    // ── 배터리 ──────────────────────────────────────────────────────
    // 30초 폴링 제거: 아래 리스너가 변할 때마다 알려주므로 폴링은 순수 중복이었다.
    // 웹(iOS Safari 등)은 배터리 이벤트 미지원으로 등록이 throw할 수 있음 —
    // 실패 시 배터리 표시만 생략(battery=null 유지)하고 나머지 배너는 정상 동작.
    let batterySub: { remove: () => void } | null = null;
    try {
      batterySub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        if (batteryLevel >= 0) set({ battery: Math.round(batteryLevel * 100) });
      });
    } catch {}

    const appStateSub = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          // 돌아왔다: GPS watch 재개 + 날씨 갱신(쿨다운 안이면 캐시) + 배터리 1회 읽기
          startLocationWatch(() => refreshWeather(true));
          refreshWeather(true);
          readBattery();
        } else {
          // 안 보인다: GPS watch 중지(가장 큰 소모원). 5분 타이머는 위 tick 가드로 무해.
          stopLocationWatch();
        }
      },
    );

    cleanup = () => {
      clearInterval(weatherTimer);
      appStateSub.remove();
      stopLocationWatch();
      batterySub?.remove();
    };
  },
}));
