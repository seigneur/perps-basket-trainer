import { useState } from 'react';
import { api, type SnapshotRow } from '../lib/api';
import { isInTelegram } from '../lib/twa';

interface Props {
  snapshot: SnapshotRow | null;
  isOwner: boolean;
}

const LEVERAGE_OPTIONS = [-10, -1, 1, 10] as const;

function moodGradient(benchmarkPct: number): string {
  const clamped = Math.max(-5, Math.min(5, benchmarkPct));
  const t = (clamped + 5) / 10; // 0 = behind, 0.5 = neutral, 1 = ahead
  if (t > 0.55) {
    const intensity = Math.round((t - 0.5) * 2 * 40);
    return `linear-gradient(180deg, rgba(16,${80 + intensity},40,0.35) 0%, #0d0d0f 100%)`;
  }
  if (t < 0.45) {
    const intensity = Math.round((0.5 - t) * 2 * 40);
    return `linear-gradient(180deg, rgba(${80 + intensity},16,24,0.35) 0%, #0d0d0f 100%)`;
  }
  return 'linear-gradient(180deg, rgba(30,30,40,0.5) 0%, #0d0d0f 100%)';
}

export function CalmPanel({ snapshot, isOwner }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [selectedLev, setSelectedLev] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const pnl = snapshot?.equity_usd ?? null;
  const pnlPct = pnl !== null ? ((pnl / 250) * 100) : null;
  const benchmark = snapshot?.benchmark_pct ?? 0;

  const pnlStr = pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : '—';
  const pnlPctStr = pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '';

  async function handleLeverage(lev: number) {
    if (!isOwner || busy) return;
    setSelectedLev(lev);
    setBusy(true);
    try {
      await api.control.leverage('calm', lev);
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!isOwner || busy) return;
    if (!confirm('Close entire CALM book? A proposal will be sent for approval.')) return;
    setBusy(true);
    try {
      await api.control.close('calm');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col h-full px-5 pt-6 pb-4"
      style={{ background: moodGradient(benchmark), transition: 'background 1s ease' }}
    >
      {/* Book label */}
      <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/30 mb-3">CALM</div>

      {/* Big PnL number */}
      <button
        className="flex-1 flex flex-col items-center justify-center text-center select-none"
        onClick={() => setShowBreakdown(v => !v)}
      >
        <div className={`text-5xl font-semibold tabular-nums ${pnl === null ? 'text-white/20' : pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {pnlStr}
        </div>
        {pnlPctStr && (
          <div className="text-lg text-white/50 mt-1">{pnlPctStr}</div>
        )}
        {snapshot && (
          <div className="text-xs text-white/30 mt-1">
            vs market {benchmark >= 0 ? '+' : ''}{benchmark.toFixed(2)}%
          </div>
        )}
        {showBreakdown && snapshot && (
          <div className="text-xs text-white/50 mt-3 font-mono">
            price {snapshot.pnl_price >= 0 ? '+' : ''}{snapshot.pnl_price.toFixed(2)}
            {'  '}funding {snapshot.pnl_funding >= 0 ? '+' : ''}{snapshot.pnl_funding.toFixed(2)}
            {'  '}fees {snapshot.pnl_fees >= 0 ? '+' : ''}{snapshot.pnl_fees.toFixed(2)}
          </div>
        )}
      </button>

      {/* Controls */}
      <div className="space-y-3">
        {/* Leverage switch */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {LEVERAGE_OPTIONS.map(lev => (
            <button
              key={lev}
              onClick={() => handleLeverage(lev)}
              disabled={!isOwner || busy}
              className={`flex-1 py-2 text-sm font-medium transition-colors
                ${selectedLev === lev ? 'bg-white/15 text-white' : 'text-white/40'}
                ${isOwner ? 'active:bg-white/10' : 'cursor-default'}
                ${lev < 0 ? 'text-red-400/70' : ''}`}
            >
              {lev > 0 ? `${lev}x` : `${lev}x`}
            </button>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          disabled={!isOwner || busy}
          className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-colors
            ${isOwner
              ? 'border-red-500/40 text-red-400 active:bg-red-500/10'
              : 'border-white/10 text-white/20 cursor-default'}`}
        >
          {isOwner ? 'Close Book' : 'Close Book (read-only)'}
        </button>
      </div>
    </div>
  );
}
