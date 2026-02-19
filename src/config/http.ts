import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { API_URL } from './api';
import { auth } from './firebase';

export const api = axios.create({
  // Avoid indefinite hanging requests that can block timer side effects.
  timeout: 15000,
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      const headers = AxiosHeaders.from(config.headers ?? {});
      headers.set('Authorization', `Bearer ${token}`);
      config.headers = headers;
    }
  } catch (error) {
    console.error('No se pudo obtener el token de Firebase:', error);
  }

  return config;
});

api.interceptors.request.use(config => {
  const url = config.url ?? '';
  const hasScheme = /^https?:\/\//i.test(url);
  if (url && (hasScheme || url.startsWith(API_URL))) {
    return config;
  }

  const base = API_URL.replace(/\/$/, '');
  const path = url ? `/${url.replace(/^\/+/, '')}` : '';
  config.url = `${base}${path}`;
  return config;
});

export default api;
