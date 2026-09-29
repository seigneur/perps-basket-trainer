export interface Position {
  asset: string;
  size: number;         // signed: positive = long, negative = short
  entryPx: number;
  markPx: number;
  liqPx: number | null;
  leverage: number;
  fundingRateHourly: number;
  unrealizedPnl: number;
  marginUsed: number;
}

export interface AccountState {
  equity: number;
  marginUsed: number;
  marginFree: number;
  positions: Position[];
}

export interface MarketMeta {
  asset: string;
  maxLeverage: number;
  markPx: number;
  oraclePx: number;
  fundingRateHourly: number;
  openInterest: number;
}

export interface FundingPayment {
  asset: string;
  amountUsd: number;
  ts: number;
}

const ASSETS = ['ETH', 'BTC', 'NEAR'] as const;

function assetIndex(asset: string, universe: { name: string }[]): number {
  return universe.findIndex(u => u.name === asset);
}

export async function fetchAccountState(hlUrl: string, address: string): Promise<AccountState> {
  const res = await fetch(`${hlUrl}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: address }),
  });
  if (!res.ok) throw new Error(`HL clearinghouseState HTTP ${res.status}`);
  const data = await res.json() as any;

  const equity = parseFloat(data.marginSummary?.accountValue ?? '0');
  const marginUsed = parseFloat(data.marginSummary?.totalMarginUsed ?? '0');

  const positions: Position[] = (data.assetPositions ?? [])
    .filter((p: any) => parseFloat(p.position?.szi ?? '0') !== 0)
    .map((p: any) => {
      const pos = p.position;
      return {
        asset: pos.coin,
        size: parseFloat(pos.szi),
        entryPx: parseFloat(pos.entryPx ?? '0'),
        markPx: parseFloat(pos.positionValue) / Math.abs(parseFloat(pos.szi)),
        liqPx: pos.liquidationPx ? parseFloat(pos.liquidationPx) : null,
        leverage: parseFloat(pos.leverage?.value ?? '1'),
        fundingRateHourly: 0, // populated from meta
        unrealizedPnl: parseFloat(pos.unrealizedPnl ?? '0'),
        marginUsed: parseFloat(pos.marginUsed ?? '0'),
      };
    });

  return { equity, marginUsed, marginFree: equity - marginUsed, positions };
}

export async function fetchMarketMeta(hlUrl: string): Promise<MarketMeta[]> {
  const [metaRes, ctxRes] = await Promise.all([
    fetch(`${hlUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    }),
    fetch(`${hlUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    }),
  ]);

  if (!metaRes.ok || !ctxRes.ok) throw new Error('HL meta fetch failed');
  const meta = await metaRes.json() as any;
  const ctxData = await ctxRes.json() as any;
  const universe: { name: string; maxLeverage: number }[] = meta.universe ?? [];
  const ctxs: any[] = Array.isArray(ctxData) ? ctxData[1] : [];

  return ASSETS.map(asset => {
    const idx = assetIndex(asset, universe);
    const u = universe[idx] ?? {};
    const ctx = ctxs[idx] ?? {};
    return {
      asset,
      maxLeverage: u.maxLeverage ?? 10,
      markPx: parseFloat(ctx.markPx ?? '0'),
      oraclePx: parseFloat(ctx.oraclePx ?? '0'),
      fundingRateHourly: parseFloat(ctx.funding ?? '0'),
      openInterest: parseFloat(ctx.openInterest ?? '0'),
    };
  });
}

export async function fetchRecentFunding(hlUrl: string, address: string): Promise<FundingPayment[]> {
  const res = await fetch(`${hlUrl}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFundingHistory', user: address, startTime: Date.now() - 86400_000 }),
  });
  if (!res.ok) throw new Error(`HL fundingHistory HTTP ${res.status}`);
  const data = await res.json() as any[];
  return (data ?? []).map((f: any) => ({
    asset: f.delta?.coin ?? '',
    amountUsd: parseFloat(f.delta?.usdc ?? '0'),
    ts: parseInt(f.time ?? '0'),
  }));
}
