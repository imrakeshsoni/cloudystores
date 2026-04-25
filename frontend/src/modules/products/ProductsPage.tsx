import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, Package } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';
import { EmptyState } from '@/components/ui/EmptyState';
import { isMedicalShopType, useActiveShopType } from '@/lib/shop/shopType';

type ProductForm = {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  mrp: string;
  sellingPrice: string;
  purchasePrice: string;
  gstRate: string;
  totalUnits: string;
  looseSellingPrice: string;
  lowStockQuantity: string;
  nrx: boolean;
};

const emptyForm: ProductForm = {
  name: '',
  sku: '',
  barcode: '',
  unit: 'piece',
  mrp: '',
  sellingPrice: '',
  purchasePrice: '',
  gstRate: '12',
  totalUnits: '',
  looseSellingPrice: '',
  lowStockQuantity: '',
  nrx: false,
};

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const can = useAuthStore((s) => s.can);
  const shopId = useAuthStore((s) => s.activeShopId);
  const activeShopType = useActiveShopType();
  const isMedicalStore = isMedicalShopType(activeShopType);
  const unitOptions = isMedicalStore
    ? ['ml', 'piece', 'strip', 'dozen', 'unit']
    : ['kg', 'gram', 'litre', 'ml', 'piece', 'strip', 'box', 'pack', 'dozen', 'unit'];
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page, shopId],
    queryFn: () =>
      apiClient
        .get(`/api/core/products?search=${encodeURIComponent(search)}&page=${page}&perPage=20`)
        .then((r) => r.data),
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        sku: editing.sku ?? '',
        barcode: editing.barcode ?? '',
        unit: editing.unit ?? 'piece',
        mrp: editing.mrp ? String(editing.mrp) : '',
        sellingPrice: editing.sellingPrice ? String(editing.sellingPrice) : '',
        purchasePrice: editing.purchasePrice ? String(editing.purchasePrice) : '',
        gstRate: editing.gstRate ? String(editing.gstRate) : '12',
        totalUnits: editing.attributes?.totalUnits ? String(editing.attributes.totalUnits) : '',
        looseSellingPrice: editing.attributes?.looseSellingPrice ? String(editing.attributes.looseSellingPrice) : '',
        lowStockQuantity: editing.attributes?.lowStockQuantity ? String(editing.attributes.lowStockQuantity) : '',
        nrx: editing.attributes?.nrx === true,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing]);

  useEffect(() => {
    if (!isMedicalStore || form.unit !== 'strip') {
      return;
    }

    const stripPrice = Number(form.sellingPrice || 0);
    const totalUnits = Number(form.totalUnits || 0);

    if (stripPrice > 0 && totalUnits > 0) {
      setForm((current) => ({
        ...current,
        looseSellingPrice: (stripPrice / totalUnits).toFixed(2),
      }));
    }
  }, [form.sellingPrice, form.totalUnits, form.unit, isMedicalStore]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error('Select a shop before creating products');
      const payload = {
        name: form.name.trim(),
        sku: isMedicalStore ? undefined : form.sku.trim() || undefined,
        barcode: isMedicalStore ? undefined : form.barcode.trim() || undefined,
        unit: form.unit,
        mrp: isMedicalStore ? undefined : form.mrp ? Number(form.mrp) : undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
        purchasePrice: isMedicalStore ? undefined : form.purchasePrice ? Number(form.purchasePrice) : undefined,
        gstRate: Number(form.gstRate || 0),
        shopId,
        attributes: {
          ...(form.lowStockQuantity ? { lowStockQuantity: Number(form.lowStockQuantity) } : {}),
          ...(isMedicalStore && form.unit === 'strip' && form.totalUnits
            ? { totalUnits: Number(form.totalUnits) }
            : {}),
          ...(isMedicalStore && form.unit === 'strip' && form.looseSellingPrice
            ? { looseSellingPrice: Number(form.looseSellingPrice) }
            : {}),
          ...(isMedicalStore ? { nrx: form.nrx } : {}),
        },
      };

      if (!payload.name) throw new Error('Product name is required');

      if (editing?.id) {
        return apiClient.put(`/api/core/products/${editing.id}`, payload);
      }
      return apiClient.post('/api/core/products', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Product updated' : 'Product created');
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-search'] });
      queryClient.invalidateQueries({ queryKey: ['pos-top-products'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to save product');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/core/products/${id}`),
    onSuccess: () => {
      toast.success('Product deactivated');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-search'] });
      queryClient.invalidateQueries({ queryKey: ['pos-top-products'] });
    },
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Catalog"
        title="Products with editorial clarity."
        description="Browse, search, create, and maintain your merchandising catalog without changing the current product surface."
        actions={
          can('products', 'write') ? (
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          ) : undefined
        }
      />

      <div className="card p-5">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, SKU or barcode…"
            className="input pl-11"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Unit</th>
              <th className="text-right">MRP</th>
              <th className="text-right">Selling Price</th>
              <th className="text-right">GST</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j}>
                      <div className="h-4 rounded bg-slate-200 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon={<Package className="h-8 w-8" />}
                    title="No products yet"
                    description="Start your catalog with a few hero products, then expand it into a richer searchable library."
                  />
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((p: any) => (
              <tr key={p.id}>
                <td className="font-semibold text-slate-950">{p.name}</td>
                <td className="text-slate-500">{p.sku ?? '—'}</td>
                <td className="text-slate-500">{p.unit ?? '—'}</td>
                <td className="text-right">{formatCurrency(Number(p.mrp ?? 0))}</td>
                <td className="text-right font-semibold text-blue-700">
                  {formatCurrency(Number(p.sellingPrice ?? 0))}
                </td>
                <td className="text-right">{p.gstRate}%</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {can('products', 'write') && (
                      <button
                        className="rounded-full bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100"
                        onClick={() => {
                          setEditing(p);
                          setShowForm(true);
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                    {can('products', 'delete') && (
                      <button
                        onClick={() => deleteMutation.mutate(p.id)}
                        className="rounded-full bg-rose-50 p-2 text-rose-500 transition-colors hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>
            {data.meta.total} products · Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= (data.meta.totalPages ?? 1)}
              className="btn-secondary disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-3xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Products</p>
                <h2 className="mt-2 text-2xl">{editing ? 'Edit product' : 'Add product'}</h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
              </div>
              {!isMedicalStore && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">SKU</label>
                  <input className="input" value={form.sku} onChange={(e) => setForm((current) => ({ ...current, sku: e.target.value }))} />
                </div>
              )}
              {!isMedicalStore && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Barcode</label>
                  <input className="input" value={form.barcode} onChange={(e) => setForm((current) => ({ ...current, barcode: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Unit</label>
                <select className="input" value={form.unit} onChange={(e) => setForm((current) => ({ ...current, unit: e.target.value }))}>
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              {isMedicalStore && form.unit === 'strip' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Total Units</label>
                  <input
                    className="input"
                    value={form.totalUnits}
                    onChange={(e) => setForm((current) => ({ ...current, totalUnits: e.target.value }))}
                  />
                </div>
              )}
              {isMedicalStore && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    {form.unit === 'strip' ? 'Strip Selling Price' : 'Selling Price'}
                  </label>
                  <input
                    className="input"
                    value={form.sellingPrice}
                    onChange={(e) => setForm((current) => ({ ...current, sellingPrice: e.target.value }))}
                  />
                </div>
              )}
              {isMedicalStore && form.unit === 'strip' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Loose Selling Price</label>
                  <input
                    className="input"
                    value={form.looseSellingPrice}
                    onChange={(e) => setForm((current) => ({ ...current, looseSellingPrice: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">GST Rate</label>
                <select className="input" value={form.gstRate} onChange={(e) => setForm((current) => ({ ...current, gstRate: e.target.value }))}>
                  {[0, 5, 12, 18, 28].map((rate) => (
                    <option key={rate} value={rate}>{rate}%</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Low Stock Quantity</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={form.lowStockQuantity}
                  onChange={(e) => setForm((current) => ({ ...current, lowStockQuantity: e.target.value }))}
                />
              </div>
              {!isMedicalStore && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">MRP</label>
                  <input className="input" value={form.mrp} onChange={(e) => setForm((current) => ({ ...current, mrp: e.target.value }))} />
                </div>
              )}
              {!isMedicalStore && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Selling Price</label>
                  <input className="input" value={form.sellingPrice} onChange={(e) => setForm((current) => ({ ...current, sellingPrice: e.target.value }))} />
                </div>
              )}
              {!isMedicalStore && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Purchase Price</label>
                  <input className="input" value={form.purchasePrice} onChange={(e) => setForm((current) => ({ ...current, purchasePrice: e.target.value }))} />
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <div>
                {isMedicalStore && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">NRX</span>
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, nrx: !current.nrx }))}
                      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                        form.nrx ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      aria-pressed={form.nrx}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          form.nrx ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Update Product' : 'Create Product'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
