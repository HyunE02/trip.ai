import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

const MAX_RETRY = 3

function tryParseJson(content) {
  if (!content) throw new Error('응답 content가 비어 있습니다.')
  const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(cleaned)
}

function buildScheduleDescription(schedule, hotel) {
  if (!schedule) return '기상 9시, 첫 활동 10시, 점심 13시, 저녁 19시, 22시 마무리'
  const firstActivity = schedule.start + (hotel ? 1 : 0) // 숙소 있으면 기상+1시간 후 첫 활동
  return `기상 ${schedule.start}시, 첫 활동 ${firstActivity}시, 점심 ${schedule.lunch}시, 저녁 ${schedule.dinner}시, ${schedule.end}시 마무리`
}

function buildPreferenceDescription(tags, subOptions, restrictions) {
  const lines = []
  if (tags?.length > 0) {
    tags.forEach((tag) => {
      const subs = subOptions?.[tag]
      lines.push(subs?.length > 0 ? `- ${tag}: ${subs.join(', ')} 위주` : `- ${tag}`)
    })
  }
  if (restrictions?.length > 0) lines.push(`- 식이제한: ${restrictions.join(', ')}`)
  return lines.length > 0 ? lines.join('\n') : '특별한 취향 없음'
}

function buildItineraryPrompt({ city, days, companion, tags, budget, schedule, subOptions, restrictions, placesPerDay, hotel }) {
  const companionMap = { solo: '혼자', couple: '커플', family: '가족', friends: '친구' }
  const budgetMap    = { low: '저예산', mid: '중간', high: '고예산' }
  const perDay       = placesPerDay || 5
  const scheduleDesc = buildScheduleDescription(schedule, hotel)
  const prefDesc     = buildPreferenceDescription(tags, subOptions, restrictions)

  const hotelLine = hotel
    ? `- 숙소: ${hotel} (첫째 날 첫 일정은 숙소 근처에서 시작, 마지막 날 마지막 일정은 숙소로 복귀하기 편한 위치에서 끝낼 것)`
    : ''

  return `당신은 여행 플래너 전문가입니다. 아래 조건에 맞게 여행 일정을 JSON으로 생성해주세요.

[여행 조건]
- 목적지: ${city}
- 기간: ${days}일
- 동행: ${companionMap[companion] || companion}
- 예산: ${budgetMap[budget] || budget}
- 하루 일정 패턴: ${scheduleDesc}
- 하루 방문 장소 수: ${perDay}곳
${hotelLine}

[여행 취향 상세]
${prefDesc}

[일정 생성 규칙]
1. 유명하고 실제로 잘 알려진 장소만 포함 (불확실하면 제외)
2. 하루 정확히 ${perDay}곳 (식당 포함)
3. 반드시 점심(${schedule?.lunch ?? 13}:00 ± 30분)과 저녁(${schedule?.dinner ?? 19}:00 ± 30분) 시간대에 식당을 각 1곳씩 배치할 것
4. 첫 장소의 start_time은 반드시 ${(schedule?.start ?? 9) + (hotel ? 1 : 0)}:00으로 설정할 것 (기상 후 이동 시간 포함)
5. 각 장소의 start_time은 이전 장소 종료 시간 + 20분 이동 시간을 더해 계산할 것
6. 같은 날 장소끼리 지리적으로 가깝게 묶어 동선 최소화
7. 식이제한이 있다면 해당 음식 관련 장소 제외
8. 취향 세부 옵션에 맞는 장소 우선 선택
9. confidence: 확실하면 "high", 약간 불확실하면 "medium", 불확실하면 "low"

반드시 아래 JSON 스키마를 정확히 따르세요:
{
  "trip_title": "string",
  "days": [
    {
      "day": 1,
      "theme": "string",
      "items": [
        {
          "name": "string",
          "en_name": "English or romanized name for geocoding (e.g. 'Meiji Shrine', 'Senso-ji Temple')",
          "category": "string",
          "lat": 0.0,
          "lng": 0.0,
          "start_time": "09:00",
          "duration_min": 90,
          "reason": "한 줄 이유",
          "confidence": "high|medium|low"
        }
      ]
    }
  ]
}

json 형식으로만 응답하세요. 순수 JSON만 출력하세요.`
}

function buildReplacePrompt({ currentItinerary, targetItem, dayIndex }) {
  return `당신은 여행 플래너 전문가입니다. 기존 여행 일정에서 특정 장소를 대체할 장소 1개를 JSON으로 추천해주세요.

기존 일정 (Day ${dayIndex + 1}):
${JSON.stringify(currentItinerary.days[dayIndex]?.items?.map((i) => i.name) || [])}

교체 대상: ${targetItem.name} (카테고리: ${targetItem.category}, 위치: ${targetItem.lat}, ${targetItem.lng})

조건: 같은 카테고리, 비슷한 위치, 기존 일정에 없는 장소, 유명하고 확실한 곳

JSON 스키마:
{"name":"string","category":"string","lat":0.0,"lng":0.0,"start_time":"10:00","duration_min":90,"reason":"한 줄 이유","confidence":"high|medium|low"}

순수 JSON만 출력하세요.`
}

function buildAddPlacePrompt({ currentItinerary, dayIndex }) {
  const day = currentItinerary.days[dayIndex]
  const existingNames = day?.items?.map((i) => i.name) || []
  const lastItem = day?.items?.at(-1)

  return `당신은 여행 플래너 전문가입니다. 기존 여행 일정에 장소 1개를 추가 추천해주세요.

기존 Day ${dayIndex + 1} 일정:
${JSON.stringify(existingNames)}

마지막 장소 근처(${lastItem?.lat ?? 0}, ${lastItem?.lng ?? 0})에서 방문하기 좋은 곳,
기존 일정에 없는 유명하고 확실한 장소를 1개 추천하세요.

JSON 스키마:
{"name":"string","category":"string","lat":0.0,"lng":0.0,"start_time":"10:00","duration_min":90,"reason":"한 줄 이유","confidence":"high|medium|low"}

순수 JSON만 출력하세요.`
}

async function callDeepSeek(prompt, retryCount = 0) {
  try {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
      temperature: 0.7,
    })
    const content = response.choices?.[0]?.message?.content
    return tryParseJson(content)
  } catch (err) {
    if (retryCount < MAX_RETRY - 1) {
      console.warn(`DeepSeek 재시도 (${retryCount + 1}/${MAX_RETRY}):`, err.message)
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)))
      return callDeepSeek(prompt, retryCount + 1)
    }
    throw new Error(`DeepSeek API 호출 실패: ${err.message}`)
  }
}

export async function generateItinerary(params) {
  const result = await callDeepSeek(buildItineraryPrompt(params))
  if (!result.days || !Array.isArray(result.days)) throw new Error('응답 형식이 올바르지 않습니다.')
  return result
}

export async function replacePlace(params) {
  const result = await callDeepSeek(buildReplacePrompt(params))
  if (!result.name || result.lat === undefined) throw new Error('대체 장소 응답 형식이 올바르지 않습니다.')
  return result
}

export async function addPlace(params) {
  const result = await callDeepSeek(buildAddPlacePrompt(params))
  if (!result.name || result.lat === undefined) throw new Error('추가 장소 응답 형식이 올바르지 않습니다.')
  return result
}
