import React, { useState } from 'react'
import styles from './PlaceCard.module.css'

const CATEGORY_ICONS = {
  역사: '🏛️', 맛집: '🍜', 쇼핑: '🛍️', 자연: '🌿',
  액티비티: '🎯', 명소: '📸', 카페: '☕', 숙소: '🏨',
}

const CONFIDENCE_CONFIG = {
  high:   { label: '정보 확실', color: '#4caf87' },
  medium: { label: '정보 보통', color: '#f0a500' },
  low:    { label: '정보 불확실', color: '#e05c5c' },
}

export default function PlaceCard({
  item, index, dayIdx, itemIdx, total,
  isDragging, isDragOver,
  onDelete, onReplace,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const [replacing, setReplacing] = useState(false)
  const [replaceError, setReplaceError] = useState('')
  const conf = CONFIDENCE_CONFIG[item.confidence] || CONFIDENCE_CONFIG.medium
  const categoryIcon = item.isHotel ? '🏨' : (CATEGORY_ICONS[item.category] || '📍')
  const isHotel = !!item.isHotel

  async function handleReplace() {
    setReplacing(true)
    setReplaceError('')
    try {
      await onReplace(dayIdx, itemIdx)
    } catch (err) {
      setReplaceError(err.message)
    } finally {
      setReplacing(false)
    }
  }

  return (
    <div
      className={`${styles.card} ${isDragging ? styles.dragging : ''} ${isDragOver ? styles.dragOver : ''} ${isHotel ? styles.hotelCard : ''}`}
      draggable={!isHotel}
      onDragStart={isHotel ? undefined : onDragStart}
      onDragOver={isHotel ? undefined : onDragOver}
      onDrop={isHotel ? undefined : onDrop}
      onDragEnd={isHotel ? undefined : onDragEnd}
    >
      {/* 타임라인 인디케이터 */}
      <div className={styles.timelineCol}>
        <div className={styles.dot} style={{ background: `hsl(${(dayIdx * 60 + index * 40) % 360}, 70%, 65%)` }} />
        {index < total - 1 && <div className={styles.line} />}
      </div>

      {/* 카드 본문 */}
      <div className={styles.content}>
        {/* 드래그 핸들 + 상단 행 */}
        <div className={styles.topRow}>
          {!isHotel && <span className={styles.dragHandle} title="드래그하여 순서 변경">⠿</span>}
          <span className={styles.time}>{item.start_time}</span>
          <span className={styles.duration}>{item.duration_min}분</span>
          <span className={styles.confidence} style={{ color: conf.color, borderColor: conf.color }}>
            {conf.label}
          </span>
        </div>

        <div className={styles.nameRow}>
          <span className={styles.icon}>{categoryIcon}</span>
          <span className={styles.name}>{item.name}</span>
        </div>

        <div className={styles.category}>{item.category}</div>
        <p className={styles.reason}>{item.reason}</p>

        {item.confidence === 'low' && (
          <div className={styles.warning}>⚠ 이 장소는 정보가 불확실할 수 있습니다</div>
        )}

        {!isHotel && (
          <div className={item.geocoded ? styles.coordOk : styles.coordApprox}>
            {item.geocoded ? '✓ 실제 위치 확인됨' : '📍 AI 생성 좌표 (대략적)'}
          </div>
        )}

        {replaceError && (
          <div className={styles.replaceError}>⚠ {replaceError}</div>
        )}

        {/* 숙소 항목은 액션 없음 */}
        {!isHotel && (
          <div className={styles.actions}>
            <button
              className={`${styles.actionBtn} ${styles.replaceBtn}`}
              onClick={handleReplace}
              disabled={replacing}
            >
              {replacing ? '🔄 검색 중...' : '🔄 대체 추천'}
            </button>
            <button
              className={`${styles.actionBtn} ${styles.deleteBtn}`}
              onClick={() => onDelete(dayIdx, itemIdx)}
            >
              ✕ 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
