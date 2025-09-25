const ensureNoTrailingSlash = (url: string) => url.replace(/\/$/, '');

const DEFAULT_API_URL = 'http://localhost:3001/api';

const resolveApiUrl = () => {
  const envUrl = import.meta.env?.VITE_API_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return ensureNoTrailingSlash(envUrl.trim());
  }
  return DEFAULT_API_URL;
};

export const API_URL = resolveApiUrl();

export default API_URL;
