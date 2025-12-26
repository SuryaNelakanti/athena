export type AccentId = 'copper' | 'coral' | 'sage' | 'amber';

export const ACCENT_OPTIONS: Array<{ id: AccentId; label: string }> = [
  { id: 'sage', label: 'Mint' },
  { id: 'amber', label: 'Ember' },
  { id: 'copper', label: 'Copper' },
  { id: 'coral', label: 'Coral' },
];

const STORAGE_KEY = 'athena-accent';

export const getStoredAccent = (): AccentId => {
  if (typeof window === 'undefined') return 'sage';
  const value = window.localStorage.getItem(STORAGE_KEY);
  const found = ACCENT_OPTIONS.find((option) => option.id === value);
  return found ? found.id : 'sage';
};

export const setAccent = (accent: AccentId) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-accent', accent);
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, accent);
  }
};

export const initAccent = () => {
  const accent = getStoredAccent();
  setAccent(accent);
  return accent;
};
