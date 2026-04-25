import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, ShoppingCart, AlertTriangle, IndianRupee, ArrowUpRight, Activity, CalendarClock, Send } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';

const BROADCAST_TEMPLATE_BUILDERS = {
  shopClosed: (shopName: string) =>
    `Dear customer,\n\nOur shop will remain closed today due to operational reasons. We will reopen during regular hours tomorrow. Thank you for your support.\n\nRegards,\n${shopName}`,
  festivalWishes: (shopName: string) =>
    `Dear customer,\n\nWarm wishes from our store to you and your family on this festival. Thank you for being a valued customer. We wish you joy, health, and prosperity.\n\nRegards,\n${shopName}`,
  offerAnnouncement: (shopName: string) =>
    `Dear customer,\n\nWe have fresh offers and selected product savings available for a limited time. Visit us today to explore the latest deals.\n\nRegards,\n${shopName}`,
  custom: (shopName: string) => `Dear customer,\n\n\nRegards,\n${shopName}`,
} as const;

type BroadcastTemplateKey = keyof typeof BROADCAST_TEMPLATE_BUILDERS;

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  meta,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  meta: string;
}) {
  return (
    <div className="stat-tile">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</p>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>{meta}</p>
        </div>
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
          style={{ background: iconBg }}
        >
          <Icon className="h-4.5 w-4.5 text-white" style={{ width: '1.125rem', height: '1.125rem' }} />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const shopId = useAuthStore((s) => s.activeShopId);
  const activeShopName = useAuthStore((s) => s.shops.find((shop) => shop.id === s.activeShopId)?.name ?? 'Your Store');
  const queryClient = useQueryClient();
  const [broadcastTemplate, setBroadcastTemplate] = useState<BroadcastTemplateKey>('custom');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');

  const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const to = format(new Date(), 'yyyy-MM-dd');

  const { data: salesData } = useQuery({
    queryKey: ['sales-summary', shopId, from, to],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/sales?shopId=${shopId}&from=${from}&to=${to}`)
        .then((r) => r.data.data),
    enabled: !!shopId,
  });

  const { data: todayData } = useQuery({
    queryKey: ['today-summary', shopId],
    queryFn: () =>
      apiClient
        .get(`/api/reports/reports/sales/today?shopId=${shopId}`)
        .then((r) => r.data.data),
    enabled: !!shopId,
    refetchInterval: 60000, // refresh every minute
  });

  const { data: alertsData } = useQuery({
    queryKey: ['low-stock', shopId],
    queryFn: () =>
      apiClient
        .get(`/api/core/inventory/alerts?shopId=${shopId}`)
        .then((r) => r.data.data),
    enabled: !!shopId,
  });

  const { data: recentBroadcasts } = useQuery({
    queryKey: ['dashboard-broadcasts'],
    queryFn: () => apiClient.get('/api/core/broadcasts?perPage=5').then((r) => r.data.data),
  });

  const broadcastMutation = useMutation({
    mutationFn: async (mode: 'send' | 'schedule') => {
      const message = broadcastMessage.trim();
      if (!message) {
        throw new Error('Write a broadcast note first');
      }

      if (mode === 'schedule' && !scheduledFor) {
        throw new Error('Choose schedule date and time');
      }

      return apiClient.post('/api/core/broadcasts', {
        message,
        scheduledFor: mode === 'schedule' ? new Date(scheduledFor).toISOString() : undefined,
      });
    },
    onSuccess: (_res, mode) => {
      toast.success(mode === 'schedule' ? 'Broadcast scheduled' : 'Broadcast sent to WhatsApp');
      setBroadcastTemplate('custom');
      setBroadcastMessage('');
      setScheduledFor('');
      queryClient.invalidateQueries({ queryKey: ['dashboard-broadcasts'] });
      queryClient.invalidateQueries({ queryKey: ['report-broadcasts'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to save broadcast');
    },
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Overview"
        title="A retail dashboard with more calm, less clutter."
        description={`Today is ${format(new Date(), 'dd MMMM yyyy')}. Monitor revenue, orders, stock risk, and product momentum from a single premium command center.`}
        actions={
          <>
            <span className="chip">Live sync</span>
            <span className="chip">30-day intelligence</span>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's Revenue"
          value={formatCurrency(Number(todayData?.total_revenue ?? 0))}
          icon={IndianRupee}
          iconBg="#0071E3"
          meta="Real-time snapshot"
        />
        <StatCard
          label="Today's Orders"
          value={String(todayData?.total_orders ?? 0)}
          icon={ShoppingCart}
          iconBg="#34C759"
          meta="Counter activity"
        />
        <StatCard
          label="Monthly Revenue"
          value={formatCurrency(Number(salesData?.summary?.total_revenue ?? 0))}
          icon={TrendingUp}
          iconBg="#1D1D1F"
          meta="Last 30 days"
        />
        <StatCard
          label="Low Stock Items"
          value={String(alertsData?.length ?? 0)}
          icon={AlertTriangle}
          iconBg="#FF9500"
          meta="Needs attention"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="card p-6 md:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="section-label">Revenue curve</p>
              <h2 className="mt-2">Sales performance over the last 30 days</h2>
            </div>
            <div className="chip">
              <Activity className="mr-2 h-3.5 w-3.5" />
              Updated every minute
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={salesData?.timeline ?? []}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0071E3" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#0071E3" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="period"
              tickFormatter={(v) => format(new Date(v), 'd MMM')}
              tick={{ fontSize: 12, fill: '#64748b' }}
            />
            <YAxis
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12, fill: '#64748b' }}
            />
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(l) => format(new Date(l), 'dd MMM yyyy')}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0071E3"
              strokeWidth={2}
              fill="url(#revGrad)"
            />
          </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <p className="section-label">Highlights</p>
          <h2 className="mt-2">What deserves attention now</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl p-5 text-white" style={{ background: 'var(--text-primary)' }}>
              <p className="text-sm text-white/60">Average order value</p>
              <p className="mt-2 text-3xl font-semibold">
                {formatCurrency(Number(salesData?.summary?.avg_order_value ?? 0))}
              </p>
              <p className="mt-3 text-sm text-white/70">
                A useful signal for upsell opportunities and checkout efficiency.
              </p>
            </div>
            <div className="card-strong p-5">
              <p className="text-sm text-slate-500">Tax collected</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatCurrency(Number(salesData?.summary?.total_tax ?? 0))}
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Review GST and invoice patterns alongside daily sales momentum.
              </p>
            </div>
            <div className="card-strong p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Store readiness</p>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Inventory, reports, and checkout are unified into one faster operating rhythm.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="card p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label">Broadcast</p>
              <h2 className="mt-2">Write a note for all customers</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Send a WhatsApp broadcast to every customer with a mobile number, or schedule it for a later campaign window.
              </p>
            </div>
            <span className="chip">WhatsApp delivery</span>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Message Type</label>
              <select
                className="input"
                value={broadcastTemplate}
                onChange={(e) => {
                  const nextTemplate = e.target.value as BroadcastTemplateKey;
                  setBroadcastTemplate(nextTemplate);
                  setBroadcastMessage(BROADCAST_TEMPLATE_BUILDERS[nextTemplate](activeShopName));
                }}
              >
                <option value="shopClosed">1. Shop Closed</option>
                <option value="festivalWishes">2. Festival Wishes</option>
                <option value="offerAnnouncement">3. Offer Announcement</option>
                <option value="custom">4. Custom Message</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Broadcast Note</label>
              <textarea
                className="input min-h-[148px] resize-y py-3"
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Type any message you want to broadcast..."
              />
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,260px),1fr] md:items-end">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Schedule For</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-secondary"
                  onClick={() => broadcastMutation.mutate('schedule')}
                  disabled={broadcastMutation.isPending}
                >
                  <CalendarClock className="h-4 w-4" />
                  Schedule Broadcast
                </button>
                <button
                  className="btn-primary"
                  onClick={() => broadcastMutation.mutate('send')}
                  disabled={broadcastMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                  Send Broadcast
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <p className="section-label">Recent Broadcasts</p>
          <h2 className="mt-2">Latest saved notes</h2>
          <div className="mt-6 space-y-3">
            {(recentBroadcasts ?? []).map((broadcast: any) => (
              <div key={broadcast.id} className="card-strong p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`badge ${broadcast.status === 'scheduled' ? 'badge-blue' : 'badge-green'}`}>
                    {broadcast.status === 'scheduled' ? 'Scheduled' : 'Saved'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {format(new Date(broadcast.createdAt), 'dd MMM yyyy, hh:mm a')}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{broadcast.message}</p>
                <p className="mt-3 text-xs text-slate-500">
                  Targets {broadcast.targetCustomerCount ?? 0} customers with mobile numbers
                  {broadcast.scheduledFor ? ` · Scheduled for ${format(new Date(broadcast.scheduledFor), 'dd MMM yyyy, hh:mm a')}` : ' · Immediate entry'}
                </p>
              </div>
            ))}
            {!recentBroadcasts?.length && (
              <p className="text-sm text-slate-500">No broadcasts saved yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-label">Best sellers</p>
              <h2 className="mt-2">Top products this month</h2>
            </div>
            <span className="chip">Revenue ranked</span>
          </div>
          <div className="space-y-3">
            {(salesData?.topProducts ?? []).slice(0, 5).map((p: any, index: number) => (
              <div key={p.product_id} className="card-strong flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--text-primary)' }}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{p.product_name}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{p.sku}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-950">{formatCurrency(Number(p.total_revenue))}</p>
                  <p className="text-xs text-slate-500">{p.total_qty} {p.unit}</p>
                </div>
              </div>
            ))}
            {!salesData?.topProducts?.length && (
              <p className="text-sm text-slate-500">No sales data yet</p>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="mb-4">
            Low Stock Alerts
            {alertsData?.length > 0 && (
              <span className="ml-2 badge badge-red">{alertsData.length}</span>
            )}
          </h2>
          <div className="space-y-3">
            {(alertsData ?? []).slice(0, 5).map((a: any) => (
              <div key={a.product_id} className="card-strong flex items-center justify-between gap-4 p-4 text-sm">
                <div>
                  <p className="font-medium text-slate-950">{a.product_name}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{a.sku}</p>
                </div>
                <div className="text-right">
                  <span className="badge badge-red">{a.quantity} {a.unit}</span>
                  <p className="mt-1 text-xs text-slate-400">min: {a.reorder_level}</p>
                </div>
              </div>
            ))}
            {!alertsData?.length && (
              <p className="text-sm text-emerald-600">All items are well stocked</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
