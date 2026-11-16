async function main() {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!key) {
    throw new Error('.env에 GEMINI_API_KEY를 설정해주세요.');
  }

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
          parts: [
            {
              text: '한국어로 "Gemini 연결 성공"이라고만 답해주세요.'
            }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const errorData = await response.json();

    const message = String(
    errorData.error?.message || '상세 메시지가 없습니다.'
    );

    console.error(
    'Google 오류 상세:',
    message.split(key).join('[키 숨김]')
    );

    console.log('요청한 모델:', model);
    const hints = {
      400: 'API 키 또는 요청 설정을 확인해주세요.',
      403: 'API 키 권한과 프로젝트 설정을 확인해주세요.',
      404: 'GEMINI_MODEL의 모델 이름과 사용 가능 여부를 확인해주세요.',
      429: '호출 한도 또는 사용 가능한 할당량을 확인해주세요.'
    };

    throw new Error(
      `Gemini HTTP ${response.status}: ` +
      (hints[response.status] || '잠시 후 다시 시도해주세요.')
    );
  }

  const data = await response.json();

  const text = data.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini에서 텍스트 응답을 받지 못했습니다.');
  }

  console.log('응답:', text);
}

main().catch((error) => {
  console.error('연결 테스트 실패:', error.message);
  process.exitCode = 1;
});