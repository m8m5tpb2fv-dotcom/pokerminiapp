import { Router } from 'express';
import { authenticateInitData } from '../authenticate.js';
import { displayNameFor, getOrCreateUser } from '../db.js';
import type { TableManager } from '../tableManager.js';
import { registerForTournament, unregisterFromTournament } from '../tournamentScheduler.js';
import {
  TOURNAMENT_BLIND_BB,
  TOURNAMENT_BLIND_SB,
  TOURNAMENT_BUY_IN,
  TOURNAMENT_SEATS,
  TOURNAMENT_TABLE_ID,
  countEntries,
  getLastTournamentResult,
  getTournamentState,
  isRegistered,
} from '../tournamentDb.js';

export function tournamentRouter(tableManager: TableManager, botToken: string | undefined): Router {
  const router = Router();

  router.get('/tournament', (req, res) => {
    const state = getTournamentState();
    const initData = typeof req.query.initData === 'string' ? req.query.initData : undefined;
    const tgUser = initData ? authenticateInitData(initData, botToken) : null;

    let isYouRegistered = false;
    let isYouSeated = false;
    if (tgUser) {
      isYouRegistered = isRegistered(tgUser.id);
      const table = tableManager.getTable(TOURNAMENT_TABLE_ID);
      isYouSeated = Boolean(table?.getSeat(tgUser.id));
    }

    res.json({
      status: state.status,
      nextStartAt: state.nextStartAt,
      buyIn: TOURNAMENT_BUY_IN,
      maxSeats: TOURNAMENT_SEATS,
      smallBlind: TOURNAMENT_BLIND_SB,
      bigBlind: TOURNAMENT_BLIND_BB,
      registeredCount: countEntries(),
      isRegistered: isYouRegistered,
      isSeated: isYouSeated,
      lastResult: getLastTournamentResult(),
    });
  });

  router.post('/tournament/register', (req, res) => {
    const { initData } = req.body as { initData?: string };
    if (!initData) return res.status(400).json({ error: 'initData required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    try {
      const user = getOrCreateUser(tgUser.id, tgUser.username, tgUser.first_name);
      registerForTournament(user.telegram_id, displayNameFor(user));
      res.json({ ok: true, registeredCount: countEntries() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/tournament/unregister', (req, res) => {
    const { initData } = req.body as { initData?: string };
    if (!initData) return res.status(400).json({ error: 'initData required' });
    const tgUser = authenticateInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram authentication' });

    try {
      unregisterFromTournament(tgUser.id);
      res.json({ ok: true, registeredCount: countEntries() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
