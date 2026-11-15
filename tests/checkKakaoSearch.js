async function main() {
  const key = process.env.KAKAO_REST_API_KEY;

  if (!key) {
    throw new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
  }

  const url = new URL(
    'https://dapi.kakao.com/v2/local/search/keyword.json'
  );

  url.searchParams.set('query', '광운대학교');
  url.searchParams.set('size', '5');

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${key}`
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`카카오 장소 검색 실패: HTTP ${response.status}`);
  }

  const data = await response.json();

  console.table(
    data.documents.map((place) => ({
      이름: place.place_name,
      주소: place.road_address_name || place.address_name,
      위도: Number(place.y),
      경도: Number(place.x)
    }))
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});