import { create } from 'zustand';

export interface CartItem {
  itemKey: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  gstRate: number;
  discount: number;
  discountPercent?: number;
  batchNo?: string;
  manufactureDate?: string;
  expiryDate?: string;
  availableBatches?: Array<{
    batchNo: string;
    manufactureDate?: string;
    expiry?: string;
    quantity: number;
    purchasePrice?: number;
  }>;
  totalUnits?: number;
  looseUnitPrice?: number;
  isLoose?: boolean;
  looseQty?: number;
  stripQuantityBackup?: number;
}

interface CartState {
  items: CartItem[];
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  globalDiscount: number;

  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQty: (itemKey: string, quantity: number) => void;
  updateLooseQty: (itemKey: string, looseQty: number) => void;
  toggleLoose: (itemKey: string, enabled: boolean) => void;
  removeItem: (itemKey: string) => void;
  setDiscount: (itemKey: string, discount: number) => void;
  setDiscountPercent: (itemKey: string, discountPercent: number) => void;
  setCustomer: (id: string, name: string, phone?: string | null) => void;
  setGlobalDiscount: (discount: number) => void;
  clearCart: () => void;

  // Computed
  subtotal: () => number;
  taxAmount: () => number;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  customerPhone: null,
  globalDiscount: 0,

  addItem: (newItem) => {
    set((state) => {
      const existing = state.items.find((i) => i.itemKey === newItem.itemKey);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.itemKey === newItem.itemKey
              ? { ...i, quantity: i.quantity + (newItem.quantity ?? 1) }
              : i,
          ),
        };
      }
      return {
        items: [...state.items, {
          ...newItem,
          quantity: newItem.quantity ?? 1,
          discountPercent: 0,
          isLoose: false,
          looseQty: 0,
        }] ,
      };
    });
  },

  updateQty: (itemKey, quantity) => {
    set((state) => ({
      items: state.items
        .map((item) => {
          if (item.itemKey !== itemKey) return item;

          const nextQuantity = Math.max(0, quantity);
          const shouldKeep = nextQuantity > 0 || (item.isLoose && (item.looseQty ?? 0) > 0);
          if (!shouldKeep) return null;

          const updatedItem = { ...item, quantity: nextQuantity };
          return syncDiscountFromPercent(updatedItem);
        })
        .filter(Boolean) as CartItem[],
    }));
  },

  updateLooseQty: (itemKey, looseQty) => {
    set((state) => ({
      items: state.items
        .map((item) => {
          if (item.itemKey !== itemKey) return item;

          const nextLooseQty = Math.max(0, looseQty);
          const shouldKeep = item.quantity > 0 || nextLooseQty > 0;
          if (!shouldKeep) return null;

          return syncDiscountFromPercent({
            ...item,
            isLoose: nextLooseQty > 0,
            looseQty: nextLooseQty,
          });
        })
        .filter(Boolean) as CartItem[],
    }));
  },

  toggleLoose: (itemKey, enabled) => {
    set((state) => ({
      items: state.items.map((item) => {
        if (item.itemKey !== itemKey) {
          return item;
        }

        if (enabled) {
          return syncDiscountFromPercent({
            ...item,
            isLoose: true,
            quantity: item.quantity,
            looseQty: item.looseQty && item.looseQty > 0 ? item.looseQty : 1,
          });
        }

        return syncDiscountFromPercent({
          ...item,
          isLoose: false,
          looseQty: 0,
        });
      }),
    }));
  },

  removeItem: (itemKey) => {
    set((state) => ({ items: state.items.filter((i) => i.itemKey !== itemKey) }));
  },

  setDiscount: (itemKey, discount) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.itemKey === itemKey ? { ...i, discount, discountPercent: calculateDiscountPercent(i, discount) } : i,
      ),
    }));
  },

  setDiscountPercent: (itemKey, discountPercent) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.itemKey === itemKey
          ? syncDiscountFromPercent({
              ...item,
              discountPercent: Math.max(0, Math.min(100, discountPercent)),
            })
          : item,
      ),
    }));
  },

  setCustomer: (id, name, phone) => set({ customerId: id, customerName: name, customerPhone: phone ?? null }),
  setGlobalDiscount: (discount) => set({ globalDiscount: discount }),
  clearCart: () => set({ items: [], customerId: null, customerName: null, customerPhone: null, globalDiscount: 0 }),

  subtotal: () => {
    return get().items.reduce((sum, i) => {
      const stripTotal = i.unitPrice * i.quantity;
      const looseTotal = i.isLoose ? (i.looseUnitPrice ?? 0) * (i.looseQty ?? 0) : 0;
      return sum + stripTotal + looseTotal - i.discount;
    }, 0);
  },

  taxAmount: () => {
    return get().items.reduce((sum, i) => {
      const lineNet = i.unitPrice * i.quantity + (i.isLoose ? (i.looseUnitPrice ?? 0) * (i.looseQty ?? 0) : 0) - i.discount;
      return sum + (lineNet * i.gstRate) / 100;
    }, 0);
  },

  total: () => {
    const { subtotal, taxAmount, globalDiscount } = get();
    return Math.max(0, subtotal() + taxAmount() - globalDiscount);
  },

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity + (i.isLoose ? (i.looseQty ?? 0) : 0), 0),
}));

function getLineGross(item: CartItem): number {
  const stripTotal = item.unitPrice * item.quantity;
  const looseTotal = item.isLoose ? (item.looseUnitPrice ?? 0) * (item.looseQty ?? 0) : 0;
  return stripTotal + looseTotal;
}

function syncDiscountFromPercent(item: CartItem): CartItem {
  const gross = getLineGross(item);
  const percent = Math.max(0, Math.min(100, item.discountPercent ?? 0));
  const discount = Math.min(gross, Number(((gross * percent) / 100).toFixed(2)));
  return {
    ...item,
    discountPercent: percent,
    discount,
  };
}

function calculateDiscountPercent(item: CartItem, discount: number): number {
  const gross = getLineGross(item);
  if (gross <= 0) return 0;
  return Math.max(0, Math.min(100, Number(((discount / gross) * 100).toFixed(2))));
}
