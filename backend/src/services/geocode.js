const GOOGLE_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY
const PLACES_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

const EARTH_RADIUS_KM = 6371

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isInsideBias(lat, lng, bias) {
  if (!bias?.center) return true
  const dist = haversineKm(bias.center.lat, bias.center.lng, lat, lng)
  return dist <= (bias.radiusKm || 50)
}

function makeBounds(center, radiusKm) {
  const dLat = radiusKm / 111
  const dLng = radiusKm / (111 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01))
  return `${(center.lat - dLat).toFixed(6)},${(center.lng - dLng).toFixed(6)}|${(center.lat + dLat).toFixed(6)},${(center.lng + dLng).toFixed(6)}`
}

async function queryPlaces(q, city, bias) {
  const input = city ? `${q} ${city}` : q
  let url = `${PLACES_URL}?input=${encodeURIComponent(input)}&inputtype=textquery&fields=geometry,name,formatted_address&language=ko&key=${GOOGLE_API_KEY}`
  if (bias?.center) {
    const r = (bias.radiusKm || 50) * 1000
    url += `&locationbias=${encodeURIComponent(`circle:${r}@${bias.center.lat},${bias.center.lng}`)}`
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    if (data.status === 'OK' && data.candidates?.[0]?.geometry?.location) {
      const loc = data.candidates[0].geometry.location
      // 응답 검증: bias 범위 안인지 확인 (안전망)
      if (!isInsideBias(loc.lat, loc.lng, bias)) {
        console.warn(`✗ Places 결과가 도시 반경 밖: "${q}" → (${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)})`)
        return null
      }
      return { lat: loc.lat, lng: loc.lng, source: 'places' }
    }
    if (data.status !== 'ZERO_RESULTS') {
      console.warn(`Places API 오류: ${data.status} — "${q}"`)
    }
  } catch (e) {
    console.warn(`Places API 요청 실패: "${q}"`, e.message)
  }
  return null
}

async function queryGeocode(q, city, bias) {
  const address = city ? `${q}, ${city}` : q
  let url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}&language=ko`
  if (bias?.center) {
    url += `&bounds=${encodeURIComponent(makeBounds(bias.center, bias.radiusKm || 50))}`
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location
      if (!isInsideBias(loc.lat, loc.lng, bias)) {
        console.warn(`✗ Geocoding 결과가 도시 반경 밖: "${q}" → (${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)})`)
        return null
      }
      return { lat: loc.lat, lng: loc.lng, source: 'geocode' }
    }
    if (data.status !== 'ZERO_RESULTS') {
      console.warn(`Geocoding 오류: ${data.status} — "${q}"`)
    }
  } catch (e) {
    console.warn(`Geocoding 요청 실패: "${q}"`, e.message)
  }
  return null
}

async function geocodeOne(name, enName, city, bias) {
  // 1차: Places API + 한국어 이름 (locationbias 적용)
  const r1 = await queryPlaces(name, city, bias)
  if (r1) return r1

  // 2차: Places API + 영문 이름
  if (enName && enName !== name) {
    const r2 = await queryPlaces(enName, city, bias)
    if (r2) return r2
  }

  // 3차: Geocoding API 폴백 (한국어 + bounds)
  const r3 = await queryGeocode(name, city, bias)
  if (r3) return r3

  // 4차: Geocoding API 폴백 (영문 + bounds)
  if (enName && enName !== name) {
    const r4 = await queryGeocode(enName, city, bias)
    if (r4) return r4
  }

  return null
}

export async function geocodeCityCenter(city) {
  if (!city) return null
  const r = (await queryGeocode(city, null, null)) || (await queryPlaces(city, null, null))
  if (r) {
    console.log(`✓ 도시 중심[${r.source}]: ${city} → (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)})`)
    return { lat: r.lat, lng: r.lng }
  }
  console.warn(`✗ 도시 중심 조회 실패: ${city}`)
  return null
}

export async function geocodeItems(items, city, bias = null) {
  const result = []
  for (const item of items) {
    const coords = await geocodeOne(item.name, item.en_name, city, bias)
    if (coords) {
      console.log(`✓ 지오코딩[${coords.source}]: ${item.name} → (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
      result.push({ ...item, lat: coords.lat, lng: coords.lng, geocoded: true })
    } else {
      console.log(`✗ 지오코딩 실패(LLM 좌표 사용): ${item.name}`)
      result.push({ ...item, geocoded: false })
    }
  }
  return result
}
