export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Stars Poker — Admin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #0b1420;
    color: #e7edf3;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    padding: 20px;
  }
  h1 { font-size: 20px; margin: 0 0 16px; }
  .card {
    background: #121e2e;
    border: 1px solid #223349;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  input {
    background: #0b1420;
    border: 1px solid #2a3d54;
    border-radius: 8px;
    color: #e7edf3;
    padding: 10px 12px;
    font-size: 14px;
    flex: 1;
    min-width: 120px;
  }
  button {
    background: linear-gradient(135deg, #f7c948, #e0a72e);
    border: none;
    border-radius: 8px;
    color: #1a1204;
    font-weight: 700;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 14px;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .stat-tile {
    background: #0b1420;
    border: 1px solid #223349;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  .stat-value { font-size: 20px; font-weight: 800; color: #f7c948; }
  .stat-label { font-size: 11px; color: #8fa2b5; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #223349; }
  th { color: #8fa2b5; font-weight: 600; }
  .error { color: #ff6b6b; font-size: 13px; margin-top: 8px; }
  .success { color: #4ade80; font-size: 13px; margin-top: 8px; }
  .hint { color: #8fa2b5; font-size: 12px; margin-top: 4px; }
  #dashboard { display: none; }
</style>
</head>
<body>
  <h1>🃏 Stars Poker — Admin</h1>

  <div class="card" id="login-card">
    <div class="row">
      <input id="secret" type="password" placeholder="Bot token (secret)" />
      <button onclick="load()">View stats</button>
    </div>
    <div class="hint">The same BOT_TOKEN configured on the server. Stored only in this browser's localStorage.</div>
    <div class="error" id="login-error"></div>
  </div>

  <div id="dashboard">
    <div class="card">
      <div class="stats-grid" id="stats-grid"></div>
    </div>

    <div class="card">
      <strong>Tournament</strong>
      <div id="tournament-info" class="hint"></div>
    </div>

    <div class="card">
      <strong>Top 5 this week</strong>
      <table>
        <thead><tr><th>#</th><th>Player</th><th>Net</th></tr></thead>
        <tbody id="leaderboard-body"></tbody>
      </table>
    </div>

    <div class="card">
      <strong>Adjust a player's Stars balance</strong>
      <div class="hint">Use for support/compensation. Positive amount credits, negative debits.</div>
      <div class="row" style="margin-top:8px">
        <input id="adj-id" type="number" placeholder="Telegram ID" />
        <input id="adj-amount" type="number" placeholder="Amount (e.g. 100 or -50)" />
        <input id="adj-reason" type="text" placeholder="Reason (optional)" />
        <button onclick="adjustBalance()">Apply</button>
      </div>
      <div class="error" id="adj-error"></div>
      <div class="success" id="adj-success"></div>
    </div>

    <button onclick="load()">Refresh</button>
  </div>

<script>
  const secretInput = document.getElementById('secret');
  const stored = localStorage.getItem('admin_secret');
  if (stored) secretInput.value = stored;

  async function load() {
    const secret = secretInput.value.trim();
    document.getElementById('login-error').textContent = '';
    if (!secret) return;
    localStorage.setItem('admin_secret', secret);

    const res = await fetch('/api/admin/stats?secret=' + encodeURIComponent(secret));
    if (res.status === 403) {
      document.getElementById('login-error').textContent = 'Forbidden — wrong secret.';
      document.getElementById('dashboard').style.display = 'none';
      return;
    }
    const data = await res.json();
    document.getElementById('dashboard').style.display = 'block';

    const tiles = [
      ['⭐' + data.weeklyStarsRevenue, 'Stars bought this week'],
      ['⭐' + data.lifetimeStarsRevenue, 'Stars bought all-time'],
      [data.totalPlayers, 'Total players'],
      [data.activePlayersThisWeek, 'Active this week'],
      [data.totalHandsPlayed, 'Hands played (all-time)'],
      [data.botStarsBalance === null ? '—' : '⭐' + data.botStarsBalance, "Bot's Stars balance"],
    ];
    document.getElementById('stats-grid').innerHTML = tiles
      .map(([v, l]) => '<div class="stat-tile"><div class="stat-value">' + v + '</div><div class="stat-label">' + l + '</div></div>')
      .join('');

    const t = data.tournament;
    document.getElementById('tournament-info').textContent =
      'Status: ' + t.status + ' · Registered: ' + t.registeredCount + '/' + t.seats + ' · Buy-in: ⭐' + t.buyIn + ' · Next start: ' + t.nextStartAt + ' UTC';

    document.getElementById('leaderboard-body').innerHTML = data.topWeekly.length
      ? data.topWeekly
          .map((e, i) => '<tr><td>#' + (i + 1) + '</td><td>' + escapeHtml(e.displayName) + '</td><td>' + e.netWinnings + '</td></tr>')
          .join('')
      : '<tr><td colspan="3" class="hint">Nobody has a net result yet this week.</td></tr>';
  }

  async function adjustBalance() {
    const secret = secretInput.value.trim();
    const telegramId = Number(document.getElementById('adj-id').value);
    const amount = Number(document.getElementById('adj-amount').value);
    const reason = document.getElementById('adj-reason').value.trim();
    document.getElementById('adj-error').textContent = '';
    document.getElementById('adj-success').textContent = '';
    if (!telegramId || !amount) {
      document.getElementById('adj-error').textContent = 'Telegram ID and a non-zero amount are required.';
      return;
    }
    const res = await fetch('/api/admin/adjust-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, telegramId, amount, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('adj-error').textContent = data.error || 'Failed.';
      return;
    }
    document.getElementById('adj-success').textContent = data.displayName + "'s new balance: ⭐" + data.starsBalance;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  if (stored) load();
</script>
</body>
</html>
`;
