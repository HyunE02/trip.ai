import React, { useState } from 'react'
import PlaceCard from './PlaceCard.jsx'
import styles from './DayTimeline.module.css'

export default function DayTimeline({ day, dayIdx, itinerary, onDelete, onReorder, onReplace }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  if (!day || day.items.length === 0) {
    return (
      <div className={styles.empty}>
        <p>이 날의 일정이 비어 있습니다.</p>
      </div>
    )
  }

  async function handleReplace(dayIdx, itemIdx) {
    const targetItem = itinerary.days[dayIdx].items[itemIdx]
    const res = await fetch('/api/itinerary/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentItinerary: itinerary, targetItem, dayIndex: dayIdx }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || '대체 장소를 찾지 못했습니다.')
    }
    const newItem = await res.json()
    onReplace(dayIdx, itemIdx, newItem)
  }

  function handleDragStart(idx) {
    setDragIdx(idx)
  }

  function handleDragOver(e, idx) {
    e.preventDefault()
    if (idx !== dragIdx) setDragOverIdx(idx)
  }

  function handleDrop(targetIdx) {
    if (dragIdx !== null && dragIdx !== targetIdx) {
      onReorder(dayIdx, dragIdx, targetIdx)
    }
    setDragIdx(null)
    setDragOverIdx(null)
  }

  function handleDragEnd() {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.dayLabel}>Day {day.day}</span>
        <span className={styles.theme}>{day.theme}</span>
        <span className={styles.count}>{day.items.length}곳</span>
      </div>

      <div className={styles.list}>
        {day.items.map((item, itemIdx) => (
          <PlaceCard
            key={`${item.name}-${itemIdx}`}
            item={item}
            index={itemIdx}
            dayIdx={dayIdx}
            itemIdx={itemIdx}
            total={day.items.length}
            isDragging={dragIdx === itemIdx}
            isDragOver={dragOverIdx === itemIdx}
            onDelete={onDelete}
            onReplace={handleReplace}
            onDragStart={() => handleDragStart(itemIdx)}
            onDragOver={(e) => handleDragOver(e, itemIdx)}
            onDrop={() => handleDrop(itemIdx)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  )
}
