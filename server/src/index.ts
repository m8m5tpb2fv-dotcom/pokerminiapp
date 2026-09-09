import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { ADMIN_PAGE_HTML } from './adminPage.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { avatarRouter } from './routes/avatar.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { nicknameRouter } from './routes/nickname.js';
import { ranksRouter } from './routes/ranks.js';
import { starsRouter, telegramWebhookRouter } from './routes/stars.js';
import { statusesRouter } from './routes/statuses.js';
import { tablesRouter } from './routes/tables.js';
import { tournamentRouter } from './routes/tournament.js';
import { TableManager } from './tableManager.js';
import { startPrizeScheduler } from './prizeScheduler.js';
import { startTournamentScheduler } from './tournamentScheduler.js';
import { attachWebSocketServer } from './ws/gateway.js';

const PORT = Number(process.env.PORT ?? 8080);
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null;

if (!BOT_TOKEN) {
  console.warn('[warn] BOT_TOKEN not set - running in DEV mode with debug: initData and no real Stars purchases.');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' })); // base64-encoded avatar uploads need more than the 100kb default

const tableManager = new TableManager();

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/admin', (_req, res) => res.type('html').send(ADMIN_PAGE_HTML));
app.use('/api', authRouter(BOT_TOKEN));
app.use('/api', starsRouter(BOT_TOKEN));
app.use('/api', telegramWebhookRouter(BOT_TOKEN));
app.use('/api', tablesRouter(tableManager));
app.use('/api', leaderboardRouter());
app.use('/api', nicknameRouter(BOT_TOKEN));
app.use('/api', statusesRouter(BOT_TOKEN));
app.use('/api', tournamentRouter(tableManager, BOT_TOKEN));
app.use('/api', ranksRouter());
app.use('/api', adminRouter(BOT_TOKEN, ADMIN_TELEGRAM_ID));
app.use('/api', avatarRouter(BOT_TOKEN));

const server = http.createServer(app);
attachWebSocketServer(server, tableManager, BOT_TOKEN);

server.listen(PORT, () => {
  console.log(`Poker server listening on :${PORT}`);
});

startPrizeScheduler(BOT_TOKEN);
startTournamentScheduler(tableManager, BOT_TOKEN);
