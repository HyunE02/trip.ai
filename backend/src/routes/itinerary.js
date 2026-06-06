import express from 'express'
import { generateItinerary, replacePlace, addPlace } from '../services/deepseek.js'
import { validateAndCleanItems, reorderByDistance } from '../services/postprocess.js'
import { geocodeItems } from '../services/geocode.js'

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
    const raw = await generateItinerary({ city, days, companion, tags, budget, schedule, subOptions, restrictions, placesPerDay, hotel })

    // 모든 day의 items를 평탄화해서 한 번에 지오코딩 (Nominatim 순차 호출)
    const allItems = raw.days.flatMap((d) => d.items)
    console.log(`지오코딩 시작: ${allItems.length}개 장소 (약 ${Math.ceil(allItems.length * 0.6)}초 예상)`)
    const geocoded = await geocodeItems(allItems, city)

    // 지오코딩 결과를 다시 day별로 분배
    let gi = 0
    raw.days = raw.days.map((day) => ({
      ...day,
      items: day.items.map(() => geocoded[gi++]),
    }))

    // day별 후처리: 좌표 검증 + 동선 재정렬
    raw.days = raw.days.map((day) => {
      const cleaned   = validateAndCleanItems(day.items)
      const reordered = reorderByDistance(cleaned, schedule, hotel)
      const items     = hotel ? [makeHotelItem(hotel, schedule), ...reordered] : reordered
      return { ...day, items }
    })

    // 숙소도 지오코딩해서 지도에 표시
    if (hotel) {
      const hotelGeocoded = await geocodeItems([{ name: hotel, isHotel: true }], city)
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
  const city = currentItinerary?.trip_title?.match(/[가-힣a-zA-Z]+/)?.[0] || ''

  if (!currentItinerary || !targetItem) {
    return res.status(400).json({ error: '현재 일정과 교체 대상이 필요합니다.' })
  }

  try {
    const replacement = await replacePlace({ currentItinerary, targetItem, dayIndex })
    // 대체 장소도 지오코딩
    const geocoded = await geocodeItems([replacement], city)
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
  const city = currentItinerary?.days?.[0]?.items?.find((i) => !i.isHotel)?.reason || ''

  if (!currentItinerary || dayIndex === undefined) {
    return res.status(400).json({ error: '일정과 day 인덱스가 필요합니다.' })
  }

  try {
    const newItem = await addPlace({ currentItinerary, dayIndex })
    const geocoded = await geocodeItems([newItem], city)
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
