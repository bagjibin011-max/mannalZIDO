
// Date scheduler: saved votes update every four seconds.
const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("code") || "").trim().toUpperCase();
const memberId = params.get("memberId") ||
  (roomCode ? localStorage.getItem(`memberId:${roomCode}`) : null) || "";

const calendarGrid = document.getElementById("calendar-grid");
const monthTitle = document.getElementById("month-title");
const selectedList = document.getElementById("selected-list");
const selectedCount = document.getElementById("selected-count");
const voteDetails = document.getElementById("vote-details");
const saveStatus = document.getElementById("save-status");
const saveButton = document.getElementById("save-button");
const resetButton = document.getElementById("reset-button");
const clearSavedButton = document.getElementById("clear-saved-button");

const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth();
let focusedDate = null;
let loading = true;
let saving = false;
let polling = false;
let canVote = false;
let memberCount = 0;
let totalMembers = 0;
let participants = [];
let voteStats = new Map();
let topDates = new Set();
let lastSnapshot = "";
let requestVersion = 0;

// The local selection is independent of the last server save.
const selectedDates = new Set();
const savedDates = new Set();

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatKoreanDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short"
  });
}

function setSaveStatus(message, type = "normal") {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("status-warning", type === "warning");
  saveStatus.classList.toggle("status-error", type === "error");
}

function hasUnsavedChanges() {
  if (selectedDates.size !== savedDates.size) return true;
  return [...selectedDates].some((date) => !savedDates.has(date));
}

function updateChangeStatus() {
  if (!canVote) {
    setSaveStatus("방에 등록된 참여자만 날짜를 저장할 수 있습니다.");
  } else if (hasUnsavedChanges()) {
    setSaveStatus("변경 사항이 있습니다. 저장 버튼을 눌러주세요.", "warning");
  } else {
    setSaveStatus("저장된 날짜와 동일한 상태입니다.");
  }
}

// Use the room's configured capacity, not the current join count.
function getVoteColor(count) {
  if (count <= 0 || memberCount <= 0) {
    return "#f6f8fb";
  }

  // Calculate color based on currently joined members.
  const ratio = Math.min(count / memberCount, 1);
  const lightness = 96 - ratio * 35;

  return `hsl(43, 100%, ${lightness.toFixed(2)}%)`;
}

function calculateVoteStats() {
  const result = new Map();
  for (const person of participants) {
    // Count only confirmed votes; pending selections have no yellow fill.
    for (const date of new Set(person.availableDates || [])) {
      if (!result.has(date)) {
        result.set(date, { count: 0, names: [] });
      }
      const item = result.get(date);
      item.count++;
      item.names.push(person.name);
    }
  }
  voteStats = result;
  const maximum = Math.max(0, ...[...result.values()].map((v) => v.count));
  topDates = new Set(
    [...result.entries()]
      .filter(([, value]) => maximum > 0 && value.count === maximum)
      .map(([date]) => date)
  );
}

function updateControls() {
  const busy = loading || saving;
  saveButton.disabled = busy || !canVote;
  resetButton.disabled = busy;
  clearSavedButton.disabled = busy || !canVote || savedDates.size === 0;
}

function renderAll() {
  calculateVoteStats();
  renderCalendar();
  renderSelectedDates();
  renderVoteDetails();
  updateControls();
}

// Merge fresh server data without losing unsaved local changes.
function applySummary(summary, preserveChanges = false) {
  const added = preserveChanges
    ? [...selectedDates].filter((date) => !savedDates.has(date)) : [];
  const removed = preserveChanges
    ? [...savedDates].filter((date) => !selectedDates.has(date)) : [];

  participants = Array.isArray(summary.participants) ? summary.participants : [];
  memberCount = Number.isInteger(summary.memberCount)
    ? summary.memberCount : participants.length;
  totalMembers = Number.isInteger(summary.totalMembers) && summary.totalMembers > 0
    ? summary.totalMembers : memberCount;

  const me = participants.find((person) => person.memberId === memberId);
  canVote = Boolean(me);
  const serverDates = Array.isArray(me?.availableDates) ? me.availableDates : [];

  savedDates.clear();
  for (const date of serverDates) savedDates.add(date);

  selectedDates.clear();
  for (const date of savedDates) selectedDates.add(date);
  if (preserveChanges && canVote) {
    for (const date of removed) selectedDates.delete(date);
    for (const date of added) selectedDates.add(date);
  }
  lastSnapshot = JSON.stringify(summary);
  renderAll();
}

// Calendar clicks add a date or show voters; X alone removes a date.
function selectOrViewDate(dateString) {
  if (loading || saving) return;
  focusedDate = dateString;
  if (!selectedDates.has(dateString)) {
    if (selectedDates.size >= 90) {
      setSaveStatus("날짜는 최대 90일까지 선택할 수 있습니다.", "warning");
      renderVoteDetails();
      return;
    }
    selectedDates.add(dateString);
  }
  renderAll();
  updateChangeStatus();
}

function removeSelectedDate(dateString) {
  if (loading || saving) return;
  selectedDates.delete(dateString);
  focusedDate = dateString;
  renderAll();
  updateChangeStatus();
}

function resetUnsavedChanges() {
  if (loading || saving) return;
  selectedDates.clear();
  for (const date of savedDates) selectedDates.add(date);
  focusedDate = null;
  renderAll();
  setSaveStatus("저장 전 변경 사항을 초기화했습니다.");
}

function renderSelectedDates() {
  selectedCount.textContent = selectedDates.size;
  selectedList.innerHTML = "";
  if (selectedDates.size === 0) {
    const item = document.createElement("li");
    item.className = "empty-message";
    item.textContent = "아직 선택한 날짜가 없습니다.";
    selectedList.appendChild(item);
    return;
  }

  for (const date of [...selectedDates].sort()) {
    const item = document.createElement("li");
    item.className = "selected-date-item";
    const label = document.createElement("span");
    label.textContent = formatKoreanDate(date);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-date";
    removeButton.textContent = "×";
    removeButton.disabled = loading || saving;
    removeButton.setAttribute("aria-label", `${formatKoreanDate(date)} 선택 취소`);
    removeButton.addEventListener("click", () => removeSelectedDate(date));
    item.append(label, removeButton);
    selectedList.appendChild(item);
  }
}

function renderVoteDetails() {
  voteDetails.innerHTML = "";
  if (!focusedDate) {
    const hint = document.createElement("p");
    hint.className = "detail-hint";
    hint.textContent = "날짜를 클릭하면 참여 인원과 이름을 확인할 수 있습니다.";
    voteDetails.appendChild(hint);
    return;
  }

  const info = voteStats.get(focusedDate);
  const count = info?.count || 0;
  const heading = document.createElement("h3");
  heading.textContent = formatKoreanDate(focusedDate);
  const countText = document.createElement("p");
  countText.className = "detail-count";
  countText.textContent = `설정 인원 ${totalMembers}명 중 ${count}명 선택 (현재 입장 ${memberCount}명)`;
  voteDetails.append(heading, countText);

  if (canVote && hasUnsavedChanges()) {
    const pending = document.createElement("p");
    pending.className = "detail-pending";
    pending.textContent = "참여 인원은 저장된 결과입니다. 내 변경은 저장 후 반영됩니다.";
    voteDetails.appendChild(pending);
  }
  if (topDates.has(focusedDate)) {
    const top = document.createElement("p");
    top.className = "top-message";
    top.textContent = "★ 현재 최다 선택 날짜";
    voteDetails.appendChild(top);
  }
  if (count === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-hint";
    empty.textContent = "아직 저장된 선택이 없는 날짜입니다.";
    voteDetails.appendChild(empty);
    return;
  }

  const names = document.createElement("div");
  names.className = "voter-names";
  for (const name of info.names) {
    const badge = document.createElement("span");
    badge.className = "voter-badge";
    badge.textContent = name;
    names.appendChild(badge);
  }
  voteDetails.appendChild(names);
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  monthTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) {
      const empty = document.createElement("div");
      empty.className = "empty-day";
      calendarGrid.appendChild(empty);
      continue;
    }

    const dateString = formatDate(currentYear, currentMonth, day);
    const count = voteStats.get(dateString)?.count || 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    button.disabled = loading || saving;
    button.style.backgroundColor = getVoteColor(count);

    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = day;
    button.appendChild(number);
    if (count > 0) {
      const countLabel = document.createElement("span");
      countLabel.className = "day-count";
      countLabel.textContent = `${count}명`;
      button.appendChild(countLabel);
    }

    const selected = selectedDates.has(dateString);
    if (selected) button.classList.add("my-selected");
    if (canVote && selected !== savedDates.has(dateString)) {
      button.classList.add("pending-date");
    }
    if (topDates.has(dateString)) button.classList.add("top-date");
    if (dateString === formatDate(today.getFullYear(), today.getMonth(), today.getDate())) {
      button.classList.add("today");
    }
    if (focusedDate === dateString) button.classList.add("focused-date");
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `${dateString}, 저장된 선택 ${count}명`);
    button.addEventListener("click", () => selectOrViewDate(dateString));
    calendarGrid.appendChild(button);
  }
}

// Move through months without resetting pending selections.
document.getElementById("prev-month").addEventListener("click", () => {
  const date = new Date(currentYear, currentMonth - 1, 1);
  currentYear = date.getFullYear();
  currentMonth = date.getMonth();
  renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  const date = new Date(currentYear, currentMonth + 1, 1);
  currentYear = date.getFullYear();
  currentMonth = date.getMonth();
  renderCalendar();
});

document.getElementById("today-button").addEventListener("click", () => {
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();
  renderCalendar();
});

resetButton.addEventListener("click", resetUnsavedChanges);

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `서버 요청 실패 (${response.status})`);
  }
  return data;
}

// Poll once every four seconds, skipping overlapping and stale requests.
async function refreshRoomVotes(initial = false) {
  if (!roomCode || polling || saving) return;
  if (!initial && document.hidden) return;
  polling = true;
  const version = requestVersion;

  try {
    const response = await fetch(
      `/api/rooms/${encodeURIComponent(roomCode)}/dates`,
      { cache: "no-store" }
    );
    const summary = await readResponse(response);
    if (version !== requestVersion || saving) return;

    const signature = JSON.stringify(summary);
    if (initial || signature !== lastSnapshot) {
      applySummary(summary, !initial);
      if (!initial) updateChangeStatus();
    }
    if (initial) {
      setSaveStatus(canVote
        ? "서버에서 저장된 날짜를 불러왔습니다. (4초마다 자동 갱신)"
        : "참여자 정보를 찾을 수 없습니다. 방에서 다시 입장해주세요.");
    }
  } catch (error) {
    if (initial || !hasUnsavedChanges()) {
      setSaveStatus(`자동 갱신 실패: ${error.message}`, "error");
    }
  } finally {
    polling = false;
    if (initial) {
      loading = false;
      renderAll();
    }
  }
}

// PUT replaces this member's votes; PUT [] clears saved selections.
async function updateServerDates(dates, successMessage) {
  if (!canVote || loading || saving) return;
  requestVersion++;
  saving = true;
  setSaveStatus("날짜를 저장하고 있습니다...");
  renderAll();

  try {
    const response = await fetch(
      `/api/rooms/${encodeURIComponent(roomCode)}/dates/${encodeURIComponent(memberId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availableDates: [...dates].sort() })
      }
    );
    const summary = await readResponse(response);
    applySummary(summary, false);
    setSaveStatus(successMessage);
  } catch (error) {
    setSaveStatus(`날짜 저장 실패: ${error.message}`, "error");
  } finally {
    saving = false;
    renderAll();
  }
}

saveButton.addEventListener("click", () => {
  updateServerDates([...selectedDates], "날짜 선택이 서버에 저장되었습니다.");
});

clearSavedButton.addEventListener("click", () => {
  if (!canVote || loading || saving || savedDates.size === 0) return;
  const confirmed = window.confirm(
    `서버에 저장한 날짜 ${savedDates.size}개를 모두 초기화할까요?\n\n` +
    "내 날짜 선택 기록만 삭제되며 다른 참여자의 투표는 유지됩니다."
  );
  if (confirmed) {
    updateServerDates([], "서버에 저장한 내 날짜를 모두 초기화했습니다.");
  }
});

// Keep the existing room navigation and selection instructions.
document.getElementById("back-link").href = roomCode
  ? `./room.html?code=${encodeURIComponent(roomCode)}` : "./index.html";

const notice = document.querySelector(".preview-notice");
if (notice) {
  notice.textContent =
    "노란색과 참여 인원은 저장된 투표 기준이며 4초마다 자동 갱신됩니다. " +
    "저장 전 내 선택은 테두리로 표시되고, 초기화하면 마지막 저장 상태로 돌아갑니다.";
}

renderAll();
if (!roomCode) {
  loading = false;
  renderAll();
  setSaveStatus("방에서 입장하면 날짜를 저장할 수 있습니다.");
} else {
  refreshRoomVotes(true);
  setInterval(() => refreshRoomVotes(false), 4000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshRoomVotes(false);
  });
}
