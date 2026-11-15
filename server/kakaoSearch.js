async function searchOrigins(query, type) {
  const key = process.env.KAKAO_REST_API_KEY;

  if (!key) {
    throw new Error('서버에 카카오 REST API 키가 설정되지 않았습니다.');
  }

  const endpoint = type === 'address' ? 'address' : 'keyword';

  const url = new URL(
    `https://dapi.kakao.com/v2/local/search/${endpoint}.json`
  );

  url.searchParams.set('query', query);
  url.searchParams.set('size', '10');

  let response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${key}`
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error('장소 검색 서버에 연결하지 못했습니다. 다시 시도해주세요.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('검색 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
    }

    throw new Error(`카카오 검색 실패: HTTP ${response.status}`);
  }

  const data = await response.json();

  return data.documents
    .map((item) => ({
      name: type === 'address'
        ? item.address_name
        : item.place_name,
      address: type === 'address'
        ? item.road_address?.address_name || item.address_name
        : item.road_address_name || item.address_name,
      lat: item.y ? Number(item.y) : NaN,
      lng: item.x ? Number(item.x) : NaN
    }))
    .filter((item) =>
      typeof item.name === 'string' &&
      item.name.length > 0 &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lng) &&
      item.lat >= -90 && item.lat <= 90 &&
      item.lng >= -180 && item.lng <= 180
    );
}

module.exports = { searchOrigins };