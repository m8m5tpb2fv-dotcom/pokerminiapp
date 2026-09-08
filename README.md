# pokerminiapp — Stars Poker

A Telegram Mini App: real-time Texas Hold'em poker where players buy in and
play with **Telegram Stars** (the platform's native in-app currency). No
custom coin, no exchange rate — a Star purchased through Telegram is a Star
in your poker balance.

## Why Stars

Real-money poker isn't viable inside a Telegram Mini App. Telegram Stars
sidesteps that: it's Telegram's own payment rail, not a stake in real
currency, so buying Stars and playing with them is a legitimate in-app
purchase flow rather than gambling with cash. Players top up via Telegram's
native invoice/payment UI (`createInvoiceLink` with currency `XTR`), and the
same balance is what they buy into tables with.

## Architecture

```
server/   Node + TypeScript + Express + ws + better-sqlite3
  src/poker/       Texas Hold'em engine (deck, hand evaluation, betting
                    rounds, side pots) — framework-agnostic, unit tested
  src/db.ts        SQLite-backed Stars balance & transaction log
  src/telegram.ts  initData validation + Stars invoice/webhook helpers
  src/ws/gateway.ts  WebSocket protocol: auth, watch/join/leave a table, act
  src/routes/      REST: auth, table list, Stars invoice, payment webhook

client/   Vite + React + TypeScript
  src/screens/Lobby.tsx   Balance, buy Stars, table list
  src/screens/Table.tsx   Seats, hole/community cards, pot, action bar
  src/ws.ts               WebSocket client
  src/telegram.ts         Telegram WebApp SDK wrapper (+ browser dev fallback)
```

## Running locally

```
cd server && npm install && npm run dev     # :8080
cd client && npm install && npm run dev     # :5173 (proxies /api and /ws)
```

Without `BOT_TOKEN` set, the server runs in **dev mode**: it accepts
`debug:<telegramId>:<name>` in place of real Telegram `initData` and grants a
free 1000-Star starter balance so you can play without a real Telegram
client or bot. Real Stars purchases are disabled in this mode.

## Going live on Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather), set `BOT_TOKEN` in
   `server/.env` (see `server/.env.example`).
2. Point the bot's Mini App URL at the deployed `client` build.
3. Register the payments webhook: `setWebhook` to
   `https://<your-server>/api/telegram/webhook` (handles `pre_checkout_query`
   and `successful_payment` for Stars purchases).
4. Deploy `server` (needs a writable disk for the SQLite file, or swap
   `db.ts` for a hosted database) and serve the client's `npm run build`
   output statically.

## Testing

```
cd server && npm test
```

Covers the deck, hand evaluator, and the full table state machine: blinds,
turn order, calls/raises/all-ins, side-pot construction, showdown payouts,
and button rotation across hands.
