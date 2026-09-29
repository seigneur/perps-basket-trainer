export async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Telegram send failed', res.status, body);
  }
}

export function formatSummary(
  isOvernight: boolean,
  calm: { equity: number; pnlPrice: number; pnlFunding: number; pnlFees: number; benchmarkPct: number } | null,
  cockpit: { equity: number; pnlPrice: number; pnlFunding: number; pnlFees: number; positions: Array<{ asset: string; side: string; leverage: number; liqDistPct: number; fundingRateHourly: number }> } | null,
  totals: { feesTotal: number; fundingNet: number },
  now: Date,
): string {
  const sgt = now.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false });
  const header = isOvernight ? `${sgt} SGT  |  overnight report` : `${sgt} SGT`;
  const lines: string[] = [header, ''];

  if (calm) {
    const pnlSign = calm.equity >= 0 ? '+' : '';
    const pnlPct = ((calm.equity / 250) * 100).toFixed(1);
    const mktSign = calm.benchmarkPct >= 0 ? '+' : '';
    lines.push(`<b>CALM</b>   ${pnlSign}${calm.equity.toFixed(2)} USDC (${pnlSign}${pnlPct}%)   vs market ${mktSign}${calm.benchmarkPct.toFixed(1)}%`);
    lines.push(`       price ${calm.pnlPrice >= 0 ? '+' : ''}${calm.pnlPrice.toFixed(2)}  funding ${calm.pnlFunding >= 0 ? '+' : ''}${calm.pnlFunding.toFixed(2)}  fees ${calm.pnlFees >= 0 ? '+' : ''}${calm.pnlFees.toFixed(2)}`);
  }

  if (cockpit) {
    const pnlSign = cockpit.equity >= 0 ? '+' : '';
    const pnlPct = ((cockpit.equity / 250) * 100).toFixed(1);
    lines.push(`<b>COCKPIT</b> ${pnlSign}${cockpit.equity.toFixed(2)} USDC (${pnlSign}${pnlPct}%)`);
    for (const p of cockpit.positions) {
      const dir = `${p.side} ${p.leverage}x`;
      const fundingDir = p.fundingRateHourly > 0 ? 'you earn' : 'you pay';
      lines.push(`       ${p.asset} ${dir}  liq ${p.liqDistPct.toFixed(1)}% away  funding ${(p.fundingRateHourly * 100).toFixed(3)}%/h (${fundingDir})`);
    }
    const flat = ['ETH', 'BTC', 'NEAR'].filter(a => !cockpit.positions.find(p => p.asset === a));
    for (const a of flat) lines.push(`       ${a} flat`);
  }

  lines.push('');
  lines.push(`Fees to date ${totals.feesTotal.toFixed(2)}   Funding net ${totals.fundingNet >= 0 ? '+' : ''}${totals.fundingNet.toFixed(2)}`);

  return lines.join('\n');
}
