import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { AlertTriangle, Boxes, Download, FileSpreadsheet, PackageCheck, Plus, Printer, RotateCcw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { PageIntro } from '@/components/ui/PageIntro';
import { EmptyState } from '@/components/ui/EmptyState';
import { getShopTypeLabel, isMedicalShopType, useActiveShopType } from '@/lib/shop/shopType';

export function InventoryPage() {
  const today = new Date().toISOString().slice(0, 10);
  const shopId = useAuthStore((s) => s.activeShopId);
  const can = useAuthStore((s) => s.can);
  const activeShopType = useActiveShopType();
  const isMedicalStore = isMedicalShopType(activeShopType);
  const queryClient = useQueryClient();
  const labelSheetRef = useRef<HTMLDivElement>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [importText, setImportText] = useState('');
  const [importSourceLabel, setImportSourceLabel] = useState('Paste CSV or Excel data');
  const [auditCounts, setAuditCounts] = useState<Record<string, string>>({});
  const [adjustment, setAdjustment] = useState({
    productId: '',
    quantity: '1',
    direction: 'add',
    type: 'adjustment',
    supplierId: '',
    movementDate: today,
    challanNumber: '',
    invoiceNumber: '',
    batchNo: '',
    manufactureDate: '',
    expiryDate: '',
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', shopId],
    queryFn: () => apiClient.get(`/api/core/inventory?shopId=${shopId}`).then((r) => r.data),
    enabled: !!shopId,
  });

  const { data: products } = useQuery({
    queryKey: ['inventory-products', shopId],
    queryFn: () => apiClient.get('/api/core/products?perPage=100').then((r) => r.data.data),
    enabled: !!shopId && showAdjust,
  });

  const { data: suppliers } = useQuery({
    queryKey: ['inventory-suppliers', shopId],
    queryFn: () => apiClient.get('/api/core/suppliers?perPage=200').then((r) => r.data.data),
    enabled: !!shopId && showAdjust && isMedicalStore,
  });

  const { data: expiryAlerts } = useQuery({
    queryKey: ['expiry-alerts', shopId],
    queryFn: () => apiClient.get(`/api/core/inventory/expiry-alerts?shopId=${shopId}&days=90`).then((r) => r.data.data),
    enabled: !!shopId && isMedicalStore,
  });

  const adjustMutation = useMutation({
    mutationFn: () => {
      if (!shopId) throw new Error('No active shop selected');
      const qty = Number(adjustment.quantity || 0);
      if (!adjustment.productId || qty <= 0) throw new Error('Select a product and quantity');
      return apiClient.post('/api/core/inventory/adjust', {
        shopId,
        productId: adjustment.productId,
        quantity: adjustment.direction === 'remove' ? -qty : qty,
        type: adjustment.type,
        supplierId: adjustment.supplierId || undefined,
        movementDate: adjustment.movementDate || undefined,
        challanNumber: adjustment.challanNumber || undefined,
        invoiceNumber: adjustment.invoiceNumber || undefined,
        batchNo: adjustment.batchNo || undefined,
        manufactureDate: adjustment.manufactureDate || undefined,
        expiryDate: adjustment.expiryDate || undefined,
        notes: adjustment.notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Inventory adjusted');
      setShowAdjust(false);
      setAdjustment({
        productId: '',
        quantity: '1',
        direction: 'add',
        type: 'adjustment',
        supplierId: '',
        movementDate: today,
        challanNumber: '',
        invoiceNumber: '',
        batchNo: '',
        manufactureDate: '',
        expiryDate: '',
        notes: '',
      });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product-search'] });
      queryClient.invalidateQueries({ queryKey: ['pos-top-products'] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? err.response?.data?.message ?? 'Unable to adjust stock');
    },
  });

  const inventoryRows = useMemo(
    () =>
      (data?.data ?? []).flatMap((item: any) => {
        const batches = Array.isArray(item.batch_details) ? item.batch_details : [];

        if (!isMedicalStore || batches.length === 0) {
          return [{ ...item, rowQuantity: Number(item.quantity), batchNo: null, manufactureDate: null, expiryDate: null }];
        }

        return batches.map((batch: any, index: number) => ({
          ...item,
          id: `${item.id}-${batch.batchNo ?? 'batch'}-${batch.manufactureDate ?? 'mfg'}-${batch.expiry ?? 'exp'}-${index}`,
          rowQuantity: Number(batch.quantity ?? 0),
          batchNo: batch.batchNo ?? null,
          manufactureDate: batch.manufactureDate ?? null,
          expiryDate: batch.expiry ?? null,
        }));
      }),
    [data?.data, isMedicalStore],
  );
  const parsedImportRows = useMemo(() => parseInventoryImport(importText), [importText]);
  const auditRows = useMemo(
    () =>
      inventoryRows.map((row: any) => {
        const auditKey = row.id;
        const physicalQty = Number(auditCounts[auditKey] ?? row.rowQuantity ?? 0);
        const variance = physicalQty - Number(row.rowQuantity ?? 0);
        return {
          auditKey,
          productId: row.product_id,
          productName: row.product_name,
          expectedQuantity: Number(row.rowQuantity ?? 0),
          actualQuantity: physicalQty,
          variance,
          batchNo: row.batchNo ?? undefined,
          manufactureDate: row.manufactureDate ?? undefined,
          expiryDate: row.expiryDate ?? undefined,
        };
      }),
    [auditCounts, inventoryRows],
  );

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error('No active shop selected');
      if (parsedImportRows.rows.length === 0) {
        throw new Error('Add at least one valid row to import');
      }

      return apiClient.post('/api/core/inventory/import', {
        shopId,
        rows: parsedImportRows.rows,
      });
    },
    onSuccess: (response) => {
      const summary = response.data?.data;
      toast.success(
        `Imported ${summary?.imported ?? parsedImportRows.rows.length} rows${summary?.createdProducts ? ` and created ${summary.createdProducts} products` : ''}`,
      );
      setShowImport(false);
      setImportText('');
      setImportSourceLabel('Paste CSV or Excel data');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-search'] });
      queryClient.invalidateQueries({ queryKey: ['pos-top-products'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Unable to import inventory');
    },
  });

  const finalizeAuditMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error('No active shop selected');
      const changedRows = auditRows.filter((row: any) => row.variance !== 0);
      if (changedRows.length === 0) {
        throw new Error('No stock variance found to post');
      }

      return apiClient.post('/api/core/inventory/audit/finalize', {
        shopId,
        rows: changedRows.map((row: any) => ({
          productId: row.productId,
          expectedQuantity: row.expectedQuantity,
          actualQuantity: row.actualQuantity,
          batchNo: row.batchNo,
          manufactureDate: row.manufactureDate,
          expiryDate: row.expiryDate,
        })),
      });
    },
    onSuccess: (response) => {
      const summary = response.data?.data;
      toast.success(`Stock audit posted for ${summary?.adjusted ?? 0} rows`);
      setShowAudit(false);
      setAuditCounts({});
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['expiry-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['report-audit-log'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Unable to finalize stock audit');
    },
  });

  const expiredReturnMutation = useMutation({
    mutationFn: async (row: any) => {
      if (!shopId) throw new Error('No active shop selected');
      return apiClient.post('/api/core/inventory/return-expired', {
        shopId,
        productId: row.product_id,
        quantity: Number(row.batch_quantity ?? 0),
        batchNo: row.batch_no || undefined,
        manufactureDate: row.manufacture_date || undefined,
        expiryDate: row.expiry_date || undefined,
        notes: 'Returned from expiry watch',
      });
    },
    onSuccess: () => {
      toast.success('Expired batch returned from inventory');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['expiry-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['report-audit-log'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Unable to return expired stock');
    },
  });

  return (
    <div className="page-shell page-stack">
      <PageIntro
        eyebrow="Inventory"
        title="Stock visibility designed to be scanned instantly."
        description={`A clearer inventory view helps your ${getShopTypeLabel(activeShopType).toLowerCase()} team spot risk faster, respond earlier, and keep shelves confidently stocked.`}
        actions={
          can('inventory', 'adjust') ? (
            <div className="flex flex-wrap gap-3">
              <button className="btn-secondary" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
                Import Stock
              </button>
              <button className="btn-secondary" onClick={() => setShowAudit(true)}>
                <PackageCheck className="h-4 w-4" />
                Stock Audit
              </button>
              <button className="btn-secondary" onClick={() => setShowLabels(true)}>
                <Printer className="h-4 w-4" />
                Print Labels
              </button>
              <button className="btn-primary" onClick={() => setShowAdjust(true)}>
                <Plus className="h-4 w-4" />
                Adjust Stock
              </button>
            </div>
          ) : undefined
        }
      />
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th className="text-right">In Stock</th>
              {isMedicalStore && <th>Batch Details</th>}
              <th className="text-right">Reorder At</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && inventoryRows.length === 0 && (
              <tr>
                <td colSpan={isMedicalStore ? 6 : 5} className="p-0">
                  <EmptyState
                    icon={<Boxes className="h-8 w-8" />}
                    title="Inventory will appear here"
                    description="Once products are stocked, this screen becomes your clean operating view for quantity and reorder thresholds."
                  />
                </td>
              </tr>
            )}
            {inventoryRows.map((i: any) => {
              const isLow = i.reorder_level > 0 && Number(i.rowQuantity) <= Number(i.reorder_level);
              return (
                <tr key={i.id} className={isLow ? '!bg-rose-50/80' : ''}>
                  <td className="font-semibold text-slate-950">{i.product_name}</td>
                  <td className="text-slate-500">{i.sku}</td>
                  <td className="text-right font-semibold">{i.rowQuantity} {i.unit}</td>
                  {isMedicalStore && (
                    <td className="text-sm text-slate-500">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="font-semibold text-slate-700">{i.batchNo || 'No batch data'}</p>
                        <p>Mfg {i.manufactureDate || 'N/A'}</p>
                        <p>Exp {i.expiryDate || 'N/A'}</p>
                      </div>
                    </td>
                  )}
                  <td className="text-right text-slate-500">{i.reorder_level} {i.unit}</td>
                  <td>
                    {isLow ? (
                      <span className="badge badge-red flex items-center gap-1 w-fit">
                        <AlertTriangle className="h-3 w-3" /> Low Stock
                      </span>
                    ) : (
                      <span className="badge badge-green">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isMedicalStore && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200/60 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-950">Expiry Watch</h3>
            <p className="mt-1 text-sm text-slate-500">Batches expiring in the next 90 days so the store can discount, return, or clear them early.</p>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Mfg</th>
                <th>Exp</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Days Left</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(expiryAlerts ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-400">No near-expiry batches right now.</td>
                </tr>
              )}
              {(expiryAlerts ?? []).map((alert: any) => (
                <tr key={`${alert.product_id}-${alert.batch_no}-${alert.expiry_date}`}>
                  <td className="font-semibold text-slate-950">{alert.product_name}</td>
                  <td>{alert.batch_no || '—'}</td>
                  <td>{alert.manufacture_date || '—'}</td>
                  <td>{alert.expiry_date || '—'}</td>
                  <td className="text-right">{Number(alert.batch_quantity ?? 0)}</td>
                  <td className="text-right">
                    <span className={`badge ${Number(alert.daysLeft) <= 30 ? 'badge-red' : 'badge-yellow'}`}>
                      {alert.daysLeft} days
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      className="btn-secondary"
                      onClick={() => expiredReturnMutation.mutate(alert)}
                      disabled={expiredReturnMutation.isPending}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Return Batch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-2xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Inventory</p>
                <h2 className="mt-2 text-2xl">Adjust stock</h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowAdjust(false)}>Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Product</label>
                <select
                  className="input"
                  value={adjustment.productId}
                  onChange={(e) => setAdjustment((current) => ({ ...current, productId: e.target.value }))}
                >
                  <option value="">Select product</option>
                  {(products ?? []).map((product: any) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Direction</label>
                <select className="input" value={adjustment.direction} onChange={(e) => setAdjustment((current) => ({ ...current, direction: e.target.value }))}>
                  <option value="add">Add stock</option>
                  <option value="remove">Remove stock</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Quantity</label>
                <input className="input" value={adjustment.quantity} onChange={(e) => setAdjustment((current) => ({ ...current, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Type</label>
                <select className="input" value={adjustment.type} onChange={(e) => setAdjustment((current) => ({ ...current, type: e.target.value }))}>
                  {['adjustment', 'purchase', 'return', 'transfer', 'sale'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              {isMedicalStore && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Supplier</label>
                    <select
                      className="input"
                      value={adjustment.supplierId}
                      onChange={(e) => setAdjustment((current) => ({ ...current, supplierId: e.target.value }))}
                    >
                      <option value="">Select supplier</option>
                      {(suppliers ?? []).map((supplier: any) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
                    <input
                      type="date"
                      className="input"
                      value={adjustment.movementDate}
                      onChange={(e) => setAdjustment((current) => ({ ...current, movementDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Batch Number</label>
                    <input className="input" value={adjustment.batchNo} onChange={(e) => setAdjustment((current) => ({ ...current, batchNo: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Manufacturing Date</label>
                    <input type="date" className="input" value={adjustment.manufactureDate} onChange={(e) => setAdjustment((current) => ({ ...current, manufactureDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Expiry Date</label>
                    <input type="date" className="input" value={adjustment.expiryDate} onChange={(e) => setAdjustment((current) => ({ ...current, expiryDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Challan Number</label>
                    <input className="input" value={adjustment.challanNumber} onChange={(e) => setAdjustment((current) => ({ ...current, challanNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Invoice</label>
                    <input className="input" value={adjustment.invoiceNumber} onChange={(e) => setAdjustment((current) => ({ ...current, invoiceNumber: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Notes</label>
                <input className="input" value={adjustment.notes} onChange={(e) => setAdjustment((current) => ({ ...current, notes: e.target.value }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setShowAdjust(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? 'Saving…' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-4xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="section-label">Bulk Import</p>
                <h2 className="mt-2 text-2xl">Import inventory from Excel or CSV</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Upload `.csv`, `.tsv`, or `.xlsx`, or paste sheet data with columns like <span className="font-semibold text-slate-700">product_name, quantity, batch_no, manufacture_date, expiry_date</span>.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setShowImport(false)}>Close</button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr,0.9fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Paste your sheet data or load a file</p>
                      <p className="mt-1 text-xs text-slate-500">{importSourceLabel}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" type="button" onClick={downloadInventoryTemplate}>
                        <Download className="h-4 w-4" />
                        Template
                      </button>
                      <label className="btn-secondary cursor-pointer">
                        <FileSpreadsheet className="h-4 w-4" />
                        Choose File
                      <input
                        type="file"
                        accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={(event) => void handleImportFile(event, setImportText, setImportSourceLabel)}
                      />
                      </label>
                    </div>
                  </div>
                  <textarea
                    className="min-h-[320px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
                    value={importText}
                    onChange={(event) => {
                      setImportText(event.target.value);
                      setImportSourceLabel('Manual paste or typed data');
                    }}
                    placeholder={`product_name,sku,barcode,unit,mrp,selling_price,purchase_price,gst_rate,low_stock_quantity,total_units,loose_selling_price,nrx,quantity,batch_no,manufacture_date,expiry_date,supplier_name\nParacetamol 650,PCM650,,strip,35,32,24,12,10,15,3,false,20,BATCH-APR-01,2026-01-10,2028-01-09,Sun Pharma`}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Valid rows</h3>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{parsedImportRows.validRows.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Ready to import into products and inventory.</p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-900">Rows with issues</h3>
                  <p className="mt-2 text-3xl font-semibold text-amber-950">{parsedImportRows.invalidRows.length}</p>
                  <p className="mt-1 text-sm text-amber-800">Fix these rows before importing for a clean stock load.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Supported columns</p>
                  <p className="mt-2">Use headers like `product_name`, `sku`, `barcode`, `unit`, `mrp`, `selling_price`, `purchase_price`, `gst_rate`, `quantity`, `batch_no`, `manufacture_date`, `expiry_date`, `supplier_name`.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Preview summary</p>
                  <p className="mt-2">Total rows detected: <span className="font-semibold text-slate-900">{parsedImportRows.totalRows}</span></p>
                  <p className="mt-1">New products to create: <span className="font-semibold text-slate-900">{parsedImportRows.validRows.filter((row: ParsedImportRow) => row.row.productName).length}</span></p>
                </div>
              </div>
            </div>

            {parsedImportRows.invalidRows.length > 0 && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Row-by-row issues</h3>
                </div>
                <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-amber-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-amber-50 text-amber-900">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedImportRows.invalidRows.map((row) => (
                        <tr key={`invalid-${row.index}`} className="border-t border-amber-100">
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.index}</td>
                          <td className="px-3 py-2 text-slate-700">{row.row.productName || 'Unknown'}</td>
                          <td className="px-3 py-2 text-amber-800">{row.errors.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {parsedImportRows.validRows.length > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Import preview</h3>
                <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Batch</th>
                        <th className="px-3 py-2">Mfg</th>
                        <th className="px-3 py-2">Exp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedImportRows.validRows.slice(0, 20).map((row) => (
                        <tr key={`valid-${row.index}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-900">{row.index}</td>
                          <td className="px-3 py-2 text-slate-700">{row.row.productName}</td>
                          <td className="px-3 py-2 text-slate-700">{row.row.quantity}</td>
                          <td className="px-3 py-2 text-slate-700">{row.row.batchNo || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{row.row.manufactureDate || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{row.row.expiryDate || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedImportRows.validRows.length > 20 && (
                  <p className="mt-2 text-xs text-slate-500">Showing first 20 valid rows.</p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => importMutation.mutate()} disabled={importMutation.isPending || parsedImportRows.rows.length === 0 || parsedImportRows.invalidRows.length > 0}>
                {importMutation.isPending ? 'Importing…' : 'Import Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong w-full max-w-5xl rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Stock Audit</p>
                <h2 className="mt-2 text-2xl">Physical count vs system stock</h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowAudit(false)}>Close</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">System Qty</th>
                    <th className="text-right">Physical Qty</th>
                    <th className="text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row: any) => {
                    const auditKey = row.auditKey;
                    return (
                      <tr key={`audit-${auditKey}`}>
                        <td className="font-semibold text-slate-950">
                          {row.productName}
                          {row.batchNo ? <span className="ml-2 text-xs text-slate-500">({row.batchNo})</span> : null}
                        </td>
                        <td className="text-right">{Number(row.expectedQuantity ?? 0)}</td>
                        <td className="text-right">
                          <input
                            type="number"
                            className="input ml-auto h-9 w-24 text-right"
                            value={auditCounts[auditKey] ?? String(row.expectedQuantity ?? 0)}
                            onChange={(e) => setAuditCounts((current) => ({ ...current, [auditKey]: e.target.value }))}
                          />
                        </td>
                        <td className={`text-right font-semibold ${row.variance === 0 ? 'text-slate-500' : row.variance > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {row.variance > 0 ? '+' : ''}{row.variance.toFixed(0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {auditRows.filter((row: any) => row.variance !== 0).length} rows with variance
              </p>
              <div className="flex gap-3">
                <button className="btn-secondary" onClick={() => setShowAudit(false)}>Cancel</button>
                <button
                  className="btn-primary"
                  onClick={() => finalizeAuditMutation.mutate()}
                  disabled={finalizeAuditMutation.isPending}
                >
                  {finalizeAuditMutation.isPending ? 'Posting Audit…' : 'Finalize Audit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLabels && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="card-strong flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col rounded-[2rem] p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="section-label">Barcode Labels</p>
                <h2 className="mt-2 text-2xl">Printable product and batch labels</h2>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button className="btn-secondary" onClick={() => setShowLabels(false)}>Close</button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div ref={labelSheetRef} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {inventoryRows.slice(0, 24).map((row: any) => (
                  <div key={`label-${row.id}`} className="rounded-2xl border border-slate-300 bg-white p-4 text-slate-900">
                    <p className="text-lg font-semibold">{row.product_name}</p>
                    <p className="mt-1 text-sm text-slate-500">SKU: {row.sku || 'N/A'}</p>
                    <p className="mt-1 text-sm text-slate-500">Batch: {row.batchNo || 'N/A'}</p>
                    <p className="mt-1 text-sm text-slate-500">Mfg: {row.manufactureDate || 'N/A'} · Exp: {row.expiryDate || 'N/A'}</p>
                    <div className="mt-4 rounded-xl border border-slate-900 px-3 py-4 text-center">
                      <BarcodeLabelValue value={buildLabelBarcodeValue(row)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ParsedInventoryImport = {
  rows: InventoryImportRow[];
  validRows: ParsedImportRow[];
  invalidRows: ParsedImportIssue[];
  totalRows: number;
};

type InventoryImportRow = {
  productName: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  mrp?: number;
  sellingPrice?: number;
  purchasePrice?: number;
  gstRate?: number;
  lowStockQuantity?: number;
  totalUnits?: number;
  looseSellingPrice?: number;
  nrx?: boolean;
  quantity: number;
  batchNo?: string;
  manufactureDate?: string;
  expiryDate?: string;
  supplierName?: string;
};

type ParsedImportRow = {
  index: number;
  row: InventoryImportRow;
};

type ParsedImportIssue = {
  index: number;
  row: Partial<InventoryImportRow>;
  errors: string[];
};

async function handleImportFile(
  event: ChangeEvent<HTMLInputElement>,
  setImportText: (value: string) => void,
  setImportSourceLabel: (value: string) => void,
) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'xlsx') {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        raw: false,
        defval: '',
      });
      const text = rows
        .map((row) => row.map((cell) => escapeCsvValue(String(cell ?? ''))).join(','))
        .join('\n');
      setImportText(text);
      setImportSourceLabel(`Loaded ${file.name} (${sheetName})`);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setImportText(typeof reader.result === 'string' ? reader.result : '');
        setImportSourceLabel(`Loaded ${file.name}`);
      };
      reader.readAsText(file);
    }
  } catch (error) {
    toast.error('Unable to read the selected file');
  }

  event.target.value = '';
}

function parseInventoryImport(raw: string): ParsedInventoryImport {
  const input = raw.trim();
  if (!input) {
    return { rows: [], validRows: [], invalidRows: [], totalRows: 0 };
  }

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], validRows: [], invalidRows: [], totalRows: Math.max(lines.length - 1, 0) };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  const rows: InventoryImportRow[] = [];
  const validRows: ParsedImportRow[] = [];
  const invalidRows: ParsedImportIssue[] = [];

  lines.slice(1).forEach((line, rowOffset) => {
    const values = splitDelimitedLine(line, delimiter);
    const built = buildImportRow(headers, values);
    const rowIndex = rowOffset + 2;

    if (built.errors.length > 0 || !built.row) {
      invalidRows.push({
        index: rowIndex,
        row: built.row ?? buildLoosePreviewRow(headers, values),
        errors: built.errors.length > 0 ? built.errors : ['Unable to parse row'],
      });
      return;
    }
    rows.push(built.row);
    validRows.push({ index: rowIndex, row: built.row });
  });

  return { rows, validRows, invalidRows, totalRows: lines.length - 1 };
}

function detectDelimiter(line: string) {
  if (line.includes('\t')) return '\t';
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function splitDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"(.*)"$/, '$1').trim());
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function buildImportRow(headers: string[], values: string[]): { row: InventoryImportRow | null; errors: string[] } {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const index = headers.indexOf(key);
      if (index >= 0) {
        return values[index]?.trim() ?? '';
      }
    }
    return '';
  };

  const productName = get('product_name', 'product', 'medicine_name', 'name');
  const quantityText = get('quantity', 'qty', 'stock');
  const quantity = parseNumber(quantityText);
  const manufactureDate = normalizeDate(get('manufacture_date', 'manufacturing_date', 'mfg_date', 'mfd'));
  const expiryDate = normalizeDate(get('expiry_date', 'exp_date', 'expiry', 'expires_on'));
  const errors: string[] = [];

  if (!productName) {
    errors.push('Product name is required');
  }
  if (!quantityText.trim() || quantity <= 0) {
    errors.push('Quantity must be greater than 0');
  }
  if (manufactureDate && !isIsoDate(manufactureDate)) {
    errors.push('Manufacturing date is invalid');
  }
  if (expiryDate && !isIsoDate(expiryDate)) {
    errors.push('Expiry date is invalid');
  }
  if (manufactureDate && expiryDate && isIsoDate(manufactureDate) && isIsoDate(expiryDate) && expiryDate < manufactureDate) {
    errors.push('Expiry date must be after manufacturing date');
  }

  if (errors.length > 0) {
    return {
      row: {
        productName,
        quantity: quantity > 0 ? quantity : 0,
        batchNo: emptyToUndefined(get('batch_no', 'batch', 'batch_number')),
        manufactureDate,
        expiryDate,
        supplierName: emptyToUndefined(get('supplier_name', 'supplier', 'vendor_name')),
      },
      errors,
    };
  }

  return {
    row: {
      productName,
      sku: emptyToUndefined(get('sku')),
      barcode: emptyToUndefined(get('barcode')),
      unit: emptyToUndefined(get('unit')),
      mrp: parseOptionalNumber(get('mrp')),
      sellingPrice: parseOptionalNumber(get('selling_price', 'sellingprice', 'sale_price')),
      purchasePrice: parseOptionalNumber(get('purchase_price', 'purchaseprice', 'buy_price', 'cost_price')),
      gstRate: parseOptionalNumber(get('gst_rate', 'gst')),
      lowStockQuantity: parseOptionalNumber(get('low_stock_quantity', 'low_stock', 'reorder_level')),
      totalUnits: parseOptionalNumber(get('total_units', 'pack_size')),
      looseSellingPrice: parseOptionalNumber(get('loose_selling_price', 'loose_price')),
      nrx: parseOptionalBoolean(get('nrx', 'is_nrx', 'prescription_required')),
      quantity,
      batchNo: emptyToUndefined(get('batch_no', 'batch', 'batch_number')),
      manufactureDate,
      expiryDate,
      supplierName: emptyToUndefined(get('supplier_name', 'supplier', 'vendor_name')),
    },
    errors: [],
  };
}

function parseNumber(value: string) {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumber(value: string) {
  const parsed = parseNumber(value);
  return parsed === 0 && value.trim() === '' ? undefined : parsed;
}

function parseOptionalBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return undefined;
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const day = first.padStart(2, '0');
    const month = second.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toISOString().slice(0, 10);
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildLoosePreviewRow(headers: string[], values: string[]): Partial<InventoryImportRow> {
  const headerMap = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  return {
    productName: String(headerMap.product_name ?? headerMap.product ?? headerMap.name ?? ''),
    quantity: parseNumber(String(headerMap.quantity ?? headerMap.qty ?? '0')),
    batchNo: emptyToUndefined(String(headerMap.batch_no ?? headerMap.batch ?? '')),
    manufactureDate: normalizeDate(String(headerMap.manufacture_date ?? headerMap.manufacturing_date ?? '')),
    expiryDate: normalizeDate(String(headerMap.expiry_date ?? headerMap.expiry ?? '')),
  };
}

function escapeCsvValue(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadInventoryTemplate() {
  const csv = [
    'product_name,sku,barcode,unit,mrp,selling_price,purchase_price,gst_rate,low_stock_quantity,total_units,loose_selling_price,nrx,quantity,batch_no,manufacture_date,expiry_date,supplier_name',
    'Paracetamol 650,PCM650,,strip,35,32,24,12,10,15,3,false,20,BATCH-APR-01,2026-01-10,2028-01-09,Sun Pharma',
    'Amoxicillin 500,AMX500,,box,120,110,84,12,8,,,true,12,BATCH-APR-02,2026-02-15,2028-02-14,Cipla',
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'inventory-import-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function buildLabelBarcodeValue(row: any) {
  const base = String(row.sku || row.barcode || row.batchNo || row.product_name || 'ITEM')
    .replace(/[^A-Za-z0-9-]/g, '')
    .slice(0, 32);
  return base || 'ITEM';
}

function BarcodeLabelValue({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      displayValue: true,
      fontSize: 14,
      margin: 0,
      height: 44,
      width: 1.5,
    });
  }, [value]);

  return <svg ref={svgRef} aria-label={`Barcode ${value}`} className="mx-auto h-16 w-full" />;
}
