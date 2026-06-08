import express from 'express'
import { generateItinerary, replacePlace, addPlace } from '../services/deepseek.js'
import { validateAndCleanItems, reorderByDistance, filterByCityRadius } from '../services/postprocess.js'
import { geocodeItems, geocodeCityCenter } from '../services/geocode.js'

const router = express.Router()

function makeHotelItem(hotel, schedule) {
  const hour = String(schedule?.start ?? 9).padStart(2, '0')
  return {
    name: hotel,
    category: '숙소',
    lat: null,
    lng: null,
    start_time: `${hour}:00`,
    duration_min: 60,
    reason: '출발지 — 준비 후 이동',
    confidence: 'high',
    isHotel: true,
  }
}

// 일정 생성
router.post('/generate', async (req, res) => {
  const { city, days, companion, tags, budget, schedule, subOptions, restrictions, placesPerDay, hotel } = req.body

  if (!city || !days) {
    return res.status(400).json({ error: '도시와 기간은 필수입니다.' })
  }

  try {
    // 0) 도시 중심 좌표를 먼저 구해 반경 필터 + 지오코딩 bias 에 사용
    const cityCenter = await geocodeCityCenter(city)
    const bias = cityCenter ? { center: cityCenter, radiusKm: 50 } : null

    const raw = await generateItinerary({ city, days, companion, tags, budget, schedule, subOptions, restrictions, placesPerDay, hotel })

    // 모든 day의 items를 평탄화해서 한 번에 지오코딩 (Nominatim 순차 호출)
    const allItems = raw.days.flatMap((d) => d.items)
    console.log(`지오코딩 시작: ${allItems.length}개 장소 (약 ${Math.ceil(allItems.length * 0.6)}초 예상)`)
    const geocoded = await geocodeItems(allItems, city, bias)

    // 지오코딩 결과를 다시 day별로 분배
    let gi = 0
    raw.days = raw.days.map((day) => ({
      ...day,
      items: day.items.map(() => geocoded[gi++]),
    }))

    // day별 후처리: 좌표 검증 + 도시 반경 필터(할루시네이션 제거) + 동선 재정렬
    raw.days = raw.days.map((day) => {
      const cleaned   = validateAndCleanItems(day.items)
      const inCity    = filterByCityRadius(cleaned, cityCenter, 50)
      const reordered = reorderByDistance(inCity, schedule, hotel)
      const items     = hotel ? [makeHotelItem(hotel, schedule), ...reordered] : reordered
      return { ...day, items }
    })

    // 응답에 city 포함 — 이후 replace/add-place 호출 시 정확한 city 추출에 사용
    raw.city = city

    // 숙소도 지오코딩해서 지도에 표시
    if (hotel) {
      const hotelGeocoded = await geocodeItems([{ name: hotel, isHotel: true }], city, bias)
      const hc = hotelGeocoded[0]
      raw.days = raw.days.map((day) => ({
        ...day,
        items: day.items.map((item) =>
          item.isHotel ? { ...item, lat: hc.lat ?? null, lng: hc.lng ?? null, geocoded: hc.geocoded } : item
        ),
      }))
    }

    res.json(raw)
  } catch (err) {
    console.error('일정 생성 오류:', err.message)
    res.status(500).json({ error: err.message || '일정 생성 중 오류가 발생했습니다.' })
  }
})

// 장소 대체 추천
router.post('/replace', async (req, res) => {
  const { currentItinerary, targetItem, dayIndex } = req.body
  // city: 1순위 currentItinerary.city (generate 응답에 포함됨), 2순위 trip_title 추출
  const city = currentItinerary?.city || currentItinerary?.trip_title?.match(/[가-힣a-zA-Z]+/)?.[0] || ''

  if (!currentItinerary || !targetItem) {
    return res.status(400).json({ error: '현재 일정과 교체 대상이 필요합니다.' })
  }

  try {
    const replacement = await replacePlace({ currentItinerary, targetItem, dayIndex })
    // 대체 장소도 도시 bias 적용해서 지오코딩
    const cityCenter = city ? await geocodeCityCenter(city) : null
    const bias = cityCenter ? { center: cityCenter, radiusKm: 50 } : null
    const geocoded = await geocodeItems([replacement], city, bias)
    const validated = validateAndCleanItems(geocoded)
    if (validated.length === 0) {
      return res.status(500).json({ error: '유효한 대체 장소를 찾지 못했습니다.' })
    }
    res.json(validated[0])
  } catch (err) {
    console.error('장소 대체 오류:', err.message)
    res.status(500).json({ error: err.message || '장소 대체 중 오류가 발생했습니다.' })
  }
})

// 장소 추가
router.post('/add-place', async (req, res) => {
  const { currentItinerary, dayIndex, schedule, hotel } = req.body
  const city = currentItinerary?.city || currentItinerary?.trip_title?.match(/[가-힣a-zA-Z]+/)?.[0] || ''

  if (!currentItinerary || dayIndex === undefined) {
    return res.status(400).json({ error: '일정과 day 인덱스가 필요합니다.' })
  }

  try {
    const newItem = await addPlace({ currentItinerary, dayIndex })
    const cityCenter = city ? await geocodeCityCenter(city) : null
    const bias = cityCenter ? { center: cityCenter, radiusKm: 50 } : null
    const geocoded = await geocodeItems([newItem], city, bias)
    const validated = validateAndCleanItems(geocoded)
    if (validated.length === 0) {
      return res.status(500).json({ error: '유효한 장소를 찾지 못했습니다.' })
    }
    const day = currentItinerary.days[dayIndex]
    const existingItems = day.items.filter((i) => !i.isHotel)
    const reordered = reorderByDistance(
      validateAndCleanItems([...existingItems, validated[0]]),
      schedule, hotel,
    )
    const items = hotel ? [makeHotelItem(hotel, schedule), ...reordered] : reordered
    res.json(items)
  } catch (err) {
    console.error('장소 추가 오류:', err.message)
    res.status(500).json({ error: err.message || '장소 추가 중 오류가 발생했습니다.' })
  }
})

export default router
