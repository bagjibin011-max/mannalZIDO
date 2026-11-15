const express = require('express');
const router = express.Router();
const store = require('../store');

const { meetingPlaces } = require('../data/places');
const { searchOrigins } = require('../kakaoSearch');
const { randomUUID } = require('crypto');
const { recommendPlaces } = require('../placeRecommendation');

// 장소 API 공통 검사
function requireMember(req, res, next) {
  const room = store.getRoom(req.params.code);

  if (!room) {
    return res.status(404).json({
      error: '존재하지 않는 방입니다.'
    });
  }

  const memberId = req.method === 'GET'
    ? req.query.memberId
    : req.body?.memberId;

  const member = store.getMember(room, memberId);

  if (!member) {
    return res.status(403).json({
      error: '이 방에 먼저 참여해주세요.'
    });
  }

  if (!Number.isSafeInteger(room.totalMembers) ||
      room.totalMembers < 1) {
    return res.status(409).json({
      error: '총인원이 설정된 새 방을 만들어주세요.'
    });
  }

  // C 담당 데이터는 장소 API에서 초기화
  room.placeStage ??= 'origin';
  room.placeCandidates ??= [];
  room.originSearches ??= {};

  req.room = room;
  req.member = member;
  next();
}

function isSavedOrigin(origin) {
  return origin &&
    typeof origin.name === 'string' &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lng);
}

function getSavedCount(room) {
  return room.members.filter((member) =>
    isSavedOrigin(room.origins[member.memberId])
  ).length;
}

// 현재 방의 장소 상태를 화면에 전달
function getPlaceState(room, memberId) {
  const counts = {};

  room.placeCandidates.forEach((candidate) => {
    counts[candidate.id] = 0;
  });

  room.members.forEach((member) => {
    const candidateId = room.votes[member.memberId];

    if (Object.hasOwn(counts, candidateId)) {
      counts[candidateId] += 1;
    }
  });

  const voteCount = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0
  );

  const maxVotes = Math.max(0, ...Object.values(counts));

  const winnerIds = room.placeStage === 'result' && maxVotes > 0
    ? Object.keys(counts).filter((id) => counts[id] === maxVotes)
    : [];

  return {
    stage: room.placeStage,
    totalMembers: room.totalMembers,
    memberCount: room.members.length,
    savedCount: getSavedCount(room),
    candidateId: room.votes[memberId] || null,
    origin: room.origins[memberId] || null,
    candidates: room.placeCandidates,
    counts,
    voteCount,
    winnerIds
  };
}

// 카카오 출발지 검색
router.get('/:code/origin-search', requireMember, async (req, res) => {
  const room = req.room;
  const memberId = req.member.memberId;

  if (room.placeStage !== 'origin') {
    return res.status(409).json({
      error: '추천이 완료되어 출발지를 변경할 수 없습니다.'
    });
  }

  const query = typeof req.query.query === 'string'
    ? req.query.query.trim()
    : '';

  const type = req.query.type;

  if (!query || query.length > 100) {
    return res.status(400).json({
      error: '검색어를 1~100자로 입력해주세요.'
    });
  }

  if (!['keyword', 'address'].includes(type)) {
    return res.status(400).json({
      error: '검색 종류를 선택해주세요.'
    });
  }

  // 같은 참여자의 최신 검색 결과만 사용
  const search = {
    results: [],
    expiresAt: 0
  };

  room.originSearches[memberId] = search;

  try {
    const places = await searchOrigins(query, type);

    if (room.placeStage !== 'origin') {
      return res.status(409).json({
        error: '검색 중 추천이 완료되었습니다.'
      });
    }

    if (room.originSearches[memberId] !== search) {
      return res.status(409).json({
        error: '더 최근의 검색이 있습니다. 다시 검색해주세요.'
      });
    }

    search.results = places.map((place) => ({
      ...place,
      id: randomUUID()
    }));

    search.expiresAt = Date.now() + 10 * 60 * 1000;

    res.json({
      results: search.results
    });
  } catch (error) {
    res.status(502).json({
      error: error.message
    });
  }
});

// 출발지 저장
router.put('/:code/origin', requireMember, (req, res) => {
  const room = req.room;
  const memberId = req.member.memberId;
  const { originId } = req.body || {};

  if (room.placeStage !== 'origin') {
    return res.status(409).json({
      error: '추천이 완료되어 출발지를 변경할 수 없습니다.'
    });
  }

  const search = room.originSearches[memberId];

  const selectedOrigin = search?.results.find(
    (origin) => origin.id === originId
  );

  if (!selectedOrigin || search.expiresAt < Date.now()) {
    return res.status(400).json({
      error: '검색 결과가 만료되었거나 올바르지 않습니다. 다시 검색해주세요.'
    });
  }

  room.origins[memberId] = { ...selectedOrigin };

  const everyoneReady =
    room.members.length === room.totalMembers &&
    getSavedCount(room) === room.totalMembers;

  if (everyoneReady) {
    const selectedOrigins = room.members.map((member) =>
      origins.find(
        (origin) => origin.id === room.origins[member.memberId]
      )
    );

    // 같은 출발지를 선택한 사람도 인원수만큼 계산
    room.placeCandidates = recommendPlaces(
      selectedOrigins,
      meetingPlaces
    );

    room.votes = {};
    room.placeStage = 'vote';
  }

  res.json(getPlaceState(room, memberId));
});

// 출발지 및 진행 상태 조회
router.get('/:code/origin', requireMember, (req, res) => {
  res.json(getPlaceState(req.room, req.member.memberId));
});

// 후보 목록 조회
router.get('/:code/candidates', requireMember, (req, res) => {
  res.json({
    stage: req.room.placeStage,
    candidates: req.room.placeCandidates
  });
});

// 투표 저장·변경
router.put('/:code/vote', requireMember, (req, res) => {
  const room = req.room;
  const memberId = req.member.memberId;
  const { candidateId } = req.body || {};

  if (room.placeStage !== 'vote') {
    return res.status(409).json({
      error: room.placeStage === 'result'
        ? '투표가 마감되었습니다.'
        : '모든 참여자의 출발지 입력을 기다리고 있습니다.'
    });
  }

  if (!room.placeCandidates.some(
    (candidate) => candidate.id === candidateId
  )) {
    return res.status(400).json({
      error: '올바른 후보를 선택해주세요.'
    });
  }

  room.votes[memberId] = candidateId;

  const everyoneVoted =
    room.members.length === room.totalMembers &&
    room.members.every((member) =>
      room.placeCandidates.some(
        (candidate) =>
          candidate.id === room.votes[member.memberId]
      )
    );

  // 마지막 사람의 투표를 저장한 직후 자동 마감
  if (everyoneVoted) {
    room.placeStage = 'result';
  }

  res.json(getPlaceState(room, memberId));
});

// 투표 현황 조회: 다른 사람의 개별 투표는 반환하지 않음
router.get('/:code/votes', requireMember, (req, res) => {
  res.json(getPlaceState(req.room, req.member.memberId));
});

module.exports = router;