import { Platform } from "react-native";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

export interface WeatherData {
  temperature: number;
  pm25: number;
  pm10: number;
  dustLevel: string;
  dustSource: string;
  stationName: string;
  weatherDesc: string;
  weatherIcon: string;
  morningIcon: string;
  afternoonIcon: string;
  alerts: string[];
  windSpeed: number;
  locationName: string; // 현재 위치명 (읍면동)
}

// PM2.5 기준 초미세먼지 등급 (이모지)
const getDustLevel = (pm25: number): string => {
  if (pm25 <= 15) return "😊";
  if (pm25 <= 35) return "😐";
  if (pm25 <= 75) return "😷";
  return "🤢";
};

const getDustColor = (pm25: number): string => {
  if (pm25 <= 15) return "#22c55e";
  if (pm25 <= 35) return "#3b82f6";
  if (pm25 <= 75) return "#f97316";
  return "#ef4444";
};

// PM10 기준 미세먼지 등급 (이모지)
const getDustLevel10 = (pm10: number): string => {
  if (pm10 <= 30) return "😊";
  if (pm10 <= 80) return "😐";
  if (pm10 <= 150) return "😷";
  return "🤢";
};

const getDustColor10 = (pm10: number): string => {
  if (pm10 <= 30) return "#22c55e";
  if (pm10 <= 80) return "#3b82f6";
  if (pm10 <= 150) return "#f97316";
  return "#ef4444";
};

export { getDustLevel, getDustLevel10, getDustColor, getDustColor10 };

// === 캐시 ===
const WEATHER_CACHE_KEY = "cached_weather_v3";
const LOCATION_CACHE_KEY = "cached_location_v3"; // v2 무효화: Balanced 정확도로 잡힌 부정확 동 좌표 일괄 제거 (v3.9.23)
let cachedWeather: WeatherData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

const DEFAULT_LAT = 37.5665;
const DEFAULT_LON = 126.978;

// === GPS 위치 상태 ===
let lastLat = 0;
let lastLon = 0;
let lastSido = "";
let lastCity = "";
let lastDong = "";
let locationLoaded = false;

// 실시간 GPS 추적 (watchPosition)
let lastWatchLat = 0;
let lastWatchLon = 0;
let lastWatchSido = "";
let lastWatchCity = "";
let lastWatchDong = "";
let watchHasLocation = false;
let locationWatchSub: Location.LocationSubscription | null = null;
let onSignificantMove: (() => void) | null = null;

// 두 GPS 좌표 사이 거리 (m) - haversine
function distanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1km 이상 이동 시 날씨 자동 갱신 트리거
const SIGNIFICANT_MOVE_M = 1000;
// 날씨 API 요청 시 GPS 흔들림 필터 (forceRefresh가 아닐 때만).
// 도시 내 동 경계가 50~200m라 100m 미만으로 유지 — 그래야 화곡↔신월 같은
// 인접 동 사이에서 정확한 동 표시됨. (v3.9.23 — 기존 300m는 동 단위 부정확)
const JITTER_THRESHOLD_M = 80;

// === 실시간 GPS 추적 ===
export async function startLocationWatch(onMove: () => void): Promise<void> {
  if (locationWatchSub) return; // 이미 추적 중
  onSignificantMove = onMove;
  try {
    // ⚠️ 여기서는 권한을 "확인"만 한다(request 금지). expo askForPermissions는 이미 허용된
    // 권한이어도 무조건 시스템 다이얼로그를 띄우는데(granted 체크 없음), 그 투명 다이얼로그가
    // 포커스를 뺏어 AppState background→active 를 유발 → banner 의 복귀 리스너가 날씨 강제
    // 새로고침 → 다시 request → 초당 ~25회 다이얼로그 무한폭주(2026-07-11 Galaxy S25 실측,
    // "업데이트 후 앱 혼자 꺼짐"의 근본원인 — 콜드스타트마다 발생). 요청은 App.tsx 온보딩 전용.
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return;

    locationWatchSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High, // 동 단위 정밀도 위해 High (~10m) — 정확도는 그대로 둔다
        distanceInterval: 80, // 80m 이동마다 콜백 (동 경계 감지)
        // 최소 60초 간격 — 30초에서 늘렸다. 동 경계 감지는 거리(80m) 기준이라 정확도는 그대로이고,
        // 갱신 빈도만 절반이 된다(포그라운드 GPS 소모 감소). 앱이 안 보이면 watch 자체가 멈춘다.
        timeInterval: 60000,
      },
      async (loc) => {
        const newLat = loc.coords.latitude;
        const newLon = loc.coords.longitude;

        // 역지오코딩으로 위치명 업데이트 (웹은 미지원 → 좌표 최근접 시도 추정)
        if (Platform.OS === "web") {
          lastWatchSido = sidoFromCoords(newLat, newLon);
          lastWatchCity = "";
          lastWatchDong = "";
        } else
        try {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: newLat,
            longitude: newLon,
          });
          if (geocode.length > 0) {
            const g = geocode[0];
            const region = g.region || g.subregion || "";
            lastWatchSido = getSidoName(region, g.subregion || "");
            lastWatchCity = g.subregion || "";
            lastWatchDong =
              g.district ||
              (g.city && g.city !== g.subregion ? g.city : "") ||
              (g.name && /[동읍면리가]$/.test(g.name) ? g.name : "") ||
              (g.street && /[동읍면리가]$/.test(g.street) ? g.street : "") ||
              "";
          }
        } catch {}

        // 이전 위치 대비 이동 거리 체크
        const moved = watchHasLocation
          ? distanceM(lastWatchLat, lastWatchLon, newLat, newLon)
          : Infinity;

        lastWatchLat = newLat;
        lastWatchLon = newLon;
        watchHasLocation = true;

        // 1km 이상 이동 시 날씨 갱신 트리거
        if (moved >= SIGNIFICANT_MOVE_M && onSignificantMove) {
          onSignificantMove();
        }
      },
    );
  } catch (e) {
    console.warn("Location watch failed:", e);
  }
}

/**
 * GPS 추적이 끊겼던 적이 있는가(= 그 사이 이동을 놓쳤을 수 있다).
 *
 * 배경(2026-07-14 교차검증 지적): 앱이 안 보일 때 GPS watch 를 멈춰 배터리를 아끼는데,
 * 그 동안 사용자가 동(洞)을 넘어 이동하면 아무도 그걸 모른다. 이때 "최근 위치가 3분 이내면
 * 측위 생략" 규칙을 그대로 적용하면 **이동 전 좌표로 미세먼지 측정소를 잘못 고른다**.
 * → 추적이 끊겼다 다시 켜지는 첫 조회에서는 신선도와 무관하게 **한 번은 실제로 측위**한다.
 */
let missedMovementWhileStopped = false;

/** 위 플래그를 읽고 소비(1회성). getWeather 가 "이번엔 반드시 측위" 판단에 쓴다. */
export function consumeMissedMovement(): boolean {
  const missed = missedMovementWhileStopped;
  missedMovementWhileStopped = false;
  return missed;
}

export function stopLocationWatch(): void {
  if (locationWatchSub) {
    locationWatchSub.remove();
    locationWatchSub = null;
    // 추적이 끊긴 동안의 이동은 감지할 수 없다 → 다음 조회 때 한 번은 실측위해야 한다.
    missedMovementWhileStopped = true;
  }
  onSignificantMove = null;
}

// watchPosition에서 추적 중인 최신 위치 반환
export function getWatchedLocation(): {
  lat: number;
  lon: number;
  sido: string;
  city: string;
  dong: string;
} | null {
  if (!watchHasLocation) return null;
  return {
    lat: lastWatchLat,
    lon: lastWatchLon,
    sido: lastWatchSido,
    city: lastWatchCity,
    dong: lastWatchDong,
  };
}

// 웹 폴백: expo-location 역지오코딩이 웹 미지원 → 시도를 좌표 최근접으로 추정.
// ⚠️ 시도명 목록은 아래 getSidoName()의 매칭 규칙과 짝 — 행정구역 개편 시 둘 다 갱신.
// 도(道)는 단일 중심점이면 경계 도시가 옆 시도로 붙는다(교차검증 실측: 천안이 세종에
// 오분류) → 시도당 앵커 여러 개(주요 도시)로 최근접. 미세먼지 sidoName 선택용 정밀도.
const SIDO_CENTROIDS: [string, number, number][] = [
  ["서울", 37.57, 126.98],
  ["부산", 35.18, 129.08],
  ["대구", 35.87, 128.6],
  ["인천", 37.46, 126.71],
  ["광주", 35.16, 126.85],
  ["대전", 36.35, 127.38],
  ["울산", 35.54, 129.31],
  ["세종", 36.48, 127.29],
  ["경기", 37.29, 127.05], // 수원
  ["경기", 37.74, 127.03], // 의정부(북부)
  ["경기", 36.99, 127.09], // 평택(남부)
  ["경기", 37.62, 126.72], // 김포(서부 — 인천에 붙는 것 방지)
  ["강원", 37.88, 127.73], // 춘천
  ["강원", 37.75, 128.9], // 강릉(영동)
  ["강원", 37.34, 127.92], // 원주
  ["강원", 37.18, 128.46], // 영월(남부 — 제천에 붙는 것 방지)
  ["강원", 37.16, 128.99], // 태백(동남부 — 경북에 붙는 것 방지)
  ["충북", 36.64, 127.49], // 청주
  ["충북", 36.99, 127.93], // 충주
  ["충북", 37.13, 128.19], // 제천
  ["충북", 36.98, 128.37], // 단양(동북부 — 영월에 붙는 것 방지)
  ["충남", 36.6, 126.66], // 홍성
  ["충남", 36.82, 127.11], // 천안
  ["충남", 36.78, 126.45], // 서산
  ["충남", 36.19, 127.1], // 논산
  ["전북", 35.82, 127.15], // 전주
  ["전북", 35.97, 126.7], // 군산
  ["전북", 35.42, 127.39], // 남원(동부)
  ["전남", 34.99, 126.48], // 무안
  ["전남", 34.95, 127.49], // 순천
  ["전남", 34.76, 127.66], // 여수
  ["전남", 34.81, 126.39], // 목포
  ["경북", 36.57, 128.73], // 안동
  ["경북", 36.02, 129.34], // 포항
  ["경북", 36.12, 128.34], // 구미
  ["경북", 35.86, 129.23], // 경주
  ["경북", 36.41, 128.16], // 상주(서부 — 문경이 충주에 붙는 것 방지)
  ["경북", 36.81, 128.62], // 영주(북부)
  ["경북", 36.99, 129.4], // 울진(동해안 — 강원에 붙는 것 방지)
  ["경남", 35.24, 128.69], // 창원
  ["경남", 35.18, 128.11], // 진주(서부)
  ["경남", 35.23, 128.89], // 김해
  ["경남", 35.34, 129.04], // 양산(동부 — 부산에 붙는 것 방지)
  ["제주", 33.5, 126.53],
];

function sidoFromCoords(lat: number, lon: number): string {
  let best = "서울";
  let bestD = Infinity;
  for (const [name, sLat, sLon] of SIDO_CENTROIDS) {
    const d = (lat - sLat) * (lat - sLat) + (lon - sLon) * (lon - sLon);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

// GPS → 시도명 매핑 (reverse geocoding)
// ⚠️ 위 SIDO_CENTROIDS(웹 좌표 폴백)와 시도명 집합이 짝 — 행정구역 개편 시 둘 다 갱신.
function getSidoName(region: string, city: string = ""): string {
  // 행정통합으로 "전남광주통합특별시"처럼 두 시도명이 한 문자열에 공존 — 아래의
  // includes("광주")가 먼저 걸려 전남 시군이 광주로 오판된다(함평→광주 측정소 25km).
  // 에어코리아 API는 통합 후에도 전남/광주를 별개 sidoName으로 유지(2026-07-11 실측)
  // → 광주 시내는 자치구(…구), 전남은 시·군이라 시군구명으로 구분.
  if (region.includes("전남") && region.includes("광주"))
    return /구$/.test(city) ? "광주" : "전남";
  if (region.includes("서울")) return "서울";
  if (region.includes("부산")) return "부산";
  if (region.includes("대구")) return "대구";
  if (region.includes("인천")) return "인천";
  if (region.includes("광주")) return "광주";
  if (region.includes("대전")) return "대전";
  if (region.includes("울산")) return "울산";
  if (region.includes("세종")) return "세종";
  if (region.includes("경기")) return "경기";
  if (region.includes("강원")) return "강원";
  if (region.includes("충북") || region.includes("충청북")) return "충북";
  if (region.includes("충남") || region.includes("충청남")) return "충남";
  if (region.includes("전북") || region.includes("전라북")) return "전북";
  if (region.includes("전남") || region.includes("전라남")) return "전남";
  if (region.includes("경북") || region.includes("경상북")) return "경북";
  if (region.includes("경남") || region.includes("경상남")) return "경남";
  if (region.includes("제주")) return "제주";
  return "서울";
}

// 영구 캐시에서 즉시 로드 (앱 시작 시 딜레이 제거)
async function loadPersistedCache(): Promise<void> {
  try {
    const [weatherStr, locStr] = await Promise.all([
      SecureStore.getItemAsync(WEATHER_CACHE_KEY),
      SecureStore.getItemAsync(LOCATION_CACHE_KEY),
    ]);
    if (weatherStr) {
      const parsed = JSON.parse(weatherStr);
      if (parsed.data && parsed.timestamp) {
        cachedWeather = parsed.data;
        cacheTimestamp = parsed.timestamp;
      }
    }
    if (locStr) {
      const loc = JSON.parse(locStr);
      lastLat = loc.lat || 0;
      lastLon = loc.lon || 0;
      lastSido = loc.sido || "";
      lastCity = loc.city || "";
      lastDong = loc.dong || "";
      locationLoaded = true;
    }
  } catch {}
}

// 타임아웃 유틸: Promise가 ms 내 resolve 안 되면 reject
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: ${label} (${ms}ms)`)),
      ms,
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

// 영구 캐시 저장
function persistCache(): void {
  if (cachedWeather) {
    SecureStore.setItemAsync(
      WEATHER_CACHE_KEY,
      JSON.stringify({ data: cachedWeather, timestamp: cacheTimestamp }),
    ).catch(() => {});
  }
  if (lastLat !== 0) {
    SecureStore.setItemAsync(
      LOCATION_CACHE_KEY,
      JSON.stringify({
        lat: lastLat,
        lon: lastLon,
        sido: lastSido,
        city: lastCity,
        dong: lastDong,
      }),
    ).catch(() => {});
  }
}

let persistedLoaded = false;

// === 통합 날씨 조회 (백엔드 프록시 경유) ===
export async function getWeather(
  forceRefresh = false,
): Promise<WeatherData | null> {
  // 첫 호출: 영구 캐시 로드
  if (!persistedLoaded) {
    persistedLoaded = true;
    await loadPersistedCache();
  }

  // 메모리 캐시 유효하면 즉시 반환 (forceRefresh 시 무시)
  if (
    !forceRefresh &&
    cachedWeather &&
    Date.now() - cacheTimestamp < CACHE_DURATION
  )
    return cachedWeather;

  // forceRefresh 시 위치 캐시 강제 reset
  // → 사용자가 도시 간 이동했는데 GPS 한 번 실패하면 stale 캐시로 fallback 되던 버그 차단
  if (forceRefresh) {
    lastLat = 0;
    lastLon = 0;
    lastSido = "";
    lastCity = "";
    lastDong = "";
    locationLoaded = false;
  }

  try {
    let lat = DEFAULT_LAT,
      lon = DEFAULT_LON;
    let sido = "서울";
    let city = "";
    let dong = "";

    try {
      // 1순위: watchPosition에서 추적 중인 실시간 위치 사용
      const watched = getWatchedLocation();
      if (watched) {
        lat = watched.lat;
        lon = watched.lon;
        sido = watched.sido || "서울";
        city = watched.city;
        dong = watched.dong;
      }

      // "확인"만 — request 금지(위 startLocationWatch 주석 참조: 다이얼로그 폭주 근본원인)
      const { status } = await withTimeout(
        Location.getForegroundPermissionsAsync(),
        5000,
        "location permission",
      );
      if (status === "granted") {
        // 2순위: getLastKnownPosition (즉시, GPS 라디오를 켜지 않는다)
        let newLat = 0,
          newLon = 0;
        let lastKnownFresh = false;
        // 추적이 끊겼던 적이 있으면(앱이 안 보이는 동안 GPS watch 를 껐다) 그 사이의 이동을
        // 놓쳤을 수 있다 → 이번엔 신선도와 무관하게 실제로 측위한다(동 오판 방지).
        const mustFix = consumeMissedMovement();
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) {
            newLat = lastKnown.coords.latitude;
            newLon = lastKnown.coords.longitude;
            // 방금 잡아 둔 위치(3분 이내)면 GPS 를 또 켤 이유가 없다 — 그 사이 동이 바뀔 만큼
            // 움직였다면 watchPosition(80m)이 이미 잡아서 강제 갱신을 걸었을 것이다.
            // ⚠️ 배터리: 예전엔 lastKnown 이 있어도 **무조건** High 정확도 측위를 다시 했다.
            const ageMs = Date.now() - (lastKnown.timestamp ?? 0);
            lastKnownFresh = !mustFix && ageMs >= 0 && ageMs < 3 * 60 * 1000;
          }
        } catch {}

        // 3순위: getCurrentPosition (High 정확도, 동 단위 표시 위해 ~10m 보장)
        //   — 최근 위치가 신선하지 않을 때만. 신선하면 건너뛴다(정확도 동일, 배터리만 절약).
        if (!lastKnownFresh) {
          try {
            const loc = await withTimeout(
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              }),
              10000,
              "GPS position",
            );
            newLat = loc.coords.latitude;
            newLon = loc.coords.longitude;
          } catch (gpsErr) {
            // getCurrentPosition 실패해도 lastKnown이 있으면 OK
            if (newLat === 0) throw gpsErr;
          }
        }

        if (newLat !== 0) {
          // forceRefresh: 항상 최신 GPS 사용 (흔들림 필터 무시)
          // 일반: 300m 이내면 이전 위치 유지 (날씨 격자 동일)
          const shouldUpdate =
            forceRefresh ||
            !locationLoaded ||
            lastLat === 0 ||
            distanceM(lastLat, lastLon, newLat, newLon) >= JITTER_THRESHOLD_M;

          if (shouldUpdate) {
            lat = newLat;
            lon = newLon;

            // reverse geocode → 시도명 + 시군구명 + 읍면동명 (웹은 미지원 → 좌표 추정)
            if (Platform.OS === "web") {
              sido = sidoFromCoords(lat, lon);
              city = "";
              dong = "";
            } else
            try {
              const geocode = await withTimeout(
                Location.reverseGeocodeAsync({
                  latitude: lat,
                  longitude: lon,
                }),
                5000,
                "reverse geocode",
              );
              if (geocode.length > 0) {
                const g = geocode[0];
                const region = g.region || g.subregion || "";
                sido = getSidoName(region, g.subregion || "");
                city = g.subregion || "";
                dong =
                  g.district ||
                  (g.city && g.city !== g.subregion ? g.city : "") ||
                  (g.name && /[동읍면리가]$/.test(g.name) ? g.name : "") ||
                  (g.street && /[동읍면리가]$/.test(g.street)
                    ? g.street
                    : "") ||
                  "";
              }
            } catch {}

            // 위치 캐시 업데이트
            lastLat = lat;
            lastLon = lon;
            lastSido = sido;
            lastCity = city;
            lastDong = dong;
            locationLoaded = true;
          } else {
            // 흔들림 범위 내: 이전 위치 재사용
            lat = lastLat;
            lon = lastLon;
            sido = lastSido;
            city = lastCity;
            dong = lastDong;
          }
        }
      }
    } catch (locErr) {
      console.warn("Location error (using fallback):", locErr);
      // GPS 실패 시: watchPosition 위치 > 캐시 위치 > 서울 기본값
      const watched = getWatchedLocation();
      if (watched && watched.lat !== 0) {
        lat = watched.lat;
        lon = watched.lon;
        sido = watched.sido || "서울";
        city = watched.city;
        dong = watched.dong;
      } else if (locationLoaded && lastLat !== 0) {
        lat = lastLat;
        lon = lastLon;
        sido = lastSido;
        city = lastCity;
        dong = lastDong;
      }
    }

    const url = `${API_URL}/api/weather?lat=${lat}&lon=${lon}&sido=${encodeURIComponent(sido)}&city=${encodeURIComponent(city)}&dong=${encodeURIComponent(dong)}`;
    const controller = new AbortController();
    const fetchTimer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(fetchTimer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    cachedWeather = {
      temperature: data.temperature ?? 0,
      pm25: data.pm25 ?? 0,
      pm10: data.pm10 ?? 0,
      dustLevel: getDustLevel(data.pm25 ?? 0),
      dustSource: data.dustSource ?? "기상청·에어코리아(환경부)",
      stationName: data.stationName ?? "",
      weatherDesc: data.weatherDesc ?? "",
      weatherIcon: data.weatherIcon ?? "",
      morningIcon: data.morningIcon ?? "☀️",
      afternoonIcon: data.afternoonIcon ?? "☀️",
      alerts: data.alerts ?? [],
      windSpeed: data.windSpeed ?? 0,
      locationName: dong || city || sido,
    };
    cacheTimestamp = Date.now();
    persistCache();
    return cachedWeather;
  } catch (e) {
    console.error("Weather fetch error:", e);
    return cachedWeather;
  }
}
