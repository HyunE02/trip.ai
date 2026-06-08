function isValidCoord(lat, lng) {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  )
}

export function validateAndCleanItems(items) {
  if (!Array.isArray(items)) return []
  return items.filter((item) => {
    if (!isValidCoord(item.lat, item.lng)) {
      console.warn(`좌표 무효로 제거: ${item.name} (${item.lat}, ${item.lng})`)
      return false
    }
    return true
  })
}

export function filterByCityRadius(items, cityCenter, maxRadiusKm = 50) {
  if (!cityCenter || !Array.isArray(items)) return items
  return items.filter((item) => {
    if (!isValidCoord(item.lat, item.lng)) return false
    const dist = haversine(cityCenter.lat, cityCenter.lng, item.lat, item.lng)
    if (dist > maxRadiusKm) {
      console.warn(`✗ 도시 반경 초과로 제거: ${item.name} (${dist.toFixed(1)}km > ${maxRadiusKm}km)`)
      return false
    }
    return true
  })
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function greedyNearest(items) {
  if (items.length <= 1) return [...items]
  const remaining = [...items]
  const result = [remaining.shift()]
  while (remaining.length > 0) {
    const last = result[result.length - 1]
    let minDist = Infinity, nearestIdx = 0
    remaining.forEach((item, idx) => {
      const d = haversine(last.lat, last.lng, item.lat, item.lng)
      if (d < minDist) { minDist = d; nearestIdx = idx }
    })
    result.push(remaining.splice(nearestIdx, 1)[0])
  }
  return result
}

function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || '09:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * LLM의 start_time을 기준으로 시간대별 블록을 나눠 공간 최적화하고
 * 각 블록 내 시간을 schedule 기반으로 재계산한다.
 *
 * schedule: { start, lunch, dinner, end }  (시 단위)
 * hotel: string | null  (있으면 기상→출발 버퍼 60분 추가)
 */
export function reorderByDistance(items, schedule = {}, hotel = null) {
  if (items.length <= 1) return items

  const TRAVEL_BUFFER = 20   // 장소 간 이동 시간(분)
  const HOTEL_BUFFER  = hotel ? 60 : 0  // 기상 후 출발까지 준비 시간(분)

  const wakeMin   = (schedule.start  ?? 9)  * 60   // 기상 시간
  const lunchMin  = (schedule.lunch  ?? 13) * 60   // 점심 목표 시간
  const dinnerMin = (schedule.dinner ?? 19) * 60   // 저녁 목표 시간
  const firstActivityMin = wakeMin + HOTEL_BUFFER  // 실제 첫 활동 시작 시간

  // 점심/저녁 "허용 범위"(±90분) 내에 있는 항목을 해당 식사 블록으로 분류
  // 키워드 판별 제거 — LLM이 배치한 start_time 기준으로만 분류
  const MEAL_WINDOW = 90

  const sorted = [...items].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))

  const morningBlock   = []
  const lunchBlock     = []
  const afternoonBlock = []
  const dinnerBlock    = []
  const eveningBlock   = []

  sorted.forEach((item) => {
    const t = timeToMinutes(item.start_time)
    if (Math.abs(t - lunchMin) <= MEAL_WINDOW) {
      lunchBlock.push(item)
    } else if (Math.abs(t - dinnerMin) <= MEAL_WINDOW) {
      dinnerBlock.push(item)
    } else if (t < lunchMin) {
      morningBlock.push(item)
    } else if (t < dinnerMin) {
      afternoonBlock.push(item)
    } else {
      eveningBlock.push(item)
    }
  })

  // 관광 블록만 거리 최적화, 식사 블록(점심/저녁)은 순서 유지
  const ordered = [
    ...greedyNearest(morningBlock),
    ...lunchBlock,
    ...greedyNearest(afternoonBlock),
    ...dinnerBlock,
    ...greedyNearest(eveningBlock),
  ]

  // 시간 재배정: schedule 기준 + 식사 시간 스냅
  let cur = firstActivityMin
  return ordered.map((item, idx) => {
    if (idx > 0) {
      cur += (ordered[idx - 1].duration_min || 60) + TRAVEL_BUFFER
    }
    // 점심 블록 항목 → 목표 점심 시간 이상으로 스냅
    if (lunchBlock.includes(item))  cur = Math.max(cur, lunchMin)
    // 저녁 블록 항목 → 목표 저녁 시간 이상으로 스냅
    if (dinnerBlock.includes(item)) cur = Math.max(cur, dinnerMin)
    return { ...item, start_time: minutesToTime(cur) }
  })
}
