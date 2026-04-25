import axios from 'axios';
import { useAuthStore } from '@/app/store/auth.store';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const shopId = useAuthStore.getState().activeShopId;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (shopId) config.headers['x-shop-id'] = shopId;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retried) {
      original._retried = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const res = await axios.post('/api/auth/refresh', { refreshToken });
        useAuthStore.getState().setTokens(
          res.data.data.accessToken,
          res.data.data.refreshToken,
        );
        original.headers.Authorization = `Bearer ${res.data.data.accessToken}`;
        return apiClient(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
