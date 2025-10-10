import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { API_URL } from './api';
import { auth } from './firebase';

export const api = axios.create({
  baseURL: API_URL,
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

export default api;
