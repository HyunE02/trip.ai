import React, { useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import styles from './InputPage.module.css'

const COMPANIONS = [
  { value: 'solo',    label: '혼자',  icon: '🧍' },
  { value: 'couple',  label: '커플',  icon: '👫' },
  { value: 'family',  label: '가족',  icon: '👨‍👩‍👧' },
  { value: 'friends', label: '친구',  icon: '👯' },
]

const BUDGETS = [
  { value: 'low',  label: '절약',     desc: '가성비 우선' },
  { value: 'mid',  label: '보통',     desc: '적당하게' },
  { value: 'high', label: '여유롭게', desc: '퀄리티 우선' },
]

const SCHEDULE_PRESETS = [
  { value: 'early',  label: '🌅 일찍 시작',  desc: '기상 7시 · 점심 12시 · 저녁 18시', start: 7,  lunch: 12, dinner: 18, end: 21 },
  { value: 'normal', label: '☀️ 보통',        desc: '기상 9시 · 점심 13시 · 저녁 19시', start: 9,  lunch: 13, dinner: 19, end: 22 },
  { value: 'late',   label: '🌙 느긋하게',   desc: '기상 10시 · 점심 14시 · 저녁 20시', start: 10, lunch: 14, dinner: 20, end: 23 },
  { value: 'custom', label: '✏️ 직접 설정',  desc: '시간을 직접 입력' },
]

const TAGS_CONFIG = {
  맛집: {
    icon: '🍜',
    sub: {
      label: '어떤 음식?',
      options: ['현지식', '길거리음식', '카페/디저트', '파인다이닝', '술집/바'],
    },
    restrict: {
      label: '못 먹는 것',
      options: ['채식/비건', '돼지고기 제외', '소고기 제외', '해산물 제외', '유제품 제외', '견과류 제외'],
    },
  },
  자연: {
    icon: '🌿',
    sub: {
      label: '어떤 자연?',
      options: ['도심 공원', '등산/트레킹', '바다/해변', '야경 포인트', '정원/식물원'],
    },
  },
  쇼핑: {
    icon: '🛍️',
    sub: {
      label: '어떤 쇼핑?',
      options: ['로컬마켓', '명품/백화점', '편집샵/로컬브랜드', '기념품', '드럭스토어/마트'],
    },
  },
  역사: {
    icon: '🏛️',
    sub: {
      label: '어떤 역사?',
      options: ['박물관/미술관', '사원/신사', '궁궐/고궁', '역사 거리', '유네스코 유산'],
    },
  },
  액티비티: {
    icon: '🎯',
    sub: {
      label: '어떤 액티비티?',
      options: ['문화 체험', '스포츠/레저', '테마파크', '야외 투어', '쿠킹클래스'],
    },
  },
}

const DEFAULT_PREFS = {
  companion: 'couple',
  tags: [],
  budget: 'mid',
  schedule: { preset: 'normal', start: 9, lunch: 13, dinner: 19, end: 22 },
  subOptions: {},
  restrictions: [],
  placesPerDay: 5,
}

export default function InputPage({ onGenerate }) {
  const [city, setCity] = useState('')
  const [days, setDays] = useState(3)
  const [hotel, setHotel] = useState('')
  const [prefs, setPrefs] = useLocalStorage('trip-ai-prefs', DEFAULT_PREFS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { companion, tags, budget, schedule, subOptions, restrictions, placesPerDay } = prefs

  function update(patch) {
    setPrefs((p) => ({ ...p, ...patch }))
  }

  function toggleTag(tag) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    // 태그 제거 시 해당 서브옵션도 초기화
    if (tags.includes(tag)) {
      const nextSub = { ...subOptions }
      delete nextSub[tag]
      update({ tags: next, subOptions: nextSub })
    } else {
      update({ tags: next })
    }
  }

  function toggleSubOption(tag, opt) {
    const curr = subOptions[tag] || []
    const next = curr.includes(opt) ? curr.filter((o) => o !== opt) : [...curr, opt]
    update({ subOptions: { ...subOptions, [tag]: next } })
  }

  function toggleRestriction(opt) {
    const next = restrictions.includes(opt)
      ? restrictions.filter((r) => r !== opt)
      : [...restrictions, opt]
    update({ restrictions: next })
  }

  function setSchedulePreset(preset) {
    const found = SCHEDULE_PRESETS.find((p) => p.value === preset)
    if (found && preset !== 'custom') {
      update({ schedule: { preset, start: found.start, lunch: found.lunch, dinner: found.dinner, end: found.end } })
    } else {
      update({ schedule: { ...schedule, preset: 'custom' } })
    }
  }

  function setScheduleTime(field, val) {
    update({ schedule: { ...schedule, preset: 'custom', [field]: Number(val) } })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!city.trim()) { setError('목적지를 입력해주세요.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/itinerary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, days, companion, tags, budget, schedule, subOptions, restrictions, placesPerDay, hotel }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '일정 생성 실패')
      }
      onGenerate(await res.json(), { city, days, companion, tags, budget, schedule, hotel })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>✈ trip.ai</div>
        <p className={styles.tagline}>AI가 만들어주는 나만의 여행 일정</p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>

        {/* 목적지 */}
        <div className={styles.field}>
          <label className={styles.label}>어디로 떠나시나요?</label>
          <input
            className={styles.input}
            type="text"
            placeholder="예: 도쿄, 파리, 방콕"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        {/* 숙소 */}
        <div className={styles.field}>
          <label className={styles.label}>
            숙소
            <span className={styles.hint}>입력 시 동선에 반영</span>
          </label>
          <input
            className={styles.input}
            type="text"
            placeholder="예: 신주쿠역 근처, 시부야 APA 호텔"
            value={hotel}
            onChange={(e) => setHotel(e.target.value)}
          />
        </div>

        {/* 기간 */}
        <div className={styles.field}>
          <label className={styles.label}>
            여행 기간
            <span className={styles.badge}>{days}일</span>
          </label>
          <input
            className={styles.range}
            type="range" min={1} max={10} value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
          <div className={styles.rangeLabels}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => (
              <span key={d} className={days === d ? styles.rangeActive : ''}>{d}</span>
            ))}
          </div>
        </div>

        {/* 동행 */}
        <div className={styles.field}>
          <label className={styles.label}>누구와 함께?</label>
          <div className={styles.chips}>
            {COMPANIONS.map((c) => (
              <button key={c.value} type="button"
                className={`${styles.chip} ${companion === c.value ? styles.chipActive : ''}`}
                onClick={() => update({ companion: c.value })}>
                <span className={styles.chipIcon}>{c.icon}</span>{c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 하루 일정 패턴 */}
        <div className={styles.field}>
          <label className={styles.label}>하루 일정 패턴</label>
          <div className={styles.scheduleGrid}>
            {SCHEDULE_PRESETS.map((p) => (
              <button key={p.value} type="button"
                className={`${styles.scheduleBtn} ${schedule.preset === p.value ? styles.scheduleBtnActive : ''}`}
                onClick={() => setSchedulePreset(p.value)}>
                <span className={styles.scheduleLabel}>{p.label}</span>
                <span className={styles.scheduleDesc}>{p.desc}</span>
              </button>
            ))}
          </div>
          {schedule.preset === 'custom' && (
            <div className={styles.customTimes}>
              {[
                { field: 'start',  label: '기상' },
                { field: 'lunch',  label: '점심' },
                { field: 'dinner', label: '저녁' },
                { field: 'end',    label: '종료' },
              ].map(({ field, label }) => (
                <label key={field} className={styles.timeField}>
                  <span>{label}</span>
                  <input type="number" min={0} max={23}
                    value={schedule[field]}
                    onChange={(e) => setScheduleTime(field, e.target.value)}
                    className={styles.timeInput}
                  />
                  <span>시</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 여행 취향 + 세분화 */}
        <div className={styles.field}>
          <label className={styles.label}>
            여행 취향
            <span className={styles.hint}>복수 선택 가능</span>
          </label>
          <div className={styles.chips}>
            {Object.entries(TAGS_CONFIG).map(([tag, cfg]) => (
              <button key={tag} type="button"
                className={`${styles.chip} ${tags.includes(tag) ? styles.chipActive : ''}`}
                onClick={() => toggleTag(tag)}>
                <span className={styles.chipIcon}>{cfg.icon}</span>{tag}
              </button>
            ))}
          </div>

          {/* 선택된 태그의 서브옵션 */}
          {tags.map((tag) => {
            const cfg = TAGS_CONFIG[tag]
            if (!cfg) return null
            return (
              <div key={tag} className={styles.subSection}>
                <div className={styles.subLabel}>{cfg.icon} {tag} — {cfg.sub.label}</div>
                <div className={styles.subChips}>
                  {cfg.sub.options.map((opt) => (
                    <button key={opt} type="button"
                      className={`${styles.subChip} ${(subOptions[tag] || []).includes(opt) ? styles.subChipActive : ''}`}
                      onClick={() => toggleSubOption(tag, opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
                {/* 맛집만 식이제한 추가 */}
                {tag === '맛집' && cfg.restrict && (
                  <>
                    <div className={styles.subLabel} style={{ marginTop: 10 }}>🚫 {cfg.restrict.label}</div>
                    <div className={styles.subChips}>
                      {cfg.restrict.options.map((opt) => (
                        <button key={opt} type="button"
                          className={`${styles.subChip} ${styles.restrictChip} ${restrictions.includes(opt) ? styles.restrictChipActive : ''}`}
                          onClick={() => toggleRestriction(opt)}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* 하루 장소 수 */}
        <div className={styles.field}>
          <label className={styles.label}>
            하루 방문 장소 수
            <span className={styles.badge}>{placesPerDay}곳</span>
          </label>
          <input
            className={styles.range}
            type="range" min={3} max={7} value={placesPerDay}
            onChange={(e) => update({ placesPerDay: Number(e.target.value) })}
          />
          <div className={styles.rangeLabels}>
            {[3, 4, 5, 6, 7].map((n) => (
              <span key={n} className={placesPerDay === n ? styles.rangeActive : ''}>{n}곳</span>
            ))}
          </div>
        </div>

        {/* 예산 */}
        <div className={styles.field}>
          <label className={styles.label}>예산대</label>
          <div className={styles.budgets}>
            {BUDGETS.map((b) => (
              <button key={b.value} type="button"
                className={`${styles.budgetBtn} ${budget === b.value ? styles.budgetActive : ''}`}
                onClick={() => update({ budget: b.value })}>
                <span className={styles.budgetLabel}>{b.label}</span>
                <span className={styles.budgetDesc}>{b.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? (
            <span className={styles.loadingWrap}>
              <span className={styles.spinner} />
              AI가 일정을 만들고 있어요...
            </span>
          ) : '일정 생성하기 →'}
        </button>

        {loading && (
          <p className={styles.loadingNote}>
            AI 일정 생성 후 각 장소의 실제 위치를 OpenStreetMap으로 확인 중입니다.<br />
            장소 수에 따라 30~60초 정도 걸릴 수 있어요.
          </p>
        )}
      </form>
    </div>
  )
}
