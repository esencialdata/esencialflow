const ensureNoTrailingSlash = (url: string) => url.replace(/\/$/, '');

const FALLBACK_DEV_ORIGIN = 'http://localhost:3001';
const API_PATH = '/api';

const resolveApiUrl = () => {
  const envUrl = import.meta.env?.VITE_API_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return ensureNoTrailingSlash(envUrl.trim());
  }

  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return `${window.location.origin}${API_PATH}`;
  }

  return `${FALLBACK_DEV_ORIGIN}${API_PATH}`;
};

export const API_URL = ensureNoTrailingSlash(resolveApiUrl());

export default API_URL;
