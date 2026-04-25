import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Search, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';
import { EmptyState } from '@/components/ui/EmptyState';

type SupplierForm = {
  name: string;
  gstNumber: string;
  phone: string;
  email: string;
  city: string;
  paymentTerms: string;
  creditLimit: string;
};

const emptyForm: SupplierForm = {
  name: '',
  gstNumber: '',
  phone: '',
  email: '',
  city: '',
  paymentTerms: '30',
  creditLimit: '',
};

export function SuppliersPage() {
  const shopId = useAuthStore((s) => s.activeShopId);
  const can = useAuthStore((s) => s.can);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [receiveTarget, setReceiveTarget] = useState<any | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    status: 'draft',
    expectedDate: '',
    notes: '',
    items: [{ productId: '', quantity: '1', unitPrice: '0', gstRate: '12', batchNo: '', manufactureDate: '', expiryDate: '' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search, page],
    queryFn: () =>
      apiClient
        .get(`/api/core/suppliers?search=${encodeURIComponent(search)}&page=${page}&perPage=20`)
        .then((r) => r.data),
  });

  const { data: supplierDetail } = useQuery({
    queryKey: ['supplier-detail', selectedSupplier?.id],
    queryFn: () => apiClient.get(`/api/core/suppliers/${selectedSupplier.id}`).then((r) => r.data.data),
    enabled: !!selectedSupplier?.id,
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders', shopId],
    queryFn: () =>
      apiClient
        .get(`/api/core/suppliers/purchase-orders/list?shopId=${shopId}`)
        .then((r) => r.data),
    enabled: !!shopId,
  });

  const { data: products } = useQuery({
    queryKey: ['supplier-purchase-products', shopId],
    queryFn: () => apiClient.get('/api/core/products?perPage=200').then((r) => r.data.data),
    enabled: !!shopId && showPurchaseForm,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        gstNumber: editing.gstNumber ?? '',
        phone: editing.phone ?? '',
        email: editing.email ?? '',
        city: editing.address?.city ?? '',
        paymentTerms: String(editing.paymentTerms ?? 30),
        creditLimit: editing.creditLimit ? String(editing.creditLimit) : '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        gstNumber: form.gstNumber.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.city.trim() ? { city: form.city.trim() } : undefined,
        paymentTerms: Number(form.paymentTerms || 30),
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      };

      if (!payload.name) throw new Error('Supplier name is required');

      if (editing?.id) {
        return apiClient.put(`/api/core/suppliers/${editing.id}`, payload);
      }
      return apiClient.post('/api/core/suppliers', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Supplier updated' : 'Supplier created');
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to save supplier');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/core/suppliers/${id}`),
    onSuccess: () => {
      toast.success('Supplier archived');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Unable to archive supplier');
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error('No active shop selected');
      if (!purchaseForm.supplierId) throw new Error('Select a supplier');

      const items = purchaseForm.items
        .map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          gstRate: Number(item.gstRate || 0),
          batchNo: item.batchNo || undefined,
          manufactureDate: item.manufactureDate || undefined,
          expiryDate: item.expiryDate || undefined,
        }))
        .filter((item) => item.productId && item.quantity > 0);

      if (items.length === 0) throw new Error('Add at least one purchase item');

      return apiClient.post('/api/core/suppliers/purchase-orders', {
        shopId,
        supplierId: purchaseForm.supplierId,
        status: purchaseForm.status,
        expectedDate: purchaseForm.expectedDate || undefined,
        notes: purchaseForm.notes || undefined,
        items,
      });
    },
    onSuccess: () => {
      toast.success(purchaseForm.status === 'received' ? 'Purchase received and inventory updated' : 'Draft purchase order saved');
      setShowPurchaseForm(false);
      setPurchaseForm({
        supplierId: '',
        status: 'draft',
        expectedDate: '',
        notes: '',
        items: [{ productId: '', quantity: '1', unitPrice: '0', gstRate: '12', batchNo: '', manufactureDate: '', expiryDate: '' }],
      });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['product-search'] });
      queryClient.invalidateQueries({ queryKey: ['pos-top-products'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to save purchase');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error('No active shop selected');
      if (!receiveTarget) throw new Error('Select a purchase order');
      const items = (receiveTarget.items ?? [])
        .map((item: any) => ({
          purchaseOrderItemId: item.id,
          quantity: Number(item.quantity ?? 0) - Number(item.receivedQty ?? 0),
        }))
        .filter((item: any) => item.quantity > 0);

      if (items.length === 0) throw new Error('This PO is already fully received');

      return apiClient.post('/api/core/suppliers/purchase-orders/receive', {
        purchaseOrderId: receiveTarget.id,
        shopId,
        items,
      });
    },
    onSuccess: () => {
      toast.success('Purchase order received');
      setReceiveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to receive purchase order');
    },
  });

  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier?.id) throw new Error('Select a supplier');
      const amount = Number(settlementAmount || 0);
      if (amount <= 0) throw new Error('Enter a valid amount');
      return apiClient.post(`/api/core/suppliers/${selectedSupplier.id}/settle-payment`, {
        amount,
      });
    },
    onSuccess: () => {
      toast.success('Supplier payment settled');
      setSettlementAmount('');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-detail', selectedSupplier?.id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['report-audit'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to settle supplier payment');
    },
  });

  const purchaseLedgerSummary = (supplierDetail?.purchases ?? []).reduce(
    (summary: { total: number; settled: number; outstanding: number }, purchase: any) => {
      const match = String(purchase.notes ?? '').match(/\[settled:([0-9.]+)\]/);
      const settled = match ? Number(match[1]) : 0;
      const total = Number(purchase.total ?? 0);
      summary.total += total;
      summary.settled += settled;
      summary.outstanding += Math.max(0, total - settled);
      return summary;
    },
    { total: 0, settled: 0, outstanding: 0 },
  );

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Suppliers"
        title="Supplier relationships now work end to end."
        description="Manage vendor records, credit terms, and contact details using the existing page shell, without changing the current visual language."
        actions={
          can('suppliers', 'write') ? (
            <div className="flex flex-wrap gap-3">
              <button className="btn-secondary" onClick={() => setShowPurchaseForm(true)}>
                <ShoppingBag className="h-4 w-4" />
                New Purchase Order
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Supplier
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="card p-5">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-11"
            placeholder="Search suppliers by name, phone, or email…"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>City</th>
              <th className="text-right">Terms</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && (data?.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon={<Truck className="h-8 w-8" />}
                    title="No suppliers yet"
                    description="Add a few suppliers so purchasing and stock replenishment can follow the same production-ready path as the rest of the app."
                  />
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((supplier: any) => (
              <tr key={supplier.id} className="cursor-pointer" onClick={() => setSelectedSupplier(supplier)}>
                <td className="font-semibold text-slate-950">{supplier.name}</td>
                <td>{supplier.phone ?? '—'}</td>
                <td>{supplier.email ?? '—'}</td>
                <td>{supplier.address?.city ?? '—'}</td>
                <td className="text-right">{supplier.paymentTerms ?? 30} days</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    {can('suppliers', 'write') && (
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditing(supplier);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {can('suppliers', 'delete') && (
                      <button
                        className="rounded-full bg-rose-50 p-2 text-rose-500"
                        onClick={() => deleteMutation.mutate(supplier.id)}
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

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200/60 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-950">Recent Purchases</h3>
          <p className="mt-1 text-sm text-slate-500">Draft purchase orders can be received later when stock actually arrives.</p>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Status</th>
              <th>Date</th>
              <th className="text-right">Total</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(purchaseOrders?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-slate-400">No purchases recorded yet.</td>
              </tr>
            )}
            {(purchaseOrders?.data ?? []).map((po: any) => (
              <tr key={po.id}>
                <td className="font-semibold text-slate-950">{po.poNumber}</td>
                <td><span className={`badge ${po.status === 'received' ? 'badge-green' : po.status === 'draft' ? 'badge-yellow' : 'badge-blue'}`}>{po.status}</span></td>
                <td>{new Date(po.createdAt).toLocaleDateString('en-IN')}</td>
                <td className="text-right font-semibold">₹{Number(po.total ?? 0).toFixed(2)}</td>
                <td className="text-right">
                  {po.status !== 'received' && (
                    <button className="btn-secondary" onClick={() => setReceiveTarget(po)}>
                      Receive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>
            {data.meta.total} suppliers · Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary disabled:opacity-50"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              className="btn-secondary disabled:opacity-50"
              disabled={page >= (data.meta.totalPages ?? 1)}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-2xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Suppliers</p>
                <h2 className="mt-2 text-2xl">{editing ? 'Edit supplier' : 'Add supplier'}</h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">GST Number</label>
                <input className="input" value={form.gstNumber} onChange={(e) => setForm((current) => ({ ...current, gstNumber: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Phone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <input className="input" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">City</label>
                <input className="input" value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Payment Terms (days)</label>
                <input className="input" value={form.paymentTerms} onChange={(e) => setForm((current) => ({ ...current, paymentTerms: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Credit Limit</label>
                <input className="input" value={form.creditLimit} onChange={(e) => setForm((current) => ({ ...current, creditLimit: e.target.value }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Update Supplier' : 'Create Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPurchaseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-5xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Purchasing</p>
                <h2 className="mt-2 text-2xl">Receive supplier purchase</h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowPurchaseForm(false)}>Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Supplier</label>
                <select
                  className="input"
                  value={purchaseForm.supplierId}
                  onChange={(e) => setPurchaseForm((current) => ({ ...current, supplierId: e.target.value }))}
                >
                  <option value="">Select supplier</option>
                  {(data?.data ?? []).map((supplier: any) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Workflow</label>
                <select
                  className="input"
                  value={purchaseForm.status}
                  onChange={(e) => setPurchaseForm((current) => ({ ...current, status: e.target.value }))}
                >
                  <option value="draft">Save Draft PO</option>
                  <option value="received">Receive Immediately</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Expected / Invoice Date</label>
                <input type="date" className="input" value={purchaseForm.expectedDate} onChange={(e) => setPurchaseForm((current) => ({ ...current, expectedDate: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Notes</label>
                <input className="input" value={purchaseForm.notes} onChange={(e) => setPurchaseForm((current) => ({ ...current, notes: e.target.value }))} />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {purchaseForm.items.map((item, index) => (
                <div key={`purchase-item-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-7">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Product</label>
                    <select
                      className="input"
                      value={item.productId}
                      onChange={(e) =>
                        setPurchaseForm((current) => ({
                          ...current,
                          items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, productId: e.target.value } : entry),
                        }))
                      }
                    >
                      <option value="">Select product</option>
                      {(products ?? []).map((product: any) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </div>
                  {[
                    ['quantity', 'Qty'],
                    ['unitPrice', 'Cost'],
                    ['gstRate', 'GST %'],
                    ['batchNo', 'Batch'],
                    ['manufactureDate', 'Mfg'],
                    ['expiryDate', 'Exp'],
                  ].map(([key, label]) => (
                    <div key={`${key}-${index}`}>
                      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
                      <input
                        type={key.toLowerCase().includes('date') ? 'date' : key === 'quantity' || key === 'unitPrice' || key === 'gstRate' ? 'number' : 'text'}
                        className="input"
                        value={(item as any)[key]}
                        onChange={(e) =>
                          setPurchaseForm((current) => ({
                            ...current,
                            items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, [key]: e.target.value } : entry),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between">
              <button
                className="btn-secondary"
                onClick={() =>
                  setPurchaseForm((current) => ({
                    ...current,
                    items: [...current.items, { productId: '', quantity: '1', unitPrice: '0', gstRate: '12', batchNo: '', manufactureDate: '', expiryDate: '' }],
                  }))
                }
              >
                Add Line
              </button>
              <button className="btn-primary" onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending}>
                {purchaseMutation.isPending ? 'Saving…' : purchaseForm.status === 'received' ? 'Receive Purchase' : 'Save Draft PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-2xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Receive Purchase Order</p>
                <h2 className="mt-2 text-2xl">{receiveTarget.poNumber}</h2>
              </div>
              <button className="btn-secondary" onClick={() => setReceiveTarget(null)}>Close</button>
            </div>
            <p className="text-sm text-slate-500">This will receive the remaining quantities on the selected PO into inventory.</p>
            <div className="mt-6 flex justify-end">
              <button className="btn-primary" onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending}>
                {receiveMutation.isPending ? 'Receiving…' : 'Confirm Receive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSupplier && supplierDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-4xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Supplier</p>
                <h2 className="mt-2 text-2xl">{supplierDetail.name}</h2>
              </div>
              <button className="btn-secondary" onClick={() => setSelectedSupplier(null)}>Close</button>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="card p-4">
                <p className="text-xs text-slate-500">Phone</p>
                <p className="mt-1 font-semibold text-slate-900">{supplierDetail.phone ?? '—'}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Payment Terms</p>
                <p className="mt-1 font-semibold text-slate-900">{supplierDetail.paymentTerms ?? 30} days</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Credit Limit</p>
                <p className="mt-1 font-semibold text-slate-900">₹{Number(supplierDetail.creditLimit ?? 0).toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Purchase Total</p>
                <p className="mt-1 font-semibold text-slate-900">₹{purchaseLedgerSummary.total.toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Settled</p>
                <p className="mt-1 font-semibold text-emerald-700">₹{purchaseLedgerSummary.settled.toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="mt-1 font-semibold text-amber-700">₹{purchaseLedgerSummary.outstanding.toFixed(2)}</p>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Settle Supplier Payment</label>
                  <input
                    type="number"
                    className="input"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    placeholder="Amount"
                  />
                </div>
                <button className="btn-secondary" onClick={() => settleMutation.mutate()} disabled={settleMutation.isPending}>
                  <Banknote className="h-4 w-4" />
                  {settleMutation.isPending ? 'Settling…' : 'Settle Payment'}
                </button>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-200/60 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">Supplier Ledger</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Date</th>
                    <th>Entry</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(supplierDetail.ledger ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400">No ledger entries yet</td>
                    </tr>
                  )}
                  {(supplierDetail.ledger ?? []).map((entry: any) => (
                    <tr key={`${entry.id}-${entry.created_at}`}>
                      <td className="font-semibold text-slate-900">{entry.po_number}</td>
                      <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td className="capitalize">{entry.entry_type}</td>
                      <td>{entry.status}</td>
                      <td className="text-right">₹{Number(entry.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
