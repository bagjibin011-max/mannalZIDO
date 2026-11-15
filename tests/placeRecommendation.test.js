const assert = require('node:assert/strict');
const { recommendPlaces } =
  require('../server/placeRecommendation');

const places = [
  { id: 'a', lat: 37.5, lng: 127 },
  { id: 'b', lat: 37.6, lng: 127 },
  { id: 'c', lat: 37.7, lng: 127 },
  { id: 'd', lat: 37.8, lng: 127 }
];

function ids(result) {
  return result.map((place) => place.id);
}

// 1. 출발지가 없으면 추천하지 않음
assert.deepEqual(recommendPlaces([], places), []);

// 2. 가까운 순으로 최대 3곳 추천
assert.deepEqual(
  ids(recommendPlaces([{ lat: 37.5, lng: 127 }], places)),
  ['a', 'b', 'c']
);

// 3. 홀수 인원의 중앙값 사용
assert.equal(
  recommendPlaces([
    { lat: 37.5, lng: 127 },
    { lat: 37.6, lng: 127 },
    { lat: 37.9, lng: 127 }
  ], places)[0].id,
  'b'
);

// 4. 짝수 인원은 가운데 두 값의 평균 사용
assert.equal(
  recommendPlaces([
    { lat: 37.5, lng: 127 },
    { lat: 37.9, lng: 127 }
  ], places)[0].id,
  'c'
);

// 5. 후보가 3곳보다 적으면 있는 만큼 반환
assert.equal(
  recommendPlaces(
    [{ lat: 37.5, lng: 127 }],
    places.slice(0, 2)
  ).length,
  2
);

// 6. 잘못된 좌표 거부
assert.throws(() => {
  recommendPlaces([{ lat: '서울', lng: 127 }], places);
});

// 7. 원본 후보 목록을 변경하지 않음
const before = JSON.stringify(places);
recommendPlaces([{ lat: 37.8, lng: 127 }], places);
assert.equal(JSON.stringify(places), before);

// 8. 두 출발지의 평균·최대 거리 확인
// 같은 경도에서 위도 0.1도 차이는 현재 계산식으로 11.132km
const distanceResult = recommendPlaces(
  [
    { lat: 37.5, lng: 127 },
    { lat: 37.7, lng: 127 }
  ],
  [{ id: 'test', lat: 37.5, lng: 127 }]
)[0];

assert.ok(
  Math.abs(distanceResult.averageDistanceKm - 11.132) < 0.001
);

assert.ok(
  Math.abs(distanceResult.maxDistanceKm - 22.264) < 0.001
);

// 9. 모두 후보와 같은 위치라면 거리는 0
const sameLocation = recommendPlaces(
  [
    { lat: 37.5, lng: 127 },
    { lat: 37.5, lng: 127 }
  ],
  [{ id: 'test', lat: 37.5, lng: 127 }]
)[0];

assert.equal(sameLocation.averageDistanceKm, 0);
assert.equal(sameLocation.maxDistanceKm, 0);

console.log('장소 추천 계산 테스트 9개 통과');