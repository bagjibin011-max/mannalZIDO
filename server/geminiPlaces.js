async function explainPlaces(candidates) {
  const key = process.env.GEMINI_API_KEY;
  const model =
    process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  if (!key) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.');
  }

  const input = candidates.map((place) => ({
    id: place.id,
    name: place.name,
    features: place.features,
    averageDistanceKm: place.averageDistanceKm,
    maxDistanceKm: place.maxDistanceKm
  }));

  const prompt = [
    '약속 장소 후보를 비교하는 설명을 작성하세요.',
    '아래 데이터에 있는 사실만 사용하세요.',
    '가게, 교통편, 영업시간, 분위기 등 없는 정보를 만들지 마세요.',
    '거리는 직선거리 근삿값이며 이동시간으로 해석하지 마세요.',
    '거리 정보가 없으면 그 부분은 설명하지 마세요.',
    '후보를 추가하거나 제외하지 마세요.',
    '각 후보마다 장점과 고려할 점을 한국어 1~2문장으로 쓰세요.',
    '설명은 각각 250자 이내로 작성하세요.',
    'JSON 객체의 키는 후보 id, 값은 설명 문자열이어야 합니다.',
    JSON.stringify(input)
  ].join('\n');

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }

  const data = await response.json();
  const result = data.candidates?.[0];

  if (result?.finishReason !== 'STOP') {
    throw new Error('AI 설명이 정상적으로 완료되지 않았습니다.');
  }

  const text = result.content?.parts
    ?.filter((part) =>
      !part.thought && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('');

  const explanations = JSON.parse(text || 'null');

  if (!explanations ||
      typeof explanations !== 'object' ||
      Array.isArray(explanations) ||
      Object.keys(explanations).length !== candidates.length) {
    throw new Error('AI 설명 형식이 올바르지 않습니다.');
  }

  const valid = candidates.every((place) =>
    Object.hasOwn(explanations, place.id) &&
    typeof explanations[place.id] === 'string' &&
    explanations[place.id].trim().length > 0 &&
    explanations[place.id].trim().length <= 250
  );

  if (!valid) {
    throw new Error('AI 후보 설명을 확인하지 못했습니다.');
  }

  return candidates.map((place) => ({
    ...place,
    aiDescription: explanations[place.id].trim()
  }));
}

module.exports = { explainPlaces };