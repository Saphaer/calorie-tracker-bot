import type { DashboardData, Food, WeightLog } from '@nourish/shared';
import { demoDashboard, demoFoods, demoWeights } from './demo';

const base = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.PROD ? 'https://nourish-api.sfrnuri.workers.dev' : undefined);
const headers = () => ({
  'content-type': 'application/json',
  'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData ?? '',
  'X-Demo-User-Id': window.Telegram?.WebApp?.initData ? '' : '10001',
});

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!base) throw new Error('demo');
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers(), ...options?.headers } });
  const body = (await response.json()) as { success: boolean; data: T; error?: string };
  if (!response.ok || !body.success) throw new Error(body.error ?? 'Request failed');
  return body.data;
}

export const api = {
  dashboard: async () => request<DashboardData>('/api/dashboard').catch(() => demoDashboard),
  foods: async (query = '') => request<Food[]>(`/api/foods?q=${encodeURIComponent(query)}`).catch(() => demoFoods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase()))),
  addFood: (payload: unknown) => request<Food>('/api/foods', { method: 'POST', body: JSON.stringify(payload) }),
  toggleFavorite: (foodId: string) => request(`/api/foods/${foodId}/favorite`, { method: 'PATCH' }),
  addMeal: (payload: unknown) => request<{ reward: { leveledUp: boolean }; rewards: Array<{ type: string; title: string; xp: number; leveledUp: boolean }> }>('/api/meals', { method: 'POST', body: JSON.stringify(payload) }),
  deleteMeal: (itemId: string) => request(`/api/meals/${itemId}`, { method: 'DELETE' }),
  addWater: (amountMl: number) => request<{ amountMl: number; rewards: Array<{ title: string; xp: number }> }>('/api/water', { method: 'POST', body: JSON.stringify({ amountMl }) }),
  weights: async () => request<WeightLog[]>('/api/weights').catch(() => demoWeights),
  addWeight: (weightKg: number) => request('/api/weights', { method: 'POST', body: JSON.stringify({ weightKg }) }),
  stats: async (days: number) => request<{ days: Array<{ date: string; calories: number; protein: number; carbs: number; fat: number; waterMl: number }>; weights: WeightLog[] }>(`/api/stats?days=${days}`).catch(() => ({ days: Array.from({ length: days }, (_, index) => ({ date: new Date(Date.now() - (days - index - 1) * 86400000).toISOString().slice(0, 10), calories: 1650 + Math.round(Math.sin(index) * 280 + index * 11), protein: 92 + Math.round(Math.cos(index) * 18), carbs: 185 + Math.round(Math.sin(index * 0.7) * 35), fat: 54 + Math.round(Math.cos(index * 0.8) * 12), waterMl: 1700 + Math.round(Math.sin(index) * 340) })), weights: demoWeights })),
  onboarding: (payload: unknown) => request('/api/profile/onboarding', { method: 'PUT', body: JSON.stringify(payload) }),
  settings: () => request<Record<string, unknown>>('/api/settings'),
  updateSettings: (payload: unknown) => request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  exportData: () => request<Record<string, unknown>>('/api/export'),
  deleteAccount: () => request('/api/account', { method: 'DELETE' }),
};
