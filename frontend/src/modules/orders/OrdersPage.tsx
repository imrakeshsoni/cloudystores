import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Search, Eye, Ban, RotateCcw } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';

export function OrdersPage() {
  const shopId = useAuthStore((s) => s.activeShopId);
  const can = useAuthStore((s) => s.can);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [partialReturnQuantities, setPartialReturnQuantities] = useState<Record<string, string>>({});
  const [quotationPaymentMethod, setQuotationPaymentMethod] = useState('cash');

  const orderQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (shopId) params.set('shopId', shopId);
    params.set('page', String(page));
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    return params.toString();
  }, [page, search, shopId, status, type]);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', shopId, page, search, status, type],
    queryFn: () =>
      apiClient.get(`/api/orders/orders?${orderQuery}`).then((r) => r.data),
    enabled: !!shopId,
  });

  const { data: selectedOrder, isFetching: isFetchingOrder } = useQuery({
    queryKey: ['order-detail', selectedOrderId],
    queryFn: () =>
      apiClient.get(`/api/orders/orders/${selectedOrderId}`).then((r) => r.data.data),
    enabled: !!selectedOrderId,
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) {
        throw new Error('Select an order to void');
      }
      if (!voidReason.trim()) {
        throw new Error('Void reason is required');
      }

      return apiClient.post(`/api/orders/orders/${selectedOrderId}/void`, {
        reason: voidReason.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Order voided and stock restored');
      setVoidReason('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', selectedOrderId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['today-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
      queryClient.invalidateQueries({ queryKey: ['report-sales'] });
      queryClient.invalidateQueries({ queryKey: ['report-gst'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to void order');
    },
  });

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) {
        throw new Error('Select an order to return');
      }
      if (!returnReason.trim()) {
        throw new Error('Return reason is required');
      }
      return apiClient.post(`/api/orders/orders/${selectedOrderId}/return`, {
        reason: returnReason.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Return recorded and stock restored');
      setReturnReason('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', selectedOrderId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['today-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
      queryClient.invalidateQueries({ queryKey: ['report-sales'] });
      queryClient.invalidateQueries({ queryKey: ['report-gst'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to process return');
    },
  });

  const partialReturnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId || !selectedOrder) {
        throw new Error('Select an order to return');
      }
      if (!returnReason.trim()) {
        throw new Error('Return reason is required');
      }

      const items = (selectedOrder.items ?? [])
        .map((item: any) => ({
          orderItemId: item.id,
          quantity: Number(partialReturnQuantities[item.id] ?? 0),
        }))
        .filter((item: { orderItemId: string; quantity: number }) => item.quantity > 0);

      if (items.length === 0) {
        throw new Error('Enter at least one return quantity');
      }

      return apiClient.post(`/api/orders/orders/${selectedOrderId}/return-items`, {
        reason: returnReason.trim(),
        items,
      });
    },
    onSuccess: () => {
      toast.success('Partial return recorded and stock restored');
      setReturnReason('');
      setPartialReturnQuantities({});
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', selectedOrderId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['today-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
      queryClient.invalidateQueries({ queryKey: ['report-sales'] });
      queryClient.invalidateQueries({ queryKey: ['report-gst'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to process partial return');
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) throw new Error('Select a quotation');
      return apiClient.post(`/api/orders/orders/${selectedOrderId}/convert`, {
        payment: {
          method: quotationPaymentMethod,
          amount: Number(selectedOrder?.total ?? 0),
        },
      });
    },
    onSuccess: () => {
      toast.success('Quotation converted');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', selectedOrderId] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
      queryClient.invalidateQueries({ queryKey: ['report-sales'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to convert quotation');
    },
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Orders"
        title="Transaction history with less noise and better focus."
        description="Order timelines, payment status, and bill totals are organized to feel more like a polished product page than an internal admin table."
      />

      <div className="card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by bill number…"
              className="input pl-11"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="input md:w-52"
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="paid">Paid</option>
          </select>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className="input md:w-52"
          >
            <option value="">All types</option>
            <option value="sale">Sales</option>
            <option value="quotation">Quotations</option>
            <option value="return">Returns</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Date</th>
              <th>Status</th>
              <th>Type</th>
              <th className="text-right">Total</th>
              <th>Payment</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && (data?.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                  No orders found for the current filters.
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((o: any) => (
              <tr key={o.id}>
                <td className="font-semibold text-blue-700">{o.billNumber}</td>
                <td className="text-slate-500">
                  {format(new Date(o.createdAt), 'dd MMM, HH:mm')}
                </td>
                <td>
                  <span className={`badge ${o.status === 'confirmed' || o.status === 'paid' ? 'badge-green' : 'badge-red'}`}>
                    {o.status}
                  </span>
                </td>
                <td className="capitalize text-slate-500">{o.type}</td>
                <td className="text-right font-semibold text-slate-950">
                  {formatCurrency(Number(o.total))}
                </td>
                <td>
                  <span className={`badge ${o.paymentStatus === 'paid' ? 'badge-green' : 'badge-yellow'}`}>
                    {o.paymentStatus}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      className="btn-secondary"
                        onClick={() => {
                          setSelectedOrderId(o.id);
                          setVoidReason('');
                          setReturnReason('');
                          setPartialReturnQuantities({});
                        }}
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </button>
                    {can('orders', 'void') && o.status !== 'cancelled' && (
                      <button
                        className="rounded-full bg-rose-50 p-2 text-rose-500 transition-colors hover:bg-rose-100"
                        onClick={() => {
                          setSelectedOrderId(o.id);
                        }}
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                    {can('orders', 'write') && o.status !== 'cancelled' && o.type !== 'return' && (
                      <button
                        className="rounded-full bg-amber-50 p-2 text-amber-600 transition-colors hover:bg-amber-100"
                        onClick={() => {
                          setSelectedOrderId(o.id);
                          setVoidReason('');
                          setPartialReturnQuantities({});
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
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
            {data.meta.total} orders · Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= (data.meta.totalPages ?? 1)}
              className="btn-secondary disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-4xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Order Detail</p>
                <h2 className="mt-2 text-2xl">
                  {selectedOrder?.billNumber ?? 'Loading order'}
                </h2>
              </div>
              <button className="btn-secondary" onClick={() => setSelectedOrderId(null)}>
                Close
              </button>
            </div>

            {isFetchingOrder && (
              <div className="py-12 text-center text-sm text-slate-400">Loading order…</div>
            )}

            {selectedOrder && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="card p-4">
                    <p className="text-sm text-slate-500">Status</p>
                    <p className="mt-2 font-semibold text-slate-950">{selectedOrder.status}</p>
                  </div>
                  <div className="card p-4">
                    <p className="text-sm text-slate-500">Payment</p>
                    <p className="mt-2 font-semibold text-slate-950">{selectedOrder.paymentStatus}</p>
                  </div>
                  <div className="card p-4">
                    <p className="text-sm text-slate-500">Date</p>
                    <p className="mt-2 font-semibold text-slate-950">
                      {format(new Date(selectedOrder.createdAt), 'dd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                  <div className="card p-4">
                    <p className="text-sm text-slate-500">Total</p>
                    <p className="mt-2 font-semibold text-blue-700">
                      {formatCurrency(Number(selectedOrder.total))}
                    </p>
                  </div>
                </div>

                {selectedOrder.type === 'quotation' && (
                  <div className="card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Payment method for conversion</label>
                        <select
                          value={quotationPaymentMethod}
                          onChange={(e) => setQuotationPaymentMethod(e.target.value)}
                          className="input md:w-48"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="credit">Credit</option>
                        </select>
                      </div>
                      <button className="btn-primary" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
                        {convertMutation.isPending ? 'Converting…' : 'Convert To Order'}
                      </button>
                    </div>
                  </div>
                )}

                {can('orders', 'write') && selectedOrder.status !== 'cancelled' && selectedOrder.type !== 'return' && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="card p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1">
                          <label className="mb-2 block text-sm font-medium text-slate-700">Return Entire Order</label>
                          <input
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="Reason for return"
                            className="input"
                          />
                        </div>
                        <button
                          className="btn-secondary"
                          onClick={() => returnMutation.mutate()}
                          disabled={returnMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {returnMutation.isPending ? 'Processing Return…' : 'Return Order'}
                        </button>
                      </div>
                    </div>
                    <div className="card p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1">
                          <label className="mb-2 block text-sm font-medium text-slate-700">Partial Return</label>
                          <input
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="Reason for partial return"
                            className="input"
                          />
                        </div>
                        <button
                          className="btn-primary"
                          onClick={() => partialReturnMutation.mutate()}
                          disabled={partialReturnMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {partialReturnMutation.isPending ? 'Processing Partial Return…' : 'Return Selected Items'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>SKU</th>
                        <th>Batch</th>
                        <th>MFG / EXP</th>
                        <th className="text-right">Qty</th>
                        {selectedOrder.status !== 'cancelled' && selectedOrder.type !== 'return' && (
                          <th className="text-right">Return Qty</th>
                        )}
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">GST</th>
                        <th className="text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOrder.items ?? []).map((item: any) => (
                        <tr key={item.id}>
                          <td className="font-semibold text-slate-950">{item.product?.name ?? 'Product'}</td>
                          <td className="text-slate-500">{item.product?.sku ?? '—'}</td>
                          <td className="text-slate-500">{item.batchNo ?? '—'}</td>
                          <td className="text-slate-500">
                            {[item.manufactureDate, item.expiryDate].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="text-right">{item.quantity}</td>
                          {selectedOrder.status !== 'cancelled' && selectedOrder.type !== 'return' && (
                            <td className="text-right">
                              <input
                                type="number"
                                min="0"
                                max={item.quantity}
                                step="0.001"
                                value={partialReturnQuantities[item.id] ?? ''}
                                onChange={(event) =>
                                  setPartialReturnQuantities((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                className="input ml-auto h-9 w-24 text-right"
                              />
                            </td>
                          )}
                          <td className="text-right">{formatCurrency(Number(item.unitPrice))}</td>
                          <td className="text-right">{Number(item.gstRate)}%</td>
                          <td className="text-right font-semibold text-slate-950">
                            {formatCurrency(Number(item.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(selectedOrder.payments ?? []).length > 0 && (
                  <div className="card p-5">
                    <p className="section-label">Payments</p>
                    <div className="mt-4 space-y-3">
                      {selectedOrder.payments.map((payment: any) => (
                        <div key={payment.id} className="flex items-center justify-between text-sm">
                          <span className="capitalize text-slate-500">{payment.method}</span>
                          <span className="font-semibold text-slate-950">
                            {formatCurrency(Number(payment.amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {can('orders', 'void') && selectedOrder.status !== 'cancelled' && (
                  <div className="card p-5">
                    <p className="section-label">Void Order</p>
                    <div className="mt-4 flex flex-col gap-3 md:flex-row">
                      <input
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        className="input"
                        placeholder="Reason for voiding this order"
                      />
                      <button
                        className="btn-primary md:w-48"
                        onClick={() => voidMutation.mutate()}
                        disabled={voidMutation.isPending}
                      >
                        {voidMutation.isPending ? 'Voiding…' : 'Void Order'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
