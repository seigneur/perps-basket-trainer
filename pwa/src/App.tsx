import { useEffect, useState } from 'react';
import { useAppState } from './lib/useData';
import { isInTelegram, twaUser } from './lib/twa';
import { CalmPanel } from './panels/CalmPanel';
import { CockpitPanel } from './panels/CockpitPanel';

const OWNER_ID = import.meta.env.VITE_OWNER_TG_ID ?? '';

export default function App() {
  const { data, error } = useAppState(15_000);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // Owner = launched from Telegram + user ID matches
    if (isInTelegram && twaUser && OWNER_ID && String(twaUser.id) === OWNER_ID) {
      setIsOwner(true);
    }
  }, []);

  const positions = data?.positions ?? [];
  const markets = data?.markets ?? [];
  const account = data?.account ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d0d0f]">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 border-b border-white/[0.05]" style={{ paddingTop: 'max(6px, env(safe-area-inset-top))', paddingBottom: '6px' }}>
        <div className="text-[10px] text-white/25 tracking-widest uppercase">Perps Basket</div>
        <div className="flex items-center gap-2">
          {error && <div className="text-[10px] text-red-400/70">offline</div>}
          {isOwner && <div className="text-[10px] text-emerald-400/60">owner</div>}
          {!isInTelegram && <div className="text-[10px] text-white/25">read-only</div>}
        </div>
      </div>

      {/* Top panel — CALM (40%) */}
      <div className="flex-none" style={{ height: '40%' }}>
        <CalmPanel
          snapshot={data?.calm ?? null}
          isOwner={isOwner}
        />
      </div>

      {/* Divider */}
      <div className="flex-none h-px bg-white/[0.07]" />

      {/* Bottom panel — COCKPIT (60%) */}
      <div className="flex-1 min-h-0">
        <CockpitPanel
          snapshot={data?.cockpit ?? null}
          positions={positions}
          markets={markets}
          account={account}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
}
