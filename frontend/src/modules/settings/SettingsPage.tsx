import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { NAV_ITEMS } from '@/components/layout/AppLayout';
import { PageIntro } from '@/components/ui/PageIntro';

type SettingsForm = {
  tenantName: string;
  plan: string;
  currency: string;
  timezone: string;
  enableMenuPin: boolean;
  menuPin: string;
  protectedMenus: string[];
  shopName: string;
  shopType: string;
  phone: string;
  gstNumber: string;
  city: string;
  invoiceDlNumbers: string;
  invoiceHeaderLeft: string;
  invoiceHeaderRight: string;
  invoiceWhatsappNumber: string;
  invoiceStoreDisplayName: string;
  invoiceAddressLine: string;
  invoiceFooterNote: string;
  invoiceSignatureLabel: string;
};

const emptyForm: SettingsForm = {
  tenantName: '',
  plan: 'starter',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  enableMenuPin: false,
  menuPin: '',
  protectedMenus: [],
  shopName: '',
  shopType: '',
  phone: '',
  gstNumber: '',
  city: '',
  invoiceDlNumbers: '',
  invoiceHeaderLeft: 'Chemist & Druggist',
  invoiceHeaderRight: 'Cash/Credit Memo',
  invoiceWhatsappNumber: '',
  invoiceStoreDisplayName: '',
  invoiceAddressLine: '',
  invoiceFooterNote: 'Thanks',
  invoiceSignatureLabel: 'Signature',
};

export function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['settings-context'],
    queryFn: () => apiClient.get('/api/core/context/settings').then((r) => r.data.data),
  });

  useEffect(() => {
    if (data) {
      setForm({
        tenantName: data.tenant?.name ?? '',
        plan: data.tenant?.plan ?? 'starter',
        currency: data.tenant?.settings?.currency ?? 'INR',
        timezone: data.tenant?.settings?.timezone ?? 'Asia/Kolkata',
        enableMenuPin:
          data.tenant?.settings?.enableMenuPin === true ||
          data.tenant?.settings?.enableDashboardPin === true,
        menuPin: data.tenant?.settings?.menuPin ?? data.tenant?.settings?.dashboardPin ?? '',
        protectedMenus: Array.isArray(data.tenant?.settings?.protectedMenus)
          ? data.tenant.settings.protectedMenus
          : data.tenant?.settings?.enableDashboardPin
            ? ['dashboard']
            : [],
        shopName: data.shop?.name ?? '',
        shopType: data.shop?.type ?? '',
        phone: data.shop?.phone ?? '',
        gstNumber: data.shop?.gst_number ?? '',
        city: data.shop?.address?.city ?? '',
        invoiceDlNumbers: data.shop?.settings?.invoiceTemplate?.dlNumbers ?? '',
        invoiceHeaderLeft:
          data.shop?.settings?.invoiceTemplate?.headerLeft ?? 'Chemist & Druggist',
        invoiceHeaderRight:
          data.shop?.settings?.invoiceTemplate?.headerRight ?? 'Cash/Credit Memo',
        invoiceWhatsappNumber: data.shop?.settings?.invoiceTemplate?.whatsappNumber ?? '',
        invoiceStoreDisplayName:
          data.shop?.settings?.invoiceTemplate?.storeDisplayName ?? data.shop?.name ?? '',
        invoiceAddressLine:
          data.shop?.settings?.invoiceTemplate?.addressLine ??
          [data.shop?.address?.line1, data.shop?.address?.city].filter(Boolean).join(', '),
        invoiceFooterNote: data.shop?.settings?.invoiceTemplate?.footerNote ?? 'Thanks',
        invoiceSignatureLabel:
          data.shop?.settings?.invoiceTemplate?.signatureLabel ?? 'Signature',
      });
      setIsEditing(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (form.enableMenuPin && !/^\d{4}$/.test(form.menuPin.trim())) {
        throw new Error('Menu PIN must be exactly 4 digits');
      }

      if (form.enableMenuPin && form.protectedMenus.length === 0) {
        throw new Error('Select at least one menu to protect');
      }

      return apiClient.put('/api/core/context/settings', {
        tenantName: form.tenantName.trim(),
        plan: form.plan,
        tenantSettings: {
          currency: form.currency.trim(),
          timezone: form.timezone.trim(),
          enableMenuPin: form.enableMenuPin,
          menuPin: form.enableMenuPin ? form.menuPin.trim() : '',
          protectedMenus: form.enableMenuPin ? form.protectedMenus : [],
          enableDashboardPin: false,
          dashboardPin: '',
        },
        shopName: form.shopName.trim(),
        shopType: form.shopType.trim(),
        phone: form.phone.trim(),
        gstNumber: form.gstNumber.trim(),
        address: { city: form.city.trim() },
        shopSettings: {
          invoiceTemplate: {
            dlNumbers: form.invoiceDlNumbers.trim(),
            headerLeft: form.invoiceHeaderLeft.trim(),
            headerRight: form.invoiceHeaderRight.trim(),
            whatsappNumber: form.invoiceWhatsappNumber.trim(),
            storeDisplayName: form.invoiceStoreDisplayName.trim(),
            addressLine: form.invoiceAddressLine.trim(),
            footerNote: form.invoiceFooterNote.trim(),
            signatureLabel: form.invoiceSignatureLabel.trim(),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success('Settings updated');
      setIsEditing(false);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Unable to update settings');
    },
  });

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Settings"
        title="Store configuration is now functional."
        description="Update tenant and shop settings without changing the existing page structure, keeping the app ready for real operational use."
      />

      <div className="card p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="section-label">Tenant</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Business Name</label>
            <input className="input" value={form.tenantName} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, tenantName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Plan</label>
            <select className="input" value={form.plan} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, plan: e.target.value }))}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Currency</label>
            <input className="input" value={form.currency} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, currency: e.target.value }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Timezone</label>
            <input className="input" value={form.timezone} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, timezone: e.target.value }))} />
          </div>
          <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Menu Locker</p>
                <p className="mt-1 text-sm text-slate-500">Protect any left-side menu with one shared 4-digit PIN.</p>
              </div>
              <button
                type="button"
                disabled={!isEditing}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    enableMenuPin: !current.enableMenuPin,
                  }))
                }
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  form.enableMenuPin ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                aria-pressed={form.enableMenuPin}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    form.enableMenuPin ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {form.enableMenuPin && (
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,220px),1fr]">
                <div className="max-w-xs">
                  <label className="mb-2 block text-sm font-medium text-slate-700">4-Digit PIN</label>
                  <input
                    className="input"
                    type="password"
                    disabled={!isEditing}
                    inputMode="numeric"
                    maxLength={4}
                    value={form.menuPin}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        menuPin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Select Menus</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {NAV_ITEMS.map((item) => {
                      const isChecked = form.protectedMenus.includes(item.lockKey);

                      return (
                        <label
                          key={item.lockKey}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            disabled={!isEditing}
                            checked={isChecked}
                            onChange={() =>
                              setForm((current) => ({
                                ...current,
                                protectedMenus: isChecked
                                  ? current.protectedMenus.filter((menu) => menu !== item.lockKey)
                                  : [...current.protectedMenus, item.lockKey],
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 mt-4">
            <p className="section-label">Shop</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Shop Name</label>
            <input className="input" value={form.shopName} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, shopName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Shop Type</label>
            <input className="input" value={form.shopType} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, shopType: e.target.value }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Phone</label>
            <input className="input" value={form.phone} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">GST Number</label>
            <input className="input" value={form.gstNumber} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, gstNumber: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">City</label>
            <input className="input" value={form.city} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} />
          </div>

          <div className="md:col-span-2 mt-4">
            <p className="section-label">Medical Invoice Template</p>
          </div>
          <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
            <p className="text-sm text-slate-500">
              These details are used on the invoice sheet shown after payment for medical stores.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Invoice Shop Name</label>
                <input className="input" value={form.invoiceStoreDisplayName} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceStoreDisplayName: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">WhatsApp Number</label>
                <input className="input" value={form.invoiceWhatsappNumber} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceWhatsappNumber: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">DL Numbers</label>
                <textarea className="input min-h-[96px]" value={form.invoiceDlNumbers} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceDlNumbers: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Invoice Address Line</label>
                <input className="input" value={form.invoiceAddressLine} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceAddressLine: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Header Left Label</label>
                <input className="input" value={form.invoiceHeaderLeft} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceHeaderLeft: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Header Right Label</label>
                <input className="input" value={form.invoiceHeaderRight} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceHeaderRight: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Footer Note</label>
                <input className="input" value={form.invoiceFooterNote} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceFooterNote: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Signature Label</label>
                <input className="input" value={form.invoiceSignatureLabel} disabled={!isEditing} onChange={(e) => setForm((current) => ({ ...current, invoiceSignatureLabel: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {isEditing ? (
            <>
              <button
                type="button"
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                onClick={() => {
                  if (data) {
                    setForm({
                      tenantName: data.tenant?.name ?? '',
                      plan: data.tenant?.plan ?? 'starter',
                      currency: data.tenant?.settings?.currency ?? 'INR',
                      timezone: data.tenant?.settings?.timezone ?? 'Asia/Kolkata',
                      enableMenuPin:
                        data.tenant?.settings?.enableMenuPin === true ||
                        data.tenant?.settings?.enableDashboardPin === true,
                      menuPin: data.tenant?.settings?.menuPin ?? data.tenant?.settings?.dashboardPin ?? '',
                      protectedMenus: Array.isArray(data.tenant?.settings?.protectedMenus)
                        ? data.tenant.settings.protectedMenus
                        : data.tenant?.settings?.enableDashboardPin
                          ? ['dashboard']
                          : [],
                      shopName: data.shop?.name ?? '',
                      shopType: data.shop?.type ?? '',
                      phone: data.shop?.phone ?? '',
                      gstNumber: data.shop?.gst_number ?? '',
                      city: data.shop?.address?.city ?? '',
                      invoiceDlNumbers: data.shop?.settings?.invoiceTemplate?.dlNumbers ?? '',
                      invoiceHeaderLeft:
                        data.shop?.settings?.invoiceTemplate?.headerLeft ?? 'Chemist & Druggist',
                      invoiceHeaderRight:
                        data.shop?.settings?.invoiceTemplate?.headerRight ?? 'Cash/Credit Memo',
                      invoiceWhatsappNumber: data.shop?.settings?.invoiceTemplate?.whatsappNumber ?? '',
                      invoiceStoreDisplayName:
                        data.shop?.settings?.invoiceTemplate?.storeDisplayName ?? data.shop?.name ?? '',
                      invoiceAddressLine:
                        data.shop?.settings?.invoiceTemplate?.addressLine ??
                        [data.shop?.address?.line1, data.shop?.address?.city].filter(Boolean).join(', '),
                      invoiceFooterNote:
                        data.shop?.settings?.invoiceTemplate?.footerNote ?? 'Thanks',
                      invoiceSignatureLabel:
                        data.shop?.settings?.invoiceTemplate?.signatureLabel ?? 'Signature',
                    });
                  }
                  setIsEditing(false);
                }}
                disabled={saveMutation.isPending}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
                {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsEditing(true)}
              disabled={isLoading}
            >
              Edit Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
