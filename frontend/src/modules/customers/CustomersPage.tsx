import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';
import { EmptyState } from '@/components/ui/EmptyState';

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  tags: string;
};

const emptyForm: CustomerForm = { name: '', phone: '', email: '', tags: '' };

export function CustomersPage() {
  const can = useAuthStore((s) => s.can);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () =>
      apiClient
        .get(`/api/core/customers?search=${encodeURIComponent(search)}&page=${page}&perPage=20`)
        .then((r) => r.data),
  });

  const { data: customerDetail } = useQuery({
    queryKey: ['customer-detail', selectedCustomer?.id],
    queryFn: () => apiClient.get(`/api/core/customers/${selectedCustomer.id}`).then((r) => r.data.data),
    enabled: !!selectedCustomer?.id,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        phone: editing.phone ?? '',
        email: editing.email ?? '',
        tags: Array.isArray(editing.tags) ? editing.tags.join(', ') : '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      };

      if (!payload.name) throw new Error('Customer name is required');

      if (editing?.id) {
        return apiClient.put(`/api/core/customers/${editing.id}`, payload);
      }
      return apiClient.post('/api/core/customers', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Customer updated' : 'Customer created');
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to save customer');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/core/customers/${id}`),
    onSuccess: () => {
      toast.success('Customer deleted');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Unable to delete customer');
    },
  });

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer?.id) throw new Error('Select a customer');
      const amount = Number(paymentAmount || 0);
      if (amount <= 0) throw new Error('Enter a valid amount');
      return apiClient.post(`/api/core/customers/${selectedCustomer.id}/collect-payment`, {
        amount,
        method: 'cash',
      });
    },
    onSuccess: () => {
      toast.success('Credit payment collected');
      setPaymentAmount('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-detail', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['report-closing'] });
      queryClient.invalidateQueries({ queryKey: ['report-audit'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to collect payment');
    },
  });

  const reminderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer?.id) throw new Error('Select a customer');
      return apiClient.post(`/api/core/customers/${selectedCustomer.id}/send-reminder`, {
        channel: 'manual',
        notes: reminderNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Reminder logged');
      setReminderNotes('');
      queryClient.invalidateQueries({ queryKey: ['customer-detail', selectedCustomer?.id] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to log reminder');
    },
  });

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Customers"
        title="Customer records that are finally usable."
        description="View, create, edit, and maintain customer profiles with loyalty balances and tags using the existing management surface."
        actions={
          can('customers', 'write') ? (
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </button>
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
            placeholder="Search customers by name, phone, or email…"
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
              <th className="text-right">Loyalty</th>
              <th className="text-right">Credit</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && (data?.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title="No customers yet"
                    description="Create a few customer records so loyalty tracking, POS history, and future CRM flows have real data to work with."
                  />
                </td>
              </tr>
            )}
            {(data?.data ?? []).map((customer: any) => (
              <tr key={customer.id} className="cursor-pointer" onClick={() => setSelectedCustomer(customer)}>
                <td className="font-semibold text-slate-950">{customer.name}</td>
                <td>{customer.phone ?? '—'}</td>
                <td>{customer.email ?? '—'}</td>
                <td className="text-right">{customer.loyaltyPoints ?? 0}</td>
                <td className="text-right">₹{Number(customer.creditBalance ?? 0).toFixed(2)}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    {can('customers', 'write') && (
                      <button
                        className="btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(null);
                          setEditing(customer);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {can('customers', 'delete') && (
                      <button
                        className="rounded-full bg-rose-50 p-2 text-rose-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(customer.id);
                        }}
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
            {data.meta.total} customers · Page {data.meta.page} of {data.meta.totalPages}
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

      {selectedCustomer && customerDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-3xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Customer</p>
                <h2 className="mt-2 text-2xl">{customerDetail.name}</h2>
              </div>
              <button className="btn-secondary" onClick={() => setSelectedCustomer(null)}>Close</button>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="card p-4">
                <p className="text-xs text-slate-500">Phone</p>
                <p className="mt-1 font-semibold text-slate-900">{customerDetail.phone ?? '—'}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Credit Balance</p>
                <p className="mt-1 font-semibold text-slate-900">₹{Number(customerDetail.creditBalance ?? 0).toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">Loyalty Points</p>
                <p className="mt-1 font-semibold text-slate-900">{customerDetail.loyaltyPoints ?? 0}</p>
              </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-4">
              <div className="card p-4">
                <p className="text-xs text-slate-500">Current</p>
                <p className="mt-1 font-semibold text-slate-900">₹{Number(customerDetail.aging?.current ?? 0).toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">31-60 Days</p>
                <p className="mt-1 font-semibold text-slate-900">₹{Number(customerDetail.aging?.bucket_31_60 ?? 0).toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">61-90 Days</p>
                <p className="mt-1 font-semibold text-slate-900">₹{Number(customerDetail.aging?.bucket_61_90 ?? 0).toFixed(2)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-slate-500">90+ Days</p>
                <p className="mt-1 font-semibold text-rose-600">₹{Number(customerDetail.aging?.bucket_90_plus ?? 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Collect Credit Payment</label>
                  <input
                    type="number"
                    className="input"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Amount"
                  />
                </div>
                <button className="btn-secondary" onClick={() => collectMutation.mutate()} disabled={collectMutation.isPending}>
                  <Banknote className="h-4 w-4" />
                  {collectMutation.isPending ? 'Collecting…' : 'Collect'}
                </button>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Reminder Note</label>
                  <input
                    className="input"
                    value={reminderNotes}
                    onChange={(e) => setReminderNotes(e.target.value)}
                    placeholder="Called customer / follow-up promised / WhatsApp reminder"
                  />
                </div>
                <button className="btn-secondary" onClick={() => reminderMutation.mutate()} disabled={reminderMutation.isPending}>
                  {reminderMutation.isPending ? 'Saving…' : 'Log Reminder'}
                </button>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-200/60 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">Linked Orders</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(customerDetail.orders ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-400">No orders linked yet</td>
                    </tr>
                  )}
                  {(customerDetail.orders ?? []).map((order: any) => (
                    <tr key={order.id}>
                      <td className="font-semibold text-slate-900">{order.bill_number}</td>
                      <td>{new Date(order.created_at).toLocaleDateString()}</td>
                      <td>{order.payment_status}</td>
                      <td className="text-right">₹{Number(order.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-200/60 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">Customer Ledger</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(customerDetail.ledger ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400">No ledger entries yet</td>
                    </tr>
                  )}
                  {(customerDetail.ledger ?? []).map((entry: any) => (
                    <tr key={`${entry.id}-${entry.created_at}`}>
                      <td className="font-semibold text-slate-900">{entry.bill_number}</td>
                      <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td className="capitalize">{entry.entry_type}</td>
                      <td>{entry.payment_status}</td>
                      <td className="text-right">₹{Number(entry.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-200/60 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">Reminder History</p>
              </div>
              <div className="divide-y divide-slate-100">
                {(customerDetail.reminderHistory ?? []).length === 0 && (
                  <div className="px-4 py-5 text-sm text-slate-400">No reminders logged yet.</div>
                )}
                {(customerDetail.reminderHistory ?? []).map((entry: any, index: number) => (
                  <div key={`${entry.sentAt}-${index}`} className="px-4 py-3 text-sm">
                    <p className="font-semibold text-slate-900">{entry.channel ?? 'manual'} reminder</p>
                    <p className="mt-1 text-slate-500">
                      {new Date(entry.sentAt).toLocaleString()} · Outstanding ₹{Number(entry.outstanding ?? 0).toFixed(2)}
                    </p>
                    {entry.notes && <p className="mt-1 text-slate-600">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-2xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Customers</p>
                <h2 className="mt-2 text-2xl">{editing ? 'Edit customer' : 'Add customer'}</h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Phone</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <input
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Tags</label>
                <input
                  className="input"
                  value={form.tags}
                  onChange={(e) => setForm((current) => ({ ...current, tags: e.target.value }))}
                  placeholder="vip, chronic-care, wholesale"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Update Customer' : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
