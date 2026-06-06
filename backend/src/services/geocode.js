const GOOGLE_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY
const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

async function queryGoogle(q, city) {
  const address = city ? `${q}, ${city}` : q
  const url = `${GOOGLE_URL}?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}&language=ko`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location
      return { lat: loc.lat, lng: loc.lng }
    }
    if (data.status !== 'ZERO_RESULTS') {
      console.warn(`Google Geocoding 오류: ${data.status} — "${q}"`)
    }
  } catch (e) {
    console.warn(`Google Geocoding 요청 실패: "${q}"`, e.message)
  }
  return null
}

async function geocodeOne(name, enName, city) {
  // 1차: 한국어 이름 + 도시
  const r1 = await queryGoogle(name, city)
  if (r1) return r1

  // 2차: 영문 이름 + 도시 (LLM이 제공한 경우)
  if (enName && enName !== name) {
    const r2 = await queryGoogle(enName, city)
    if (r2) return r2
  }

  return null
}

export async function geocodeItems(items, city) {
  const result = []
  for (const item of items) {
    const coords = await geocodeOne(item.name, item.en_name, city)
    if (coords) {
      console.log(`✓ 지오코딩: ${item.name} → (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
      result.push({ ...item, lat: coords.lat, lng: coords.lng, geocoded: true })
    } else {
      console.log(`✗ 지오코딩 실패(LLM 좌표 사용): ${item.name}`)
      result.push({ ...item, geocoded: false })
    }
  }
  return result
}
