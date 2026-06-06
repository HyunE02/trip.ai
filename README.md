# trip.ai

AI가 만들어주는 나만의 여행 일정 생성 서비스.

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 18, Vite, Leaflet (지도) |
| Backend | Node.js, Express |
| AI | DeepSeek API (`deepseek-chat`) |
| 지오코딩 | Google Geocoding API |
| 지도 | OpenStreetMap (Leaflet + react-leaflet) |
| 배포 | Docker, Docker Compose |

## 주요 기능

- **AI 일정 생성**: 도시, 기간, 동행 유형, 여행 취향, 예산, 숙소 입력 → DeepSeek이 상세 일정 생성
- **취향 세분화**: 맛집(음식 종류, 식이제한) / 자연 / 쇼핑 / 역사 / 액티비티별 세부 옵션
- **하루 일정 패턴**: 기상·점심·저녁·종료 시간 프리셋 또는 직접 설정
- **숙소 동선 반영**: 숙소 입력 시 매일 첫 일정이 숙소에서 출발하도록 자동 배치
- **정확한 위치**: Google Geocoding API로 실제 좌표 확인, 지도에 표시
- **동선 최적화**: Haversine 거리 기반 그리디 알고리즘으로 같은 날 장소들을 가깝게 재배열
- **일정 편집**: 드래그로 순서 변경, 장소 삭제, AI 대체 추천, 장소 추가 — 변경 시 시간 자동 재계산
- **지도 뷰**: 탭별 마커 + 동선 폴리라인, 팝업에서 좌표 출처 확인

## 환경 변수

루트에 `.env` 파일 생성:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
GOOGLE_GEOCODING_API_KEY=your_google_geocoding_api_key
```

- DeepSeek API 키: https://platform.deepseek.com
- Google Geocoding API 키: https://console.cloud.google.com → Geocoding API 활성화

## 실행 방법

### 개발 환경 (핫 리로드)

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### 프로덕션

```bash
docker compose up --build
```

- 서비스: http://localhost:5173

## 프로젝트 구조

```
trip.ai/
├── backend/
│   ├── src/
│   │   ├── index.js               # Express 서버 진입점
│   │   ├── routes/
│   │   │   └── itinerary.js       # /api/itinerary/* 라우트
│   │   └── services/
│   │       ├── deepseek.js        # DeepSeek API 호출, 프롬프트 빌더
│   │       ├── geocode.js         # Google Geocoding API
│   │       └── postprocess.js     # 좌표 검증, 동선 재정렬, 시간 배분
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── InputPage.jsx      # 여행 조건 입력 폼
│   │   │   └── ResultPage.jsx     # 일정 결과 + 편집
│   │   ├── components/
│   │   │   ├── DayTimeline.jsx    # 하루 일정 카드 목록
│   │   │   ├── PlaceCard.jsx      # 장소 카드 (드래그, 삭제, 대체)
│   │   │   └── MapView.jsx        # Leaflet 지도
│   │   └── hooks/
│   │       └── useLocalStorage.js
│   ├── Dockerfile
│   └── Dockerfile.dev
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/itinerary/generate` | 여행 일정 생성 |
| POST | `/api/itinerary/replace` | 특정 장소 AI 대체 추천 |
| POST | `/api/itinerary/add-place` | 하루 일정에 장소 추가 |
