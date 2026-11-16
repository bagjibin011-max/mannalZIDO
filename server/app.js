const path = require('path');
const express = require('express');

const store = require('./store');
const roomsRouter = require('./routes/rooms');
const datesRouter = require('./routes/dates');
const placesRouter = require('./routes/places');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 데이터를 바꾸는 요청(PUT, POST 등)이 끝나면 파일에 저장
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => store.saveRooms());
  }
  next();
});

app.use('/api/rooms', roomsRouter);
app.use('/api/rooms', datesRouter);
app.use('/api/rooms', placesRouter);

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

// Ctrl + C 등으로 끌 때 마지막 상태 저장
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    store.saveRoomsSync();
    process.exit(0);
  });
}