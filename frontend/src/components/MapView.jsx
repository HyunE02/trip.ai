import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styles from './MapView.module.css'

// Vite/webpack 환경에서 Leaflet 기본 마커 아이콘 경로 깨짐 방지
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DAY_COLORS = [
  '#6c63ff', '#ff6584', '#43c6ac', '#f7971e',
  '#c471ed', '#12c2e9', '#f64f59',
]

export default function MapView({ days, selectedDay }) {
  const mapRef = useRef(null)
  const instanceRef = useRef(null)
  const layersRef = useRef([])

  // 지도 초기화 (마운트 1회)
  useEffect(() => {
    if (instanceRef.current) return

    // 숙소 항목(lat:null)은 건너뛰고 실제 좌표가 있는 첫 장소로 중심 설정
    const firstItem = days[0]?.items?.find((i) => !i.isHotel && i.lat != null && i.lng != null)
    const center = firstItem ? [firstItem.lat, firstItem.lng] : [35.6762, 139.6503]

    const map = L.map(mapRef.current, { center, zoom: 13 })
    instanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // 컨테이너 크기 확정 후 지도 사이즈 반영
    setTimeout(() => map.invalidateSize(), 150)

    return () => {
      map.remove()
      instanceRef.current = null
    }
  }, [])

  // days / selectedDay 바뀔 때 레이어만 갱신
  useEffect(() => {
    const map = instanceRef.current
    if (!map) return

    layersRef.current.forEach((l) => l.remove())
    layersRef.current = []

    const day = days[selectedDay]
    if (!day || day.items.length === 0) return

    const color = DAY_COLORS[selectedDay % DAY_COLORS.length]
    const latlngs = []

    // 좌표 있는 항목만 렌더링 (숙소 포함, lat/lng null 제외)
    const mapItems = day.items.filter((i) => i.lat != null && i.lng != null)
    let activityIdx = 0  // 숙소 제외 순번

    mapItems.forEach((item) => {
      const pos = [item.lat, item.lng]
      if (!item.isHotel) latlngs.push(pos)

      const isHotel = item.isHotel
      const label = isHotel ? '🏨' : String(++activityIdx)
      const bg    = isHotel ? '#444' : color
      const size  = isHotel ? 32 : 28

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${bg};color:#fff;
          width:${size}px;height:${size}px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:${isHotel ? '14px' : '12px'};font-weight:700;
          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);
        ">${label}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      })

      const confColor = { high: '#4caf87', medium: '#f0a500', low: '#e05c5c' }[item.confidence] || '#f0a500'
      const confLabel = { high: '정보 확실', medium: '정보 보통', low: '정보 불확실' }[item.confidence] || ''
      const coordNote = item.geocoded
        ? '<div style="font-size:10px;color:#4caf87;margin-top:4px">✓ OpenStreetMap 실제 좌표</div>'
        : '<div style="font-size:10px;color:#aaa;margin-top:4px">※ AI 생성 좌표 (대략적)</div>'

      const marker = L.marker(pos, { icon }).addTo(map)
      marker.bindPopup(`
        <div style="font-family:sans-serif;min-width:160px">
          <b style="font-size:14px">${item.name}</b>
          <div style="color:#888;font-size:12px;margin:4px 0">${item.category} · ${item.start_time}${item.duration_min ? ` · ${item.duration_min}분` : ''}</div>
          ${item.reason ? `<div style="font-size:12px;margin-bottom:4px">${item.reason}</div>` : ''}
          ${!isHotel ? `<div style="font-size:11px;color:${confColor}">${confLabel}</div>` : ''}
          ${coordNote}
        </div>
      `, { maxWidth: 240 })

      layersRef.current.push(marker)
    })

    if (latlngs.length > 1) {
      const poly = L.polyline(latlngs, {
        color, weight: 3, opacity: 0.85, dashArray: '6, 6',
      }).addTo(map)
      layersRef.current.push(poly)
    }

    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [48, 48], maxZoom: 15 })
    }
  }, [days, selectedDay])

  return (
    <div className={styles.wrap}>
      <div ref={mapRef} className={styles.map} />
      <div className={styles.notice}>
        ※ 좌표는 AI가 생성한 대략적 값입니다. 실제 위치와 다를 수 있습니다.
      </div>
    </div>
  )
}
