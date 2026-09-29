declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: { user?: { id: number; first_name: string } };
        expand: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        ready: () => void;
      };
    };
  }
}

export const twa = window.Telegram?.WebApp ?? null;
export const initData = twa?.initData ?? '';
export const twaUser = twa?.initDataUnsafe?.user ?? null;
export const isInTelegram = !!twa && !!initData;

export function getAuthHeaders(): HeadersInit {
  if (!initData) return {};
  return { 'X-Telegram-Init-Data': initData };
}
