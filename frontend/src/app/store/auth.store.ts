import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeToken } from '@/lib/auth/token';

interface User {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  permissions: Record<string, Record<string, boolean>>;
}

interface ShopSummary {
  id: string;
  name: string;
  type?: string;
  phone?: string;
  gst_number?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  shops: ShopSummary[];
  activeShopId: string | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: Partial<User>) => void;
  setActiveShop: (shopId: string) => void;
  hydrateContext: (payload: { user: Partial<User>; shops?: ShopSummary[]; activeShopId?: string | null }) => void;
  logout: () => void;
  can: (resource: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      shops: [],
      activeShopId: null,
      isAuthenticated: false,

      setTokens: (access, refresh) => {
        const payload = decodeToken(access);
        set((state) => ({
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: true,
          activeShopId: state.activeShopId ?? payload?.shopId ?? null,
          user: state.user ?? payload ? {
            id: state.user?.id ?? payload?.sub ?? '',
            name: state.user?.name ?? 'Store Owner',
            email: state.user?.email ?? payload?.email ?? '',
            tenantId: state.user?.tenantId ?? payload?.tenantId ?? '',
            permissions: payload?.permissions ?? state.user?.permissions ?? {},
          } : null,
        }));
      },

      setUser: (user) => set((state) => ({
        user: {
          id: user.id ?? state.user?.id ?? '',
          name: user.name ?? state.user?.name ?? 'Store Owner',
          email: user.email ?? state.user?.email ?? '',
          tenantId: user.tenantId ?? state.user?.tenantId ?? '',
          permissions: user.permissions ?? state.user?.permissions ?? {},
        },
      })),

      setActiveShop: (shopId) => set({ activeShopId: shopId }),

      hydrateContext: ({ user, shops, activeShopId }) =>
        set((state) => ({
          user: {
            id: user.id ?? state.user?.id ?? '',
            name: user.name ?? state.user?.name ?? 'Store Owner',
            email: user.email ?? state.user?.email ?? '',
            tenantId: user.tenantId ?? state.user?.tenantId ?? '',
            permissions: user.permissions ?? state.user?.permissions ?? {},
          },
          shops: shops ?? state.shops,
          activeShopId: activeShopId ?? state.activeShopId,
        })),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          shops: [],
          activeShopId: null,
          isAuthenticated: false,
        }),

      can: (resource, action) => {
        const perms = get().user?.permissions ?? {};
        return perms[resource]?.[action] === true;
      },
    }),
    { name: 'shoposphere-auth' },
  ),
);
