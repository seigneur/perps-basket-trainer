import { api, type SnapshotRow, type PositionRow } from '../lib/api';
import { useHistory } from '../lib/useData';
import { useState } from 'react';

interface Props {
  snapshot: SnapshotRow | null;
  positions: PositionRow[];
  markets: Array<{ asset: string; markPx: number; oraclePx: number; fundingRateHourly: number; openInterest: number }>;
  account: { equity: number; marginUsed: number; marginFree: number } | null;
  isOwner: boolean;
}

const ASSETS = ['ETH', 'BTC', 'NEAR'];

function LiqBar({ markPx, liqPx, side }: { markPx: number; liqPx: number | null; side: 'long' | 'short' }) {
  if (!liqPx) return <div className="h-1.5 rounded-full bg-white/10 w-full" />;
  const dist = Math.abs((markPx - liqPx) / markPx);
  const pct = Math.min(100, dist * 100 / 0.15); // 15% = full green bar
  const color = dist < 0.03 ? '#ef4444' : dist < 0.07 ? '#f97316' : dist < 0.12 ? '#eab308' : '#22c55e';
  return (
    <div className="h-1.5 rounded-full bg-white/10 w-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function PnlBar({ price, funding, fees }: { price: number; funding: number; fees: number }) {
  const total = Math.abs(price) + Math.abs(funding) + Math.abs(fees) || 1;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-full gap-px">
      <div style={{ width: `${Math.abs(price) / total * 100}%`, background: price >= 0 ? '#22c55e' : '#ef4444' }} />
      <div style={{ width: `${Math.abs(funding) / total * 100}%`, background: funding >= 0 ? '#3b82f6' : '#8b5cf6' }} />
      <div style={{ width: `${Math.abs(fees) / total * 100}%`, background: '#6b7280' }} />
    </div>
  );
}

function Sparkline({ history }: { history: { equity_usd: number }[] }) {
  if (history.length < 2) return <div className="h-8 text-white/20 text-xs flex items-center">no history</div>;
  const vals = history.map(h => h.equity_usd);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 120, h = 32;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function AssetCard({ asset, pos, market, isOwner, onControl }: {
  asset: string;
  pos: PositionRow | null;
  market: { markPx: number; oraclePx: number; fundingRateHourly: number; openInterest: number } | null;
  isOwner: boolean;
  onControl: (asset: string, side: string, leverage: number) => void;
}) {
  const side = pos ? (pos.size > 0 ? 'long' : 'short') : 'flat';
  const fundDir = (market?.fundingRateHourly ?? 0) > 0 ? 'you earn' : 'you pay';
  const annualized = ((market?.fundingRateHourly ?? 0) * 8760 * 100).toFixed(1);
  const spreadBps = market ? ((market.markPx - market.oraclePx) / market.oraclePx * 10000).toFixed(1) : '—';

  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3.5 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-white">{asset}</div>
        <div className={`text-xs font-medium px-2 py-0.5 rounded-full
          ${side === 'long' ? 'bg-emerald-500/15 text-emerald-400' :
            side === 'short' ? 'bg-red-500/15 text-red-400' :
            'bg-white/10 text-white/40'}`}>
          {side === 'flat' ? 'flat' : `${side} ${pos?.leverage?.toFixed(1)}x`}
        </div>
      </div>

      {pos && (
        <>
          {/* Entry / Mark */}
          <div className="flex gap-4 text-xs">
            <div><span className="text-white/40">entry </span><span className="tabular-nums text-white/80">{pos.entry_px.toFixed(2)}</span></div>
            <div><span className="text-white/40">mark </span><span className="tabular-nums text-white/80">{pos.mark_px.toFixed(2)}</span></div>
            <div><span className="text-white/40">spread </span><span className="tabular-nums text-white/50">{spreadBps}bp</span></div>
          </div>

          {/* Liq bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-white/30">
              <span>liq distance</span>
              <span>{pos.liq_px ? `${(Math.abs((pos.mark_px - pos.liq_px) / pos.mark_px) * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <LiqBar markPx={pos.mark_px} liqPx={pos.liq_px} side={side as 'long' | 'short'} />
          </div>

          {/* PnL decomp bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-white/30">
              <span>P price / F funding / — fees</span>
            </div>
            <PnlBar price={0} funding={0} fees={0} />
          </div>
        </>
      )}

      {/* Funding */}
      <div className="flex gap-4 text-xs">
        <div>
          <span className="text-white/40">funding/h </span>
          <span className="tabular-nums text-white/80">{((market?.fundingRateHourly ?? 0) * 100).toFixed(4)}%</span>
        </div>
        <div>
          <span className="text-white/40">APY </span>
          <span className="tabular-nums text-white/60">{annualized}%</span>
        </div>
        <div className={`text-[10px] px-1.5 py-0.5 rounded ${(market?.fundingRateHourly ?? 0) > 0 ? 'text-emerald-400/70' : 'text-orange-400/70'}`}>
          {fundDir}
        </div>
      </div>

      {/* OI */}
      <div className="text-[10px] text-white/25">
        OI {market ? (market.openInterest / 1e6).toFixed(1) + 'M' : '—'}
      </div>

      {/* Per-asset controls */}
      {isOwner && (
        <div className="flex gap-2 pt-1">
          <button onClick={() => onControl(asset, 'long', 1)} className="flex-1 text-[11px] py-1 rounded border border-emerald-500/30 text-emerald-400/70 active:bg-emerald-500/10">Long</button>
          <button onClick={() => onControl(asset, 'short', 1)} className="flex-1 text-[11px] py-1 rounded border border-red-500/30 text-red-400/70 active:bg-red-500/10">Short</button>
          {pos && <button onClick={() => onControl(asset, 'close', 0)} className="flex-1 text-[11px] py-1 rounded border border-white/15 text-white/40 active:bg-white/5">Close</button>}
        </div>
      )}
    </div>
  );
}

export function CockpitPanel({ snapshot, positions, markets, account, isOwner }: Props) {
  const history = useHistory('cockpit');

  const pnl = snapshot?.equity_usd ?? null;
  const pnlPct = pnl !== null ? ((pnl / 250) * 100) : null;

  const totalFundingPaid = positions.filter(p => p.funding_rate_hourly < 0).reduce((s, _) => s, 0);
  const totalFundingEarned = positions.filter(p => p.funding_rate_hourly > 0).reduce((s, _) => s, 0);

  async function handleAssetControl(asset: string, side: string, leverage: number) {
    if (side === 'close') {
      await api.control.asset('cockpit', asset, 'close', 0);
    } else {
      await api.control.asset('cockpit', asset, side, leverage);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-6 space-y-3">
      {/* Book header */}
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/30">COCKPIT</div>
        <div className={`text-xl font-semibold tabular-nums ${pnl === null ? 'text-white/20' : pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : '—'}
          {pnlPct !== null && <span className="text-sm text-white/40 ml-1.5">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>}
        </div>
      </div>

      {/* Asset cards */}
      {ASSETS.map(asset => (
        <AssetCard
          key={asset}
          asset={asset}
          pos={positions.find(p => p.asset === asset && p.book === 'cockpit') ?? null}
          market={markets.find(m => m.asset === asset) ?? null}
          isOwner={isOwner}
          onControl={handleAssetControl}
        />
      ))}

      {/* Book-level readouts */}
      <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3.5 space-y-3">
        <div className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30">Book Summary</div>

        <div className="flex gap-4 text-xs">
          <div><span className="text-white/40">margin used </span><span className="tabular-nums">{account?.marginUsed.toFixed(2) ?? '—'}</span></div>
          <div><span className="text-white/40">free </span><span className="tabular-nums text-emerald-400/70">{account?.marginFree.toFixed(2) ?? '—'}</span></div>
        </div>

        <div className="flex gap-6 text-xs">
          <div><span className="text-white/40">funding paid </span><span className="tabular-nums text-orange-400">{totalFundingPaid.toFixed(4)}</span></div>
          <div><span className="text-white/40">funding earned </span><span className="tabular-nums text-emerald-400">{totalFundingEarned.toFixed(4)}</span></div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] text-white/30">equity (24h)</div>
          <Sparkline history={history} />
        </div>
      </div>

      {/* Close all */}
      {isOwner && (
        <button
          onClick={() => api.control.close('all')}
          className="w-full py-2.5 rounded-lg text-sm font-medium border border-red-500/30 text-red-400/70 active:bg-red-500/10"
        >
          Close All Positions
        </button>
      )}
    </div>
  );
}
