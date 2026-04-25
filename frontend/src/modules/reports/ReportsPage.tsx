import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
import { Download } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';

type Tab = 'sales' | 'gst' | 'valuation' | 'closing' | 'audit' | 'broadcasts' | 'margin' | 'customers' | 'inventoryIntel';

export function ReportsPage() {
  const shopId = useAuthStore((s) => s.activeShopId);
  const [tab, setTab] = useState<Tab>('sales');
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [gstMonth, setGstMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [closingDate, setClosingDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: salesData } = useQuery({
    queryKey: ['report-sales', shopId, from, to],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/sales?shopId=${shopId}&from=${from}&to=${to}`)
        .then((r) => r.data.data),
    enabled: !!shopId && tab === 'sales',
  });

  const { data: gstData } = useQuery({
    queryKey: ['report-gst', shopId, gstMonth],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/gst?shopId=${shopId}&month=${gstMonth}`)
        .then((r) => r.data.data),
    enabled: !!shopId && tab === 'gst',
  });

  const { data: valuationData } = useQuery({
    queryKey: ['report-valuation', shopId],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/inventory-valuation?shopId=${shopId}`)
        .then((r) => r.data.data),
    enabled: !!shopId && tab === 'valuation',
  });

  const { data: broadcastsData } = useQuery({
    queryKey: ['report-broadcasts'],
    queryFn: () => apiClient.get('/api/core/broadcasts?perPage=100').then((r) => r.data.data),
    enabled: tab === 'broadcasts',
  });

  const { data: closingData } = useQuery({
    queryKey: ['report-closing', shopId, closingDate],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/daily-closing?shopId=${shopId}&date=${closingDate}`)
        .then((r) => r.data.data),
    enabled: !!shopId && tab === 'closing',
  });

  const { data: auditData } = useQuery({
    queryKey: ['report-audit', shopId],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/audit-log?shopId=${shopId}&limit=100`)
        .then((r) => r.data.data),
    enabled: !!shopId && tab === 'audit',
  });

  const { data: marginData } = useQuery({
    queryKey: ['report-margin', shopId, from, to],
    queryFn: () => apiClient.get(`/api/reports/reports/margin?shopId=${shopId}&from=${from}&to=${to}`).then((r) => r.data.data),
    enabled: !!shopId && tab === 'margin',
  });

  const { data: customerInsights } = useQuery({
    queryKey: ['report-customers', shopId, from, to],
    queryFn: () => apiClient.get(`/api/reports/reports/customers?shopId=${shopId}&from=${from}&to=${to}`).then((r) => r.data.data),
    enabled: !!shopId && tab === 'customers',
  });

  const { data: inventoryIntel } = useQuery({
    queryKey: ['report-inventory-intel', shopId],
    queryFn: () => apiClient.get(`/api/reports/reports/inventory-intelligence?shopId=${shopId}`).then((r) => r.data.data),
    enabled: !!shopId && tab === 'inventoryIntel',
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const exportGSTCsv = () => {
    if (!gstData) return;
    const lines = [
      ['gst_rate', 'taxable_value', 'cgst', 'sgst', 'total_tax', 'invoice_count'].join(','),
      ...gstData.breakdown.map((row: any) => [
        row.gst_rate,
        row.taxable_value,
        row.cgst,
        row.sgst,
        row.tax_collected,
        row.invoice_count,
      ].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gst-report-${gstMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Reports"
        title="Insight surfaces built to feel premium."
        description="Revenue, tax, and stock valuation now sit inside a calmer analytics experience with clearer hierarchy and stronger visual rhythm."
        actions={
          <button className="btn-secondary">
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />

      <div className="flex w-fit gap-1 rounded-xl border p-1" style={{ background: 'var(--surface)', borderColor: 'var(--surface-border)' }}>
        {(['sales', 'gst', 'valuation', 'closing', 'audit', 'broadcasts', 'margin', 'customers', 'inventoryIntel'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
            style={tab === t
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-secondary)' }
            }
          >
            {t === 'gst' ? 'GST Report' : t === 'valuation' ? 'Stock Valuation' : t === 'closing' ? 'Daily Closing' : t === 'audit' ? 'Audit Log' : t === 'broadcasts' ? 'Broadcasts' : t === 'margin' ? 'Margin' : t === 'customers' ? 'Customers' : t === 'inventoryIntel' ? 'Inventory Intel' : 'Sales'}
          </button>
        ))}
      </div>

      {/* Sales tab */}
      {tab === 'sales' && (
        <div className="space-y-6">
          <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-end">
            <div className="min-w-[180px]">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </div>
            <div className="min-w-[180px]">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </div>
          </div>

          {salesData && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Revenue', value: fmt(Number(salesData.summary.total_revenue)) },
                  { label: 'Orders', value: salesData.summary.total_orders },
                  { label: 'Tax Collected', value: fmt(Number(salesData.summary.total_tax)) },
                  { label: 'Avg Order Value', value: fmt(Number(salesData.summary.avg_order_value)) },
                ].map((s) => (
                  <div key={s.label} className="stat-tile">
                    <p className="text-sm text-slate-500">{s.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="card p-6">
                <h3 className="mb-4">Daily Revenue</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={salesData.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                    <XAxis dataKey="period" tickFormatter={(v) => format(new Date(v), 'd MMM')} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'margin' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Units</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {(marginData ?? []).map((row: any) => (
                <tr key={`${row.product_name}-${row.sku}`}>
                  <td className="font-semibold">{row.product_name}</td>
                  <td>{row.sku ?? '—'}</td>
                  <td className="text-right">{Number(row.units_sold ?? 0).toFixed(0)}</td>
                  <td className="text-right">{fmt(Number(row.revenue ?? 0))}</td>
                  <td className="text-right">{fmt(Number(row.estimated_cost ?? 0))}</td>
                  <td className="text-right font-semibold">{fmt(Number(row.estimated_margin ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'customers' && customerInsights && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="stat-tile">
              <p className="text-sm text-slate-500">One-Time Customers</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{customerInsights.summary?.one_time_customers ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="text-sm text-slate-500">Repeat Customers</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{customerInsights.summary?.repeat_customers ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="text-sm text-slate-500">Avg Orders / Customer</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{Number(customerInsights.summary?.avg_orders_per_customer ?? 0).toFixed(1)}</p>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Loyalty</th>
                </tr>
              </thead>
              <tbody>
                {(customerInsights.topCustomers ?? []).map((row: any) => (
                  <tr key={row.id}>
                    <td className="font-semibold">{row.name ?? 'Customer'}</td>
                    <td>{row.phone ?? '—'}</td>
                    <td className="text-right">{row.orders}</td>
                    <td className="text-right">{fmt(Number(row.spend ?? 0))}</td>
                    <td className="text-right">{fmt(Number(row.credit_balance ?? 0))}</td>
                    <td className="text-right">{row.loyalty_points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'inventoryIntel' && inventoryIntel && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="stat-tile">
              <p className="text-sm text-slate-500">Stocked Items</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{inventoryIntel.summary?.stocked_items ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="text-sm text-slate-500">Low Stock Items</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{inventoryIntel.summary?.low_stock_items ?? 0}</p>
            </div>
            <div className="stat-tile">
              <p className="text-sm text-slate-500">Stock Cost Value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{fmt(Number(inventoryIntel.summary?.stock_cost_value ?? 0))}</p>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="text-right">Qty</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {(inventoryIntel.deadStock ?? []).map((row: any) => (
                  <tr key={`${row.name}-${row.sku}`}>
                    <td className="font-semibold">{row.name}</td>
                    <td>{row.sku ?? '—'}</td>
                    <td className="text-right">{Number(row.quantity ?? 0).toFixed(0)}</td>
                    <td>{new Date(row.last_activity_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GST tab */}
      {tab === 'gst' && (
        <div className="space-y-6">
          <div className="card w-fit p-5">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Month</label>
            <input type="month" value={gstMonth} onChange={(e) => setGstMonth(e.target.value)} className="input w-48" />
            <button className="btn-secondary mt-4" onClick={exportGSTCsv}>
              <Download className="h-4 w-4" /> Export GST CSV
            </button>
          </div>

          {gstData && (
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200/60 bg-white/50 p-4">
                <p className="text-sm font-medium">
                  Total Tax Collected: <span className="text-blue-600 font-bold">{fmt(Number(gstData.totalTaxCollected))}</span>
                </p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>GST Rate</th>
                    <th className="text-right">Taxable Value</th>
                    <th className="text-right">CGST</th>
                    <th className="text-right">SGST</th>
                    <th className="text-right">Total Tax</th>
                    <th className="text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {gstData.breakdown.map((row: any) => (
                    <tr key={row.gst_rate}>
                      <td className="font-semibold">{row.gst_rate}%</td>
                      <td className="text-right">{fmt(Number(row.taxable_value))}</td>
                      <td className="text-right">{fmt(Number(row.cgst))}</td>
                      <td className="text-right">{fmt(Number(row.sgst))}</td>
                      <td className="text-right font-semibold">{fmt(Number(row.tax_collected))}</td>
                      <td className="text-right">{row.invoice_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'closing' && (
        <div className="space-y-6">
          <div className="card w-fit p-5">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Closing Date</label>
            <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="input w-56" />
          </div>

          {closingData && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Gross Sales', value: fmt(Number(closingData.summary.gross_sales ?? 0)) },
                  { label: 'Paid Sales', value: fmt(Number(closingData.summary.paid_sales ?? 0)) },
                  { label: 'Credit Sales', value: fmt(Number(closingData.summary.credit_sales ?? 0)) },
                  { label: 'Returns', value: fmt(Number(closingData.returns.return_total ?? 0)) },
                ].map((item) => (
                  <div key={item.label} className="stat-tile">
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Payment Method</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(closingData.payments ?? []).map((row: any) => (
                      <tr key={row.method}>
                        <td className="font-semibold capitalize">{row.method}</td>
                        <td className="text-right">{row.count}</td>
                        <td className="text-right">{fmt(Number(row.amount ?? 0))}</td>
                      </tr>
                    ))}
                    {(closingData.payments ?? []).length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-sm text-slate-400">No payments for this date.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {(auditData ?? []).map((row: any, index: number) => (
                <tr key={`${row.event_time}-${index}`}>
                  <td>{format(new Date(row.event_time), 'dd MMM yyyy, hh:mm a')}</td>
                  <td className="font-semibold capitalize">{String(row.event_type).replace('_', ' ')}</td>
                  <td>{row.reference ?? '—'}</td>
                  <td>{row.status ?? '—'}</td>
                  <td className="max-w-[420px] truncate text-slate-500">{row.details ?? '—'}</td>
                </tr>
              ))}
              {!auditData?.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-400">No audit entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Valuation tab */}
      {tab === 'valuation' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Purchase Price</th>
                <th className="text-right">Cost Value</th>
                <th className="text-right">MRP Value</th>
              </tr>
            </thead>
            <tbody>
              {(valuationData ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="text-slate-500">{r.sku}</td>
                  <td className="text-right">{r.quantity} {r.unit}</td>
                  <td className="text-right">{fmt(Number(r.purchase_price))}</td>
                  <td className="text-right font-semibold">{fmt(Number(r.cost_value))}</td>
                  <td className="text-right text-emerald-600">{fmt(Number(r.mrp_value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'broadcasts' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: 'Total Broadcasts', value: Number(broadcastsData?.length ?? 0) },
              { label: 'Scheduled', value: Number((broadcastsData ?? []).filter((row: any) => row.status === 'scheduled').length) },
              { label: 'Target Customers', value: Number((broadcastsData ?? []).reduce((sum: number, row: any) => sum + Number(row.targetCustomerCount ?? 0), 0)) },
            ].map((item) => (
              <div key={item.label} className="stat-tile">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Status</th>
                  <th className="text-right">Target Customers</th>
                  <th>Scheduled For</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {(broadcastsData ?? []).map((row: any) => (
                  <tr key={row.id}>
                    <td className="max-w-[420px]">
                      <p className="font-semibold text-slate-900">{row.message}</p>
                      <p className="mt-1 text-xs text-slate-500">Delivery is not implemented yet</p>
                    </td>
                    <td className="font-semibold capitalize">{row.status}</td>
                    <td className="text-right">{row.targetCustomerCount ?? 0}</td>
                    <td>{row.scheduledFor ? format(new Date(row.scheduledFor), 'dd MMM yyyy, hh:mm a') : 'Immediate'}</td>
                    <td>{format(new Date(row.createdAt), 'dd MMM yyyy, hh:mm a')}</td>
                  </tr>
                ))}
                {!broadcastsData?.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      No broadcasts saved yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
