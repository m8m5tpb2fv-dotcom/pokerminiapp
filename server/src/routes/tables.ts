import { Router } from 'express';
import type { TableManager } from '../tableManager.js';

export function tablesRouter(tableManager: TableManager): Router {
  const router = Router();

  router.get('/tables', (_req, res) => {
    res.json({ tables: tableManager.listSummaries() });
  });

  return router;
}
