(function () {
  if (!requireMember()) return;

  const code = getCode();
  const myId = getMemberId(code);

  // B, C 화면으로 연결
  document.getElementById('dateLink').href = `/date.html?code=${code}`;
  document.getElementById('placeLink').href = `/place.html?code=${code}`;

  // 코드 타일 (한 번만 그림)
  document.getElementById('codeTiles').innerHTML =
    [...code].map((ch) => `<span>${ch}</span>`).join('');

  document.getElementById('copyBtn').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(code);
      e.target.textContent = '복사됨';
    } catch {
      e.target.textContent = '직접 복사해주세요';
    }
    setTimeout(() => (e.target.textContent = '코드 복사'), 1500);
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function formatDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
    const yearPart = y !== new Date().getFullYear() ? `${y}년 ` : '';
    return `${yearPart}${m}월 ${d}일 (${weekday})`;
  }

  // 날짜: B의 /dates 응답(topDates, dates, participants)을 그대로 사용
  function renderDateProgress(summary) {
    const box = document.getElementById('dateProgress');
    box.replaceChildren();

    const topDates = summary ? summary.topDates : [];
    if (!summary || topDates.length === 0) {
      box.append(el('span', 'status-badge', '미확정'));
      box.append(el('p', 'status-note', '아직 날짜를 저장한 사람이 없어요.'));
      return;
    }

    const row = el('div', 'date-pills');
    topDates.forEach((d) => row.append(el('span', 'date-pill', formatDate(d))));
    box.append(row);

    const top = summary.dates.find((item) => item.date === topDates[0]);
    const savedCount = summary.participants.filter((p) => p.availableDates.length > 0).length;
    box.append(el('p', 'status-note', `최다 ${top.count}명 선택 · ${savedCount}명 저장`));
  }

  //places의 stage, candidates, winnerIds 등 가져오기
  function renderPlaceProgress(state) {
    const box = document.getElementById('placeProgress');
    box.replaceChildren();

    const winners = state && state.stage === 'result'
      ? state.candidates.filter((c) => state.winnerIds.includes(c.id))
      : [];

    if (winners.length === 1) {
      box.append(el('p', 'place-name', winners[0].name));
      const votes = state.counts[winners[0].id];
      const note = votes === state.totalMembers
        ? '만장일치로 확정됐어요'
        : `${votes}명이 선택한 장소예요`;
      box.append(el('p', 'status-note', note));
      return;
    }
    if (winners.length > 1) {
      const row = el('div', 'date-pills');
      winners.forEach((w) => row.append(el('span', 'date-pill', w.name)));
      box.append(row);
      box.append(el('p', 'status-note', `공동 1위 · 각 ${state.counts[winners[0].id]}표`));
      return;
    }

    // 아직 미확정: 단계에 맞춰 안내
    box.append(el('span', 'status-badge', '미확정'));
    let note = '아직 최종 장소가 정해지지 않았어요.';
    if (state && state.stage === 'origin') {
      note = `출발지 입력 ${state.savedCount}/${state.totalMembers}명`;
    } else if (state && state.stage === 'vote') {
      note = `투표 진행 중 ${state.voteCount}/${state.totalMembers}명`;
    }
    box.append(el('p', 'status-note', note));
  }  

  // ----- 슬라이드 (메뉴 / 진행 현황) -----
  const viewport = document.getElementById('viewport');
  const slides = [...viewport.querySelectorAll('.slide')];
  const prevBtn = document.getElementById('prevSlide');
  const nextBtn = document.getElementById('nextSlide');
  const dots = [...document.querySelectorAll('#dots .dot')];

  function updateSlideState() {
    const current = Math.round(viewport.scrollLeft / viewport.clientWidth) || 0;
    prevBtn.disabled = current === 0;                 // 첫 슬라이드면 < 반투명
    nextBtn.disabled = current === slides.length - 1; // 마지막이면 > 반투명
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
      if (i === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    // 현재 슬라이드 높이에 맞춤 (날짜가 많아져 카드가 길어져도 같이 늘어남)
    viewport.style.height = `${slides[current].offsetHeight}px`;
  }

  function goTo(index) {
    viewport.scrollTo({ left: index * viewport.clientWidth, behavior: 'smooth' });
  }

  prevBtn.addEventListener('click', () => goTo(Math.round(viewport.scrollLeft / viewport.clientWidth) - 1));
  nextBtn.addEventListener('click', () => goTo(Math.round(viewport.scrollLeft / viewport.clientWidth) + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  viewport.addEventListener('scroll', updateSlideState, { passive: true });

  // 슬라이드 내용이 바뀌거나 창 크기가 바뀌어도 높이 다시 계산
  const resizeObserver = new ResizeObserver(updateSlideState);
  slides.forEach((s) => resizeObserver.observe(s));
  updateSlideState();

  function render(room) {
    document.title = `${room.roomName} · 약속 조율`;
    document.getElementById('roomName').textContent = room.roomName;
    document.getElementById('count').textContent =
      `👥 ${room.memberCount}/${room.totalMembers}명`;

    const list = document.getElementById('memberList');
    list.innerHTML = '';
    room.members.forEach((m) => {
      const li = document.createElement('li');
      const meLabel = m.memberId === myId ? ' (나)' : '';

      li.textContent = `${m.name}${meLabel}`;
      if (m.memberId === myId) li.className = 'me';
      list.appendChild(li);
    });
  }

    async function loadDates() {
    try {
      return await api(`/api/rooms/${code}/dates`);
    } catch {
      return null;
    }
  }

  async function loadPlaces() {
    try {
      return await api(`/api/rooms/${code}/votes?memberId=${encodeURIComponent(myId)}`);
    } catch {
      return null;
    }
  }

  async function load() {
    try {
      const [room, dateSummary, placeState] = await Promise.all([
        api(`/api/rooms/${code}`),
        loadDates(),
        loadPlaces(),
      ]);
      // 서버가 재시작돼서 내 참여 정보가 사라진 경우
      if (!room.members.some((m) => m.memberId === myId)) {
        localStorage.removeItem(`memberId:${code}`);
        window.location.replace('/index.html');
        return;
      }
      render(room);
      renderDateProgress(dateSummary);
      renderPlaceProgress(placeState);
    } catch (e) {
      if (e.status === 404) window.location.replace('/index.html');
    }
  }

  load();
  setInterval(load, 4000); // 4초마다 인원 수·참여자 갱신
})();