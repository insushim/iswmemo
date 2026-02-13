import { NextRequest, NextResponse } from "next/server"

const API_KEY = process.env.DATA_GO_KR_API_KEY || 'f52c3f2e083f8b32cbb4c0a0f901af294a6d258c079da72b7e00812013a432fc'
const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'
const AIRKOREA_BASE = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc'

// === 캐시 (시도별 미세먼지 + 격자별 기상) ===
interface CacheEntry<T> { data: T; timestamp: number }
const airCache = new Map<string, CacheEntry<{ pm25: number; pm10: number }>>()
const kmaCache = new Map<string, CacheEntry<{
  temperature: number; weatherDesc: string; weatherIcon: string;
  alerts: string[]; windSpeed: number;
}>>()
const AIR_CACHE_MS = 60 * 60 * 1000   // 1시간 (에어코리아 업데이트 주기)
const KMA_CACHE_MS = 60 * 60 * 1000   // 1시간 (기상청 업데이트 주기)

// === GPS → 기상청 격자 좌표 변환 (Lambert Conformal Conic) ===
function gpsToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877
  const GRID = 5.0
  const SLAT1 = 30.0
  const SLAT2 = 60.0
  const OLON = 126.0
  const OLAT = 38.0
  const XO = 43
  const YO = 136
  const DEGRAD = Math.PI / 180.0

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5)
  ra = (re * sf) / Math.pow(ra, sn)
  let theta = lon * DEGRAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  }
}

// === 초단기실황 base_time 계산 ===
function getNcstBaseTime(now: Date): { base_date: string; base_time: string } {
  const d = new Date(now)
  let hour = d.getHours()
  if (d.getMinutes() < 40) {
    hour -= 1
    if (hour < 0) { hour = 23; d.setDate(d.getDate() - 1) }
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { base_date: `${y}${m}${day}`, base_time: `${String(hour).padStart(2, '0')}00` }
}

// 강수형태(PTY) → 날씨
function getWeatherFromPTY(pty: number): { desc: string; icon: string } {
  switch (pty) {
    case 1: return { desc: '비', icon: '🌧' }
    case 2: return { desc: '비/눈', icon: '🌨' }
    case 3: return { desc: '눈', icon: '❄' }
    case 5: return { desc: '빗방울', icon: '🌦' }
    case 6: return { desc: '빗방울/눈', icon: '🌨' }
    case 7: return { desc: '눈날림', icon: '🌬' }
    default: return { desc: '', icon: '' }
  }
}

// 특수 날씨 경보
function getAlerts(temp: number, windSpeed: number, rain: number): string[] {
  const alerts: string[] = []
  if (temp <= -12) alerts.push('🥶한파')
  if (temp >= 35) alerts.push('🔥폭염')
  else if (temp >= 33) alerts.push('☀️더위')
  if (windSpeed >= 14) alerts.push('💨강풍')
  if (rain >= 30) alerts.push('🌊폭우')
  return alerts
}

// === 기상청 초단기실황 ===
async function getKmaWeather(nx: number, ny: number) {
  const cacheKey = `${nx}_${ny}`
  const cached = kmaCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < KMA_CACHE_MS) return cached.data

  try {
    const { base_date, base_time } = getNcstBaseTime(new Date())
    const url = `${KMA_BASE}/getUltraSrtNcst?serviceKey=${encodeURIComponent(API_KEY)}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`

    const res = await fetch(url)
    const text = await res.text()
    if (text.startsWith('<')) return null

    const data = JSON.parse(text)
    const items = data?.response?.body?.items?.item
    if (!Array.isArray(items)) return null

    let temp = 0, pty = 0, wsd = 0, rn1 = 0
    for (const item of items) {
      switch (item.category) {
        case 'T1H': temp = parseFloat(item.obsrValue); break
        case 'PTY': pty = parseInt(item.obsrValue, 10); break
        case 'WSD': wsd = parseFloat(item.obsrValue); break
        case 'RN1': { const v = parseFloat(item.obsrValue); if (!isNaN(v)) rn1 = v; break }
      }
    }

    const { desc, icon } = getWeatherFromPTY(pty)
    const result = {
      temperature: Math.round(temp),
      weatherDesc: desc,
      weatherIcon: icon,
      alerts: getAlerts(temp, wsd, rn1),
      windSpeed: wsd,
    }
    kmaCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  } catch (e) {
    console.error('KMA error:', e)
    return cached?.data ?? null
  }
}

// === 에어코리아 시도별 실시간 ===
const VALID_SIDO = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주']

async function getAirKoreaData(sidoName: string) {
  if (!VALID_SIDO.includes(sidoName)) sidoName = '서울'

  const cached = airCache.get(sidoName)
  if (cached && Date.now() - cached.timestamp < AIR_CACHE_MS) return cached.data

  try {
    const url = `${AIRKOREA_BASE}/getCtprvnRltmMesureDnsty?serviceKey=${encodeURIComponent(API_KEY)}&returnType=json&numOfRows=10&pageNo=1&sidoName=${encodeURIComponent(sidoName)}&ver=1.0`
    const res = await fetch(url)
    const text = await res.text()
    if (text.startsWith('<')) return null

    const data = JSON.parse(text)
    const items = data?.response?.body?.items
    if (Array.isArray(items)) {
      for (const item of items) {
        const pm25 = parseInt(item.pm25Value, 10)
        const pm10 = parseInt(item.pm10Value, 10)
        if (!isNaN(pm25) && !isNaN(pm10)) {
          const result = { pm25, pm10 }
          airCache.set(sidoName, { data: result, timestamp: Date.now() })
          return result
        }
      }
    }
  } catch (e) {
    console.error('AirKorea error:', e)
    return cached?.data ?? null
  }
  return null
}

// === GET /api/weather?lat=37.5&lon=127.0&sido=서울 ===
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const lat = parseFloat(searchParams.get('lat') || '37.5665')
    const lon = parseFloat(searchParams.get('lon') || '126.978')
    const sido = searchParams.get('sido') || '서울'

    const { nx, ny } = gpsToGrid(lat, lon)

    const [kmaData, airData] = await Promise.all([
      getKmaWeather(nx, ny),
      getAirKoreaData(sido),
    ])

    const result = {
      temperature: kmaData?.temperature ?? 0,
      weatherDesc: kmaData?.weatherDesc ?? '',
      weatherIcon: kmaData?.weatherIcon ?? '',
      alerts: kmaData?.alerts ?? [],
      windSpeed: kmaData?.windSpeed ?? 0,
      pm25: airData?.pm25 ?? 0,
      pm10: airData?.pm10 ?? 0,
      dustSource: '기상청·에어코리아(환경부)',
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
      },
    })
  } catch (e) {
    console.error('Weather API error:', e)
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 })
  }
}
