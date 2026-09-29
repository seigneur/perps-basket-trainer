import { fetchAccountState, fetchMarketMeta, fetchRecentFunding } from './venue';

export interface Env {
  DB: D1Database;
  CACHE?: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_OWNER_CHAT_ID: string;
  TELEGRAM_OWNER_USER_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  HL_API_URL: string;
  MAIN_ADDRESS: string;
  ACTIVE_WINDOW_UTC: string;
  AGENT_PRIVATE_KEY?: string;
}

const BOOKS = ['calm', 'cockpit'] as const;

function isInWindow(env: Env): boolean {
  const [startH, endH] = env.ACTIVE_WINDOW_UTC.split('-').map(Number);
  const nowH = new Date().getUTCHours();
  return nowH >= startH && nowH < endH;
}

export async function runSnapshot(env: Env): Promise<void> {
  if (!env.MAIN_ADDRESS) {
    console.log('MAIN_ADDRESS not set — skipping snapshot');
    return;
  }

  const [account, markets] = await Promise.all([
    fetchAccountState(env.HL_API_URL, env.MAIN_ADDRESS),
    fetchMarketMeta(env.HL_API_URL),
  ]);

  const ts = Date.now();

  // Load book configs to attribute positions
  const configs = await env.DB.prepare('SELECT book, weights_json, leverage FROM book_config').all();
  const bookConfigs = Object.fromEntries(
    (configs.results ?? []).map((r: any) => [r.book, { weights: JSON.parse(r.weights_json), leverage: r.leverage }])
  );

  // If no config yet, split positions 50/50 by default (Phase 1 — no real positions)
  const snapshot = {
    calm: { equity: 0, pnl_price: 0, pnl_funding: 0, pnl_fees: 0, benchmark_pct: 0 },
    cockpit: { equity: 0, pnl_price: 0, pnl_funding: 0, pnl_fees: 0, benchmark_pct: 0 },
  };

  // Attribute account equity evenly until books are configured
  snapshot.calm.equity = account.equity / 2;
  snapshot.cockpit.equity = account.equity / 2;

  // Write snapshots to D1
  for (const book of BOOKS) {
    const s = snapshot[book];
    await env.DB.prepare(
      `INSERT INTO snapshots (ts, book, equity_usd, pnl_price, pnl_funding, pnl_fees, benchmark_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(ts, book, s.equity, s.pnl_price, s.pnl_funding, s.pnl_fees, s.benchmark_pct).run();
  }

  // Write current positions
  const posTs = ts;
  for (const pos of account.positions) {
    const market = markets.find(m => m.asset === pos.asset);
    await env.DB.prepare(
      `INSERT INTO positions (ts, book, asset, size, entry_px, mark_px, liq_px, leverage, funding_rate_hourly)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      posTs, 'cockpit', pos.asset, pos.size, pos.entryPx,
      market?.markPx ?? pos.markPx, pos.liqPx,
      pos.leverage, market?.fundingRateHourly ?? 0,
    ).run();
  }

  // Cache latest state for UI (30s TTL) — only if KV binding is configured
  if (env.CACHE) {
    const statePayload = {
      ts,
      account: { equity: account.equity, marginUsed: account.marginUsed, marginFree: account.marginFree },
      positions: account.positions,
      markets,
      snapshots: snapshot,
    };
    await env.CACHE.put('latest', JSON.stringify(statePayload), { expirationTtl: 30 });
  }

  console.log(`Snapshot OK — equity ${account.equity} USDC, ${account.positions.length} positions`);
}

export async function runLiqAlert(env: Env): Promise<void> {
  const [account, markets] = await Promise.all([
    fetchAccountState(env.HL_API_URL, env.MAIN_ADDRESS),
    fetchMarketMeta(env.HL_API_URL),
  ]);

  for (const pos of account.positions) {
    if (!pos.liqPx) continue;
    const market = markets.find(m => m.asset === pos.asset);
    if (!market) continue;
    const distPct = Math.abs((market.markPx - pos.liqPx) / market.markPx) * 100;
    if (distPct < 3) {
      const { sendTelegram } = await import('./telegram');
      await sendTelegram(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_OWNER_CHAT_ID,
        `⚠️ LIQUIDATION ALERT\n${pos.asset} ${pos.size > 0 ? 'long' : 'short'} — liq price ${pos.liqPx.toFixed(4)}, mark ${market.markPx.toFixed(4)}\nOnly ${distPct.toFixed(1)}% away`,
      );
    }
  }
}
