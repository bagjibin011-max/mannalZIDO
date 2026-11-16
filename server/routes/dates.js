
const express = require("express");
const { getRoom, getMember } = require("../store");
const router = express.Router();

// Reject malformed or impossible YYYY-MM-DD dates.
function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function getDateSummary(room) {
  const dateMap = new Map();
  const participants = room.members.map((member) => ({
    memberId: member.memberId,
    name: member.name,
    availableDates: Array.isArray(room.availability[member.memberId])
      ? [...room.availability[member.memberId]] : []
  }));

  for (const person of participants) {
    for (const date of new Set(person.availableDates)) {
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, count: 0, names: [] });
      }
      const item = dateMap.get(date);
      item.count++;
      item.names.push(person.name);
    }
  }

  const dates = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const maxCount = Math.max(0, ...dates.map((item) => item.count));
  const topDates = dates
    .filter((item) => maxCount > 0 && item.count === maxCount)
    .map((item) => item.date);

  return {
    code: room.code,
    totalMembers: room.totalMembers,  // Configured capacity controls colors.
    memberCount: room.members.length, // Currently joined members.
    participants,
    dates,
    topDates
  };
}

router.get("/:code/dates", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "존재하지 않는 방입니다." });
  res.set("Cache-Control", "no-store");
  return res.json(getDateSummary(room));
});

router.put("/:code/dates/:memberId", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "존재하지 않는 방입니다." });
  const member = getMember(room, req.params.memberId);
  if (!member) {
    return res.status(404).json({ error: "등록되지 않은 참여자입니다." });
  }

  const { availableDates } = req.body || {};
  if (!Array.isArray(availableDates) || availableDates.length > 90 ||
      !availableDates.every(isValidDate)) {
    return res.status(400).json({ error: "올바른 날짜 목록을 입력해주세요." });
  }

  room.availability[member.memberId] = [...new Set(availableDates)].sort();
  return res.json({
    success: true,
    message: "날짜 선택이 저장되었습니다.",
    ...getDateSummary(room)
  });
});

module.exports = router;
