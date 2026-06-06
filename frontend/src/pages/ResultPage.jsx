import React, { useState, useCallback } from 'react'
import DayTimeline from '../components/DayTimeline.jsx'
import MapView from '../components/MapView.jsx'
import styles from './ResultPage.module.css'

function timeToMinutes(t = '09:00') {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function minutesToTime(min) {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 순서 변경 후 start_time 재계산
function recalculateTimes(items, schedule, hotel) {
  const TRAVEL = 20
  const HOTEL_BUFFER = hotel ? 60 : 0
  const wakeMin   = (schedule?.start  ?? 9)  * 60
  const lunchMin  = (schedule?.lunch  ?? 13) * 60
  const dinnerMin = (schedule?.dinner ?? 19) * 60

  let cur = wakeMin
  return items.map((item, idx) => {
    if (item.isHotel) {
      // 숙소 항목은 항상 기상 시간 고정
      cur = wakeMin
      return { ...item, start_time: minutesToTime(cur) }
    }
    // 첫 번째 일반 항목: 기상 + 준비·이동 버퍼
    if (idx === 0 || (idx === 1 && items[0]?.isHotel)) {
      cur = wakeMin + HOTEL_BUFFER
    } else {
      cur += (items[idx - 1].duration_min || 60) + TRAVEL
    }
    // 점심·저녁 스냅 (현재 시간이 목표보다 이른 경우만)
    if (Math.abs(timeToMinutes(item.start_time) - lunchMin) <= 90)  cur = Math.max(cur, lunchMin)
    if (Math.abs(timeToMinutes(item.start_time) - dinnerMin) <= 90) cur = Math.max(cur, dinnerMin)
    return { ...item, start_time: minutesToTime(cur) }
  })
}

export default function ResultPage({ itinerary, inputParams, onBack, onItineraryChange }) {
  const [selectedDay, setSelectedDay] = useState(0)
  const [toast, setToast] = useState(null)
  const [addingPlace, setAddingPlace] = useState(false)

  const { schedule, hotel } = inputParams

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function updateDay(dayIdx, newItems) {
    onItineraryChange({
      ...itinerary,
      days: itinerary.days.map((d, di) =>
        di !== dayIdx ? d : { ...d, items: newItems }
      ),
    })
  }

  // 장소 삭제 (숙소 항목은 삭제 불가)
  const handleDelete = useCallback((dayIdx, itemIdx) => {
    const item = itinerary.days[dayIdx].items[itemIdx]
    if (item.isHotel) return
    const newItems = itinerary.days[dayIdx].items.filter((_, ii) => ii !== itemIdx)
    updateDay(dayIdx, recalculateTimes(newItems, schedule, hotel))
    showToast(`"${item.name}" 삭제됨`)
  }, [itinerary, schedule, hotel])

  // 드래그 순서 변경 후 시간 재계산
  const handleReorder = useCallback((dayIdx, fromIdx, toIdx) => {
    const items = itinerary.days[dayIdx].items
    // 숙소(index 0)는 이동 불가
    if (items[fromIdx]?.isHotel) return
    if (toIdx === 0 && items[0]?.isHotel) return
    if (toIdx < 0 || toIdx >= items.length) return

    const next = [...items]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    updateDay(dayIdx, recalculateTimes(next, schedule, hotel))
  }, [itinerary, schedule, hotel])

  // 장소 대체
  const handleReplace = useCallback((dayIdx, itemIdx, newItem) => {
    const old = itinerary.days[dayIdx].items[itemIdx]
    const next = itinerary.days[dayIdx].items.map((it, ii) => ii === itemIdx ? newItem : it)
    updateDay(dayIdx, recalculateTimes(next, schedule, hotel))
    showToast(`"${old.name}" → "${newItem.name}" 대체 완료`)
  }, [itinerary, schedule, hotel])

  // 마지막 장소 제거 (숙소 제외)
  function handleRemoveLastPlace(dayIdx) {
    const items = itinerary.days[dayIdx].items
    const lastReal = [...items].reverse().find((i) => !i.isHotel)
    if (!lastReal) return
    const next = items.filter((i) => i !== lastReal)
    updateDay(dayIdx, recalculateTimes(next, schedule, hotel))
    showToast(`"${lastReal.name}" 삭제됨`)
  }

  // 장소 추가
  async function handleAddPlace(dayIdx) {
    setAddingPlace(true)
    try {
      const res = await fetch('/api/itinerary/add-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentItinerary: itinerary, dayIndex: dayIdx, schedule, hotel }),
      })
      if (!res.ok) throw new Error((await res.json()).error || '장소 추가 실패')
      const newItems = await res.json()
      updateDay(dayIdx, newItems)
      showToast('장소 1곳 추가됨')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAddingPlace(false)
    }
  }

  const companionLabel = { solo: '혼자', couple: '커플', family: '가족', friends: '친구' }
  const currentDay = itinerary.days[selectedDay]
  const realPlaces = currentDay?.items?.filter((i) => !i.isHotel) ?? []

  return (
    <div className={styles.page}>
      {toast && (
        <div className={`${styles.toast} ${styles[toast.type]}`}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>← 다시 입력</button>
        <div className={styles.titleWrap}>
          <span className={styles.logo}>✈ trip.ai</span>
          <h1 className={styles.title}>{itinerary.trip_title}</h1>
        </div>
        <div className={styles.meta}>
          {inputParams.city} · {inputParams.days}일 · {companionLabel[inputParams.companion] || inputParams.companion}
        </div>
      </header>

      <div className={styles.dayTabs}>
        {itinerary.days.map((day, idx) => (
          <button key={idx}
            className={`${styles.dayTab} ${selectedDay === idx ? styles.dayTabActive : ''}`}
            onClick={() => setSelectedDay(idx)}>
            <span className={styles.dayNum}>Day {day.day}</span>
            <span className={styles.dayTheme}>{day.theme}</span>
          </button>
        ))}
      </div>

      {/* 장소 수 조절 */}
      <div className={styles.placeCountBar}>
        <span className={styles.placeCountLabel}>
          Day {currentDay?.day} · <strong>{realPlaces.length}곳</strong>
        </span>
        <div className={styles.placeCountControls}>
          <button className={styles.countBtn}
            onClick={() => handleRemoveLastPlace(selectedDay)}
            disabled={realPlaces.length <= 1} title="마지막 장소 제거">−</button>
          <span className={styles.countDisplay}>{realPlaces.length}</span>
          <button className={`${styles.countBtn} ${styles.countBtnAdd}`}
            onClick={() => handleAddPlace(selectedDay)}
            disabled={addingPlace} title="장소 추가 (AI 추천)">
            {addingPlace ? '⏳' : '+'}
          </button>
        </div>
        {addingPlace && <span className={styles.addingNote}>AI가 장소를 추천 중...</span>}
      </div>

      <div className={styles.body}>
        <aside className={styles.timeline}>
          <DayTimeline
            day={currentDay}
            dayIdx={selectedDay}
            itinerary={itinerary}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onReplace={handleReplace}
          />
        </aside>
        <main className={styles.map}>
          <MapView days={itinerary.days} selectedDay={selectedDay} />
        </main>
      </div>
    </div>
  )
}
