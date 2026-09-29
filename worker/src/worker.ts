import { runSnapshot, runLiqAlert, type Env } from './snapshot';
import { sendTelegram, formatSummary } from './telegram';

export type { Env };

const UTC_SUMMARY_HOURS = [0, 4, 8, 12]; // SGT 08:00, 12:00, 16:00, 20:00

function isSummaryRun(utcHour: number, utcMin: number): boolean {
  return UTC_SUMMARY_HOURS.includes(utcHour) && utcMin === 0;
}

function isOvernightRun(utcHour: number, utcMin: number): boolean {
  return utcHour === 0 && utcMin === 0; // 08:00 SGT
}

async function buildSummary(env: Env, isOvernight: boolean): Promise<string> {
  const now = new Date();

  // Pull latest snapshots per book
  const rows = await env.DB.prepare(
    `SELECT book, equity_usd, pnl_price, pnl_funding, pnl_fees, benchmark_pct
     FROM snapshots
     WHERE ts = (SELECT MAX(ts) FROM snapshots WHERE book = s.book)
     GROUP BY book HAVING book = s.book`
  ).all().catch(() => ({ results: [] }));

  // Fallback: just get last row per book
  const [calmRow, cockpitRow] = await Promise.all([
    env.DB.prepare('SELECT * FROM snapshots WHERE book = ? ORDER BY ts DESC LIMIT 1').bind('calm').first<any>(),
    env.DB.prepare('SELECT * FROM snapshots WHERE book = ? ORDER BY ts DESC LIMIT 1').bind('cockpit').first<any>(),
  ]);

  const lastPositions = await env.DB.prepare(
    'SELECT * FROM positions WHERE ts = (SELECT MAX(ts) FROM positions)'
  ).all<any>();

  const positions = (lastPositions.results ?? []).map((p: any) => ({
    asset: p.asset,
    side: p.size > 0 ? 'long' : 'short',
    leverage: p.leverage,
    liqDistPct: p.liq_px ? Math.abs((p.mark_px - p.liq_px) / p.mark_px) * 100 : 999,
    fundingRateHourly: p.funding_rate_hourly,
  }));

  const feesRow = await env.DB.prepare('SELECT COALESCE(SUM(fee_usd),0) as total FROM fills').first<any>();
  const fundingRow = await env.DB.prepare('SELECT COALESCE(SUM(amount_usd),0) as total FROM funding_payments').first<any>();

  return formatSummary(
    isOvernight,
    calmRow ? { equity: calmRow.equity_usd, pnlPrice: calmRow.pnl_price, pnlFunding: calmRow.pnl_funding, pnlFees: calmRow.pnl_fees, benchmarkPct: calmRow.benchmark_pct } : null,
    cockpitRow ? { equity: cockpitRow.equity_usd, pnlPrice: cockpitRow.pnl_price, pnlFunding: cockpitRow.pnl_funding, pnlFees: cockpitRow.pnl_fees, positions } : null,
    { feesTotal: feesRow?.total ?? 0, fundingNet: fundingRow?.total ?? 0 },
    now,
  );
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date();
    const utcH = now.getUTCHours();
    const utcM = now.getUTCMinutes();

    // Always check liquidation proximity
    if (env.MAIN_ADDRESS) {
      ctx.waitUntil(runLiqAlert(env).catch(e => console.error('liq alert err', e)));
    }

    // Summary message (every 4h at xx:00 UTC)
    if (isSummaryRun(utcH, utcM)) {
      ctx.waitUntil((async () => {
        try {
          const msg = await buildSummary(env, isOvernightRun(utcH, utcM));
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_OWNER_CHAT_ID, msg);
        } catch (e) {
          console.error('summary err', e);
        }
      })());
      return; // Summary-only runs don't also snapshot
    }

    // Snapshot run (every 15 min during window)
    ctx.waitUntil(runSnapshot(env).catch(e => console.error('snapshot err', e)));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── Public API ──────────────────────────────────────────────
    if (url.pathname === '/api/state') {
      const cached = await env.CACHE.get('latest');
      if (cached) {
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
        });
      }
      return Response.json({ error: 'no data yet' }, { status: 404 });
    }

    if (url.pathname === '/api/history') {
      const book = url.searchParams.get('book') ?? 'calm';
      const range = url.searchParams.get('range') ?? '24h';
      const since = Date.now() - (range === '7d' ? 7 * 86400_000 : range === '30d' ? 30 * 86400_000 : 86400_000);
      const rows = await env.DB.prepare(
        'SELECT ts, equity_usd, pnl_price, pnl_funding, pnl_fees FROM snapshots WHERE book = ? AND ts >= ? ORDER BY ts ASC'
      ).bind(book, since).all();
      return Response.json(rows.results);
    }

    if (url.pathname === '/api/positions') {
      const book = url.searchParams.get('book');
      const rows = book
        ? await env.DB.prepare('SELECT * FROM positions WHERE book = ? ORDER BY ts DESC LIMIT 50').bind(book).all()
        : await env.DB.prepare('SELECT * FROM positions ORDER BY ts DESC LIMIT 100').all();
      return Response.json(rows.results);
    }

    // ── Telegram webhook ────────────────────────────────────────
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
      ctx.waitUntil(handleTelegramWebhook(request, env));
      return new Response('ok');
    }

    // ── Manual triggers (dev) ───────────────────────────────────
    if (url.pathname === '/run/snapshot') {
      await runSnapshot(env);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, ts: new Date().toISOString() });
    }

    return new Response('Perps Basket Trainer\n\nRoutes: /api/state /api/history /api/positions /health', { status: 200 });
  },
};

async function handleTelegramWebhook(request: Request, env: Env): Promise<void> {
  const body = await request.json() as any;
  const query = body?.callback_query;
  if (!query) return;

  const chatId = String(query.message?.chat?.id ?? '');
  if (chatId !== env.TELEGRAM_OWNER_CHAT_ID) return;

  const [action, proposalId] = (query.data ?? '').split(':');
  if (!proposalId) return;

  const proposal = await env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(proposalId).first<any>();
  if (!proposal) {
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Proposal ${proposalId} not found`);
    return;
  }

  if (proposal.status !== 'pending') {
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `Proposal ${proposalId} is already ${proposal.status}`);
    return;
  }

  if (Date.now() > proposal.expires_ts) {
    await env.DB.prepare('UPDATE proposals SET status = ? WHERE id = ?').bind('expired', proposalId).run();
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `⏱ Proposal ${proposalId} expired`);
    return;
  }

  if (action === 'reject') {
    await env.DB.prepare('UPDATE proposals SET status = ? WHERE id = ?').bind('rejected', proposalId).run();
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `✖ Proposal ${proposalId} rejected`);
    return;
  }

  if (action === 'approve') {
    await env.DB.prepare('UPDATE proposals SET status = ? WHERE id = ?').bind('approved', proposalId).run();
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Proposal ${proposalId} approved — execution coming in Phase 3`);
    // Phase 3: sign + submit orders here
    return;
  }
}
