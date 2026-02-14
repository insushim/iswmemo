import * as Location from 'expo-location';
import { API_URL } from './config';

export interface WeatherData {
  temperature: number;
  pm25: number;
  pm10: number;
  dustLevel: string;
  dustSource: string;
  weatherDesc: string;
  weatherIcon: string;
  alerts: string[];
  windSpeed: number;
}

// PM2.5 기준 초미세먼지 등급
const getDustLevel = (pm25: number): string => {
  if (pm25 <= 15) return '좋음';
  if (pm25 <= 35) return '보통';
  if (pm25 <= 75) return '나쁨';
  return '매우나쁨';
};

const getDustColor = (pm25: number): string => {
  if (pm25 <= 15) return '#22c55e';
  if (pm25 <= 35) return '#3b82f6';
  if (pm25 <= 75) return '#f97316';
  return '#ef4444';
};

// PM10 기준 미세먼지 등급
const getDustColor10 = (pm10: number): string => {
  if (pm10 <= 30) return '#22c55e';
  if (pm10 <= 80) return '#3b82f6';
  if (pm10 <= 150) return '#f97316';
  return '#ef4444';
};

export { getDustColor, getDustColor10 };

// === 캐시 ===
let cachedWeather: WeatherData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30분 (서버에서 1시간 캐시하므로 클라이언트는 30분)

const DEFAULT_LAT = 37.5665;
const DEFAULT_LON = 126.978;

// GPS → 시도명 매핑 (reverse geocoding)
function getSidoName(region: string): string {
  if (region.includes('서울')) return '서울';
  if (region.includes('부산')) return '부산';
  if (region.includes('대구')) return '대구';
  if (region.includes('인천')) return '인천';
  if (region.includes('광주')) return '광주';
  if (region.includes('대전')) return '대전';
  if (region.includes('울산')) return '울산';
  if (region.includes('세종')) return '세종';
  if (region.includes('경기')) return '경기';
  if (region.includes('강원')) return '강원';
  if (region.includes('충북') || region.includes('충청북')) return '충북';
  if (region.includes('충남') || region.includes('충청남')) return '충남';
  if (region.includes('전북') || region.includes('전라북')) return '전북';
  if (region.includes('전남') || region.includes('전라남')) return '전남';
  if (region.includes('경북') || region.includes('경상북')) return '경북';
  if (region.includes('경남') || region.includes('경상남')) return '경남';
  if (region.includes('제주')) return '제주';
  return '서울';
}

// === 통합 날씨 조회 (백엔드 프록시 경유) ===
export async function getWeather(): Promise<WeatherData | null> {
  if (cachedWeather && Date.now() - cacheTimestamp < CACHE_DURATION) return cachedWeather;

  try {
    let lat = DEFAULT_LAT, lon = DEFAULT_LON;
    let sido = '서울';

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;

        // reverse geocode → 시도명
        try {
          const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
          if (geocode.length > 0) {
            const region = geocode[0].region || geocode[0].subregion || '';
            sido = getSidoName(region);
          }
        } catch {}
      }
    } catch {}

    const url = `${API_URL}/api/weather?lat=${lat}&lon=${lon}&sido=${encodeURIComponent(sido)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    cachedWeather = {
      temperature: data.temperature ?? 0,
      pm25: data.pm25 ?? 0,
      pm10: data.pm10 ?? 0,
      dustLevel: getDustLevel(data.pm25 ?? 0),
      dustSource: data.dustSource ?? '기상청·에어코리아(환경부)',
      weatherDesc: data.weatherDesc ?? '',
      weatherIcon: data.weatherIcon ?? '',
      alerts: data.alerts ?? [],
      windSpeed: data.windSpeed ?? 0,
    };
    cacheTimestamp = Date.now();
    return cachedWeather;
  } catch (e) {
    console.error('Weather fetch error:', e);
    return cachedWeather;
  }
}
