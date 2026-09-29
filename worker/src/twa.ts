/**
 * Telegram Web App initData validation.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function validateInitData(initData: string, botToken: string): Promise<{ userId: string } | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const keyBytes = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));

  const hmacKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(dataCheckString));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== hash) return null;

  // Check freshness (5 min)
  const authDate = parseInt(params.get('auth_date') ?? '0');
  if (Date.now() / 1000 - authDate > 300) return null;

  const user = params.get('user');
  if (!user) return null;
  const userId = JSON.parse(user)?.id?.toString();
  return userId ? { userId } : null;
}

export async function isOwner(request: Request, env: { TELEGRAM_BOT_TOKEN: string; TELEGRAM_OWNER_USER_ID: string }): Promise<boolean> {
  const initData = request.headers.get('X-Telegram-Init-Data');
  if (!initData) return false;
  const result = await validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
  return result?.userId === env.TELEGRAM_OWNER_USER_ID;
}
