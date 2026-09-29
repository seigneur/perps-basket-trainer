import { getAuthHeaders } from './twa';

const BASE = import.meta.env.VITE_API_URL ?? 'https://perps-basket-trainer.contact-dias.workers.dev';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export interface SnapshotRow {
  ts: number; book: string; equity_usd: number;
  pnl_price: number; pnl_funding: number; pnl_fees: number; benchmark_pct: number;
}

export interface PositionRow {
  ts: number; book: string; asset: string; size: number;
  entry_px: number; mark_px: number; liq_px: number | null;
  leverage: number; funding_rate_hourly: number;
}

export interface StateResponse {
  calm: SnapshotRow | null;
  cockpit: SnapshotRow | null;
  positions?: PositionRow[];
  markets?: Array<{ asset: string; markPx: number; oraclePx: number; fundingRateHourly: number; openInterest: number }>;
  account?: { equity: number; marginUsed: number; marginFree: number };
}

export const api = {
  state: () => get<StateResponse>('/api/state'),
  history: (book: string, range = '24h') => get<SnapshotRow[]>(`/api/history?book=${book}&range=${range}`),
  positions: (book?: string) => get<PositionRow[]>(`/api/positions${book ? `?book=${book}` : ''}`),
  control: {
    leverage: (book: string, leverage: number) => post('/api/control/leverage', { book, leverage }),
    asset: (book: string, asset: string, side: string, leverage: number) => post('/api/control/asset', { book, asset, side, leverage }),
    close: (book: string | 'all') => post('/api/control/close', { book }),
  },
};
