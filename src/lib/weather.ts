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
const WEATHER_CACHE_KEY = "cached_weather_v1";
const LOCATION_CACHE_KEY = "cached_location_v1";
let cachedWeather: WeatherData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10분

const DEFAULT_LAT = 37.5665;
const DEFAULT_LON = 126.978;

// === GPS 안정성: 마지막 확정 위치 캐시 ===
let lastLat = 0;
let lastLon = 0;
let lastSido = "";
let lastCity = "";
let lastDong = "";
let locationLoaded = false;

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

// 500m 이내면 이전 위치 유지 (GPS 흔들림 방지)
const LOCATION_THRESHOLD_M = 500;

// GPS → 시도명 매핑 (reverse geocoding)
function getSidoName(region: string): string {
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

  try {
    let lat = DEFAULT_LAT,
      lon = DEFAULT_LON;
    let sido = "서울";
    let city = "";
    let dong = "";

    try {
      const { status } = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        5000,
        "location permission",
      );
      if (status === "granted") {
        const loc = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          10000,
          "GPS position",
        );
        const newLat = loc.coords.latitude;
        const newLon = loc.coords.longitude;

        // GPS 안정성: 이전 위치와 500m 이내면 이전 위치 유지
        if (
          locationLoaded &&
          lastLat !== 0 &&
          distanceM(lastLat, lastLon, newLat, newLon) < LOCATION_THRESHOLD_M
        ) {
          lat = lastLat;
          lon = lastLon;
          sido = lastSido;
          city = lastCity;
          dong = lastDong;
        } else {
          lat = newLat;
          lon = newLon;

          // reverse geocode → 시도명 + 시군구명 + 읍면동명
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
              sido = getSidoName(region);
              city = g.subregion || "";
              dong =
                g.district ||
                (g.city && g.city !== g.subregion ? g.city : "") ||
                (g.name && /[동읍면리가]$/.test(g.name) ? g.name : "") ||
                (g.street && /[동읍면리가]$/.test(g.street) ? g.street : "") ||
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
        }
      }
    } catch (locErr) {
      console.warn("Location error (using fallback):", locErr);
      // GPS 실패 시 캐시된 위치가 있으면 사용
      if (locationLoaded && lastLat !== 0) {
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
    };
    cacheTimestamp = Date.now();
    persistCache();
    return cachedWeather;
  } catch (e) {
    console.error("Weather fetch error:", e);
    return cachedWeather;
  }
}
