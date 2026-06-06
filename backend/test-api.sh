#!/bin/sh
# 백엔드 동작 확인용 테스트 스크립트

echo "=== health check ==="
curl -s http://localhost:3001/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/api/health

echo ""
echo "=== 일정 생성 테스트 (도쿄 2일) ==="
curl -s -X POST http://localhost:3001/api/itinerary/generate \
  -H "Content-Type: application/json" \
  -d '{
    "city": "도쿄",
    "days": 2,
    "companion": "couple",
    "tags": ["맛집", "역사"],
    "budget": "mid"
  }' | python3 -m json.tool 2>/dev/null || curl -s -X POST http://localhost:3001/api/itinerary/generate \
  -H "Content-Type: application/json" \
  -d '{"city":"도쿄","days":2,"companion":"couple","tags":["맛집","역사"],"budget":"mid"}'
