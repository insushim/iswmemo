import * as Location from "expo-location";
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
let cachedWeather: WeatherData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10분 (기온/미세먼지 빠르게 반영)

const DEFAULT_LAT = 37.5665;
const DEFAULT_LON = 126.978;

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

// === 통합 날씨 조회 (백엔드 프록시 경유) ===
export async function getWeather(): Promise<WeatherData | null> {
  if (cachedWeather && Date.now() - cacheTimestamp < CACHE_DURATION)
    return cachedWeather;

  try {
    let lat = DEFAULT_LAT,
      lon = DEFAULT_LON;
    let sido = "서울";
    let city = "";
    let dong = "";

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;

        // reverse geocode → 시도명 + 시군구명 + 읍면동명
        try {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: lat,
            longitude: lon,
          });
          if (geocode.length > 0) {
            const g = geocode[0];
            const region = g.region || g.subregion || "";
            sido = getSidoName(region);
            // 시군구명 (subregion: "김제시", "함평군" 등)
            city = g.subregion || "";
            // 읍면동명 추출 (Android 기기마다 필드가 다를 수 있음)
            // district=subLocality(동/읍/면), name=featureName, street=thoroughfare
            // 우선순위: district → city(subregion과 다를때) → name(동/읍/면으로 끝날때)
            dong =
              g.district ||
              (g.city && g.city !== g.subregion ? g.city : "") ||
              (g.name && /[동읍면리가]$/.test(g.name) ? g.name : "") ||
              (g.street && /[동읍면리가]$/.test(g.street) ? g.street : "") ||
              "";
            console.log(`WEATHER: sido=${sido}, city=${city}, dong=${dong}`);
          }
        } catch {}
      }
    } catch {}

    const url = `${API_URL}/api/weather?lat=${lat}&lon=${lon}&sido=${encodeURIComponent(sido)}&city=${encodeURIComponent(city)}&dong=${encodeURIComponent(dong)}`;
    const res = await fetch(url);
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
    return cachedWeather;
  } catch (e) {
    console.error("Weather fetch error:", e);
    return cachedWeather;
  }
}
