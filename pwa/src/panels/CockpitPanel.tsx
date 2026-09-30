import { api, type SnapshotRow, type PositionRow } from '../lib/api';
import { useHistory } from '../lib/useData';
import { useState } from 'react';

interface MarketRow {
  asset: string;
  markPx: number;
  oraclePx: number;
  fundingRateHourly: number;
  openInterest: number;
}

interface Props {
  snapshot: SnapshotRow | null;
  positions: PositionRow[];
  markets: MarketRow[];
  account: { equity: number; marginUsed: number; marginFree: number } | null;
  isOwner: boolean;
}

const ASSETS = ['ETH', 'BTC', 'NEAR'];
const LEVERAGES = [1, 3, 5, 10] as const;
const ASSUMED_SIZE_USD = 125;
const TAKER_FEE = 0.0005;

function LiqBar({ markPx, liqPx }: { markPx: number; liqPx: number | null }) {
  if (!liqPx || !markPx) return <div className="h-2 rounded-full bg-white/10 w-full" />;
  const dist = Math.abs((markPx - liqPx) / markPx);
  const pct = Math.min(100, (dist / 0.15) * 100);
  const color = dist < 0.03 ? '#ef4444' : dist < 0.07 ? '#f97316' : dist < 0.12 ? '#eab308' : '#22c55e';
  return (
    <div className="h-2 rounded-full bg-white/10 w-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function PnlBar({ price, funding, fees }: { price: number; funding: number; fees: number }) {
  const total = Math.abs(price) + Math.abs(funding) + Math.abs(fees) || 1;
  const pPct = Math.abs(price) / total * 100;
  const fPct = Math.abs(funding) / total * 100;
  const ePct = Math.abs(fees) / total * 100;
  return (
    <div className="h-1.5 rounded-full overflow-hidden w-full flex gap-px bg-white/5">
      <div style={{ width: `${pPct}%`, background: price >= 0 ? '#22c55e' : '#ef4444' }} />
      <div style={{ width: `${fPct}%`, background: funding >= 0 ? '#3b82f6' : '#8b5cf6' }} />
      <div style={{ width: `${ePct}%`, background: '#4b5563' }} />
    </div>
  );
}

function Sparkline({ history }: { history: { equity_usd: number }[] }) {
  if (history.length < 2) return null;
  const vals = history.map(h => h.equity_usd);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 80, h = 20;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 3) - 1.5}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function AssetRow({
  asset, pos, market, isOwner, onPropose,
}: {
  asset: string;
  pos: PositionRow | null;
  market: MarketRow | null;
  isOwner: boolean;
  onPropose: (asset: string, side: 'long' | 'short' | 'close', leverage: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState<number>(1);

  const markPx = market?.markPx ?? 0;
  const fundRate = market?.fundingRateHourly ?? 0;
  const hasPos = !!pos;
  const posSide: 'long' | 'short' | null = pos ? (pos.size > 0 ? 'long' : 'short') : null;
  const liqPct = pos?.liq_px && pos.mark_px
    ? Math.abs((pos.mark_px - pos.liq_px) / pos.mark_px) * 100
    : null;

  // Funding direction relative to current or selected side
  const activeSide = posSide ?? (expanded ? side : null);
  const fundPay = activeSide !== null
    ? (activeSide === 'long') === (fundRate > 0)
    : null;
  const fundLabel = fundPay === null ? null : fundPay ? 'you pay' : 'you earn';
  const fundColor = fundPay === null ? '' : fundPay ? 'text-orange-400' : 'text-emerald-400';

  // What-if cost (flat, no position)
  const assumedLev = expanded ? leverage : 1;
  const notional = ASSUMED_SIZE_USD * assumedLev;
  const fundCostDay = Math.abs(fundRate) * 24 * notional;
  const feeOpen = TAKER_FEE * notional;

  return (
    <div className="border-b border-white/[0.05] last:border-0">
      {/* Collapsed row */}
      <button
        className="w-full text-left py-2.5 flex items-center gap-2"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="w-9 text-[13px] font-bold text-white font-mono">{asset}</span>
        <span className="flex-1 text-[13px] tabular-nums text-white/75 font-mono">
          {markPx > 0
            ? markPx.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: markPx > 100 ? 1 : 3 })
            : '—'}
        </span>
        <span className="text-[10px] tabular-nums text-white/35 font-mono">
          f {fundRate !== 0 ? `${(fundRate * 100).toFixed(4)}%/h` : '0.0000%/h'}
        </span>
        <span className={`w-14 text-right text-[11px] font-semibold font-mono ${
          posSide === 'long' ? 'text-emerald-400' : posSide === 'short' ? 'text-red-400' : 'text-white/25'
        }`}>
          {posSide ? `${posSide === 'long' ? 'L' : 'S'}${pos!.leverage.toFixed(0)}x` : 'FLAT'}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="pb-3.5 space-y-2.5">
          {hasPos && (
            <>
              {/* Health bar — most prominent */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/30">health</span>
                  <span className={liqPct !== null && liqPct < 5 ? 'text-red-400 font-medium' : 'text-white/40'}>
                    {liqPct !== null ? `${liqPct.toFixed(1)}% to liq` : '—'}
                  </span>
                </div>
                <LiqBar markPx={pos!.mark_px} liqPx={pos!.liq_px} />
              </div>

              {/* PnL bar */}
              <div>
                <PnlBar price={pos!.mark_px - pos!.entry_px} funding={0} fees={0} />
                <div className="flex gap-3 mt-1 text-[9px] text-white/25">
                  <span className="text-green-400/50">■ price</span>
                  <span className="text-blue-400/50">■ funding</span>
                  <span className="text-gray-500">■ fees</span>
                </div>
              </div>

              {/* Entry / mark */}
              <div className="flex gap-4 text-[11px] font-mono text-white/40">
                <span>entry <span className="text-white/65">{pos!.entry_px.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span></span>
                <span>mark <span className="text-white/65">{pos!.mark_px.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span></span>
              </div>
            </>
          )}

          {/* Market data (always visible when expanded) */}
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="text-white/35">f/h</span>
            <span className="tabular-nums text-white/60">{(fundRate * 100).toFixed(4)}%</span>
            {fundLabel && (
              <span className={`text-[10px] font-sans font-medium ${fundColor}`}>{fundLabel}</span>
            )}
            <span className="ml-auto text-[10px] text-white/20">
              OI {market ? `${(market.openInterest / 1e6).toFixed(1)}M` : '—'}
            </span>
          </div>

          {/* What-if preview when flat */}
          {!hasPos && markPx > 0 && (
            <div className="text-[10px] font-mono text-white/30 bg-white/[0.03] rounded-lg px-2.5 py-2 leading-relaxed">
              Long {leverage}x of {ASSUMED_SIZE_USD} USDC<br />
              <span className="text-white/45">
                ~${fundCostDay.toFixed(3)}/day funding ({fundPay ? 'you pay' : 'you earn'})
                {'  '}~${feeOpen.toFixed(3)} to open
              </span>
            </div>
          )}

          {/* Controls */}
          {isOwner && (
            <div className="space-y-2 pt-1">
              {/* Side selector */}
              <div className="flex rounded-lg overflow-hidden border border-white/10 text-[11px] font-medium">
                <button
                  onClick={() => setSide('long')}
                  className={`flex-1 py-1.5 transition-colors ${side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/25 active:bg-white/5'}`}
                >
                  Long
                </button>
                <button
                  onClick={() => setSide('short')}
                  className={`flex-1 py-1.5 transition-colors ${side === 'short' ? 'bg-red-500/20 text-red-400' : 'text-white/25 active:bg-white/5'}`}
                >
                  Short
                </button>
              </div>

              {/* Leverage chips */}
              <div className="flex gap-1.5">
                {LEVERAGES.map(l => (
                  <button
                    key={l}
                    onClick={() => setLeverage(l)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-colors ${
                      leverage === l
                        ? 'bg-white/15 text-white'
                        : 'border border-white/10 text-white/30 active:bg-white/5'
                    }`}
                  >
                    {l}x
                  </button>
                ))}
              </div>

              {/* Cost preview */}
              <div className="text-[10px] font-mono text-white/25">
                ${feeOpen.toFixed(3)} to open · ${fundCostDay.toFixed(3)}/day funding
              </div>

              {/* Propose button */}
              <button
                onClick={() => onPropose(asset, side, leverage)}
                className={`w-full py-2.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                  side === 'long'
                    ? 'border-emerald-500/40 text-emerald-400 active:bg-emerald-500/10'
                    : 'border-red-500/40 text-red-400 active:bg-red-500/10'
                }`}
              >
                Propose {side} {leverage}x → Telegram
              </button>

              {hasPos && (
                <button
                  onClick={() => onPropose(asset, 'close', 0)}
                  className="w-full py-2 rounded-lg text-[11px] border border-white/15 text-white/30 active:bg-white/5"
                >
                  Propose Close
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CockpitPanel({ snapshot, positions, markets, account, isOwner }: Props) {
  const history = useHistory('cockpit');
  const equity = account?.equity ?? snapshot?.equity_usd ?? null;
  const marginUsed = account?.marginUsed ?? 0;
  const marginPct = equity && equity > 0 ? (marginUsed / equity) * 100 : 0;
  const fundingNet = snapshot?.pnl_funding ?? 0;
  const feesTotal = Math.abs(snapshot?.pnl_fees ?? 0);

  async function handlePropose(asset: string, side: 'long' | 'short' | 'close', leverage: number) {
    if (side === 'close') {
      await api.control.asset('cockpit', asset, 'close', 0);
    } else {
      await api.control.asset('cockpit', asset, side, leverage);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Book strip */}
      <div className="flex-none px-4 pt-3 pb-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-1 text-[9px] font-semibold tracking-[0.18em] uppercase text-white/25 mb-2">
          COCKPIT
          <div className="ml-auto">
            <Sparkline history={history} />
          </div>
        </div>
        <div className="flex gap-0 text-[11px] font-mono">
          <div className="flex-1">
            <div className="text-white/25 text-[9px] mb-0.5">EQUITY</div>
            <div className={`tabular-nums font-semibold ${equity === null ? 'text-white/20' : 'text-white/90'}`}>
              {equity !== null ? `$${equity.toFixed(2)}` : '—'}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-white/25 text-[9px] mb-0.5">MARGIN</div>
            <div className="tabular-nums text-white/55">
              {marginUsed > 0 ? `${marginPct.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-white/25 text-[9px] mb-0.5">FUNDING</div>
            <div className={`tabular-nums ${fundingNet >= 0 ? 'text-emerald-400/70' : 'text-orange-400/70'}`}>
              {fundingNet !== 0 ? `${fundingNet >= 0 ? '+' : ''}$${fundingNet.toFixed(3)}` : '—'}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-white/25 text-[9px] mb-0.5">FEES</div>
            <div className="tabular-nums text-white/35">
              {feesTotal > 0 ? `-$${feesTotal.toFixed(3)}` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Asset rows */}
      <div className="flex-1 overflow-y-auto px-4">
        {ASSETS.map(asset => (
          <AssetRow
            key={asset}
            asset={asset}
            pos={positions.find(p => p.asset === asset && p.book === 'cockpit') ?? null}
            market={markets.find(m => m.asset === asset) ?? null}
            isOwner={isOwner}
            onPropose={handlePropose}
          />
        ))}

        {/* Close all */}
        {isOwner && positions.length > 0 && (
          <button
            onClick={() => api.control.close('all')}
            className="w-full mt-3 mb-2 py-2.5 rounded-lg text-[12px] border border-red-500/25 text-red-400/60 active:bg-red-500/10"
          >
            Propose Close All → Telegram
          </button>
        )}
      </div>
    </div>
  );
}
