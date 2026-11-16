// 방 구조:
// {
//   code, roomName, totalMembers, stage, createdAt,
//   members:      [{ memberId, name }],
//   availability: { [memberId]: ["2026-11-20", ...] },
//   origins:      { [memberId]: "originId" },
//   votes:        { [memberId]: "candidateId" }
// }

const crypto = require('crypto');

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data', 'runtime');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

const rooms = {};

// 헷갈리는 문자 0/O, 1/I 제외
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    }
  } while (rooms[code]); // 중복이면 다시 생성
  return code;
}

function createRoom({ roomName, totalMembers }) {
  const code = generateCode();
  const room = {
    code,
    roomName,
    totalMembers,
    stage: 'origin',
    createdAt: new Date().toISOString(),
    members: [],
    availability: {},
    origins: {},
    votes: {},
  };
  rooms[code] = room;
  return room;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function getRoom(code) {
  return rooms[normalizeCode(code)] || null;
}

function getMember(room, memberId) {
  return room.members.find((m) => m.memberId === memberId) || null;
}

function addMember(room, name) {
  const member = { memberId: crypto.randomUUID(), name };
  room.members.push(member);
  return member;
}

// 화면에 내려줄 방 정보 (투표 내용 등은 제외)
function toPublicRoom(room) {
  return {
    code: room.code,
    roomName: room.roomName,
    totalMembers: room.totalMembers,
    stage: room.stage,
    memberCount: room.members.length,
    members: room.members.map((m) => ({ memberId: m.memberId, name: m.name })),
  };
}

// ----- JSON 파일 저장 -----

// 서버가 켜질 때 저장된 방을 읽어서 메모리에 채움
function loadRooms() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    Object.assign(rooms, saved);
    console.log(`저장된 방 ${Object.keys(saved).length}개를 불러왔습니다.`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('저장 파일을 읽지 못했습니다:', e.message);
  }
}

// 저장은 한 번에 하나씩만 진행. 저장 중에 또 요청이 오면 끝난 뒤 최신 상태로 한 번 더 저장.
let saving = false;
let dirty = false;

async function saveRooms() {
  if (saving) {
    dirty = true;
    return;
  }
  saving = true;
  try {
    do {
      dirty = false;
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DATA_FILE}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(rooms));
      await fs.promises.rename(tmp, DATA_FILE); // 임시 파일에 다 쓴 뒤 교체 (쓰다 끊겨도 기존 파일 보호)
    } while (dirty);
  } catch (e) {
    console.error('저장에 실패했습니다:', e.message);
  } finally {
    saving = false;
  }
}

// 서버를 끌 때 마지막으로 한 번 즉시 저장
function saveRoomsSync() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(rooms));
  } catch (e) {
    console.error('종료 시 저장에 실패했습니다:', e.message);
  }
}

loadRooms();

// 방의 날짜·장소 조율 데이터 초기화
function resetRoomProgress(room) {
  room.availability = {};
  room.origins = {};
  room.votes = {};

  room.stage = 'origin';
  room.placeStage = 'origin';
  room.placeCandidates = [];
  room.originSearches = {};
}

module.exports = {
  createRoom,
  getRoom,
  getMember,
  addMember,
  toPublicRoom,
  resetRoomProgress,
  saveRooms,
  saveRoomsSync
};