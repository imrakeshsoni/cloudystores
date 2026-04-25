import { useAuthStore } from '@/app/store/auth.store';

export type ShopType = 'medical' | 'grocery' | 'retail' | 'restaurant' | 'electronics' | 'clothing' | 'other';

const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  medical: 'Medical Store',
  grocery: 'Grocery Store',
  retail: 'Retail Store',
  restaurant: 'Restaurant',
  electronics: 'Electronics Store',
  clothing: 'Clothing Store',
  other: 'Store',
};

export function isMedicalShopType(shopType?: string | null): boolean {
  return shopType === 'medical';
}

export function getShopTypeLabel(shopType?: string | null): string {
  if (!shopType) {
    return 'Store';
  }

  return SHOP_TYPE_LABELS[shopType as ShopType] ?? 'Store';
}

export function useActiveShop() {
  return useAuthStore((state) => state.shops.find((shop) => shop.id === state.activeShopId) ?? null);
}

export function useActiveShopType() {
  return useAuthStore((state) => state.shops.find((shop) => shop.id === state.activeShopId)?.type ?? null);
}
