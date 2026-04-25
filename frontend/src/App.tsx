import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/auth.store';
import { apiClient } from '@/lib/api/client';
import { AppLayout } from '@/components/layout/AppLayout';

const LoginPage = lazy(() => import('@/modules/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('@/modules/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const Dashboard = lazy(() => import('@/modules/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })));
const POSPage = lazy(() => import('@/modules/pos/POSPage').then((module) => ({ default: module.POSPage })));
const ProductsPage = lazy(() => import('@/modules/products/ProductsPage').then((module) => ({ default: module.ProductsPage })));
const InventoryPage = lazy(() => import('@/modules/inventory/InventoryPage').then((module) => ({ default: module.InventoryPage })));
const OrdersPage = lazy(() => import('@/modules/orders/OrdersPage').then((module) => ({ default: module.OrdersPage })));
const CustomersPage = lazy(() => import('@/modules/customers/CustomersPage').then((module) => ({ default: module.CustomersPage })));
const SuppliersPage = lazy(() => import('@/modules/suppliers/SuppliersPage').then((module) => ({ default: module.SuppliersPage })));
const ReportsPage = lazy(() => import('@/modules/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));

function RouteFallback() {
  return (
    <div className="page-shell flex min-h-[calc(100vh-6rem)] items-center justify-center">
      <div className="card w-full max-w-md rounded-[2rem] p-6 text-center text-sm text-slate-500">
        Loading workspace...
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PinProtectedRoute({
  menuKey,
  title,
  description,
  buttonLabel,
  children,
}: {
  menuKey: string;
  title: string;
  description: string;
  buttonLabel: string;
  children: React.ReactNode;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const { data } = useQuery({
    queryKey: ['dashboard-pin-settings'],
    queryFn: () => apiClient.get('/api/core/context/settings').then((r) => r.data.data),
  });

  const settings = data?.tenant?.settings ?? {};
  const protectedMenus = Array.isArray(settings.protectedMenus) ? settings.protectedMenus : [];
  const menuPinEnabled = settings.enableMenuPin === true;
  const legacyDashboardEnabled = settings.enableDashboardPin === true;
  const menuPin = settings.menuPin ?? settings.dashboardPin ?? '';
  const shouldProtect =
    (menuPinEnabled && protectedMenus.includes(menuKey)) ||
    (menuKey === 'dashboard' && legacyDashboardEnabled);

  if (!shouldProtect || unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="page-shell flex min-h-[calc(100vh-6rem)] items-center justify-center">
      <div className="card-strong w-full max-w-md rounded-[2rem] p-6">
        <p className="section-label">{title}</p>
        <h2 className="mt-2 text-2xl">Enter 4-digit PIN</h2>
        <p className="mt-3 text-sm text-slate-500">{description}</p>
        <div className="mt-5">
          <input
            className="input text-center text-lg tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setError('');
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
            }}
          />
          {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            className="btn-primary"
            onClick={() => {
              if (pin === menuPin) {
                setUnlocked(true);
                setError('');
                return;
              }
              setError('Incorrect PIN');
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardRoute() {
  return (
    <PinProtectedRoute
      menuKey="dashboard"
      title="Dashboard Lock"
      description="Dashboard access is protected. Enter the 4-digit PIN to continue."
      buttonLabel="Unlock Dashboard"
    >
      <Dashboard />
    </PinProtectedRoute>
  );
}

function SettingsRoute() {
  return (
    <PinProtectedRoute
      menuKey="settings"
      title="Settings Lock"
      description="Settings access is protected. Enter the 4-digit PIN to continue."
      buttonLabel="Unlock Settings"
    >
      <SettingsPage />
    </PinProtectedRoute>
  );
}

function POSRoute() {
  return (
    <PinProtectedRoute menuKey="pos" title="Billing Lock" description="Billing access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Billing">
      <POSPage />
    </PinProtectedRoute>
  );
}

function ProductsRoute() {
  return (
    <PinProtectedRoute menuKey="products" title="Products Lock" description="Products access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Products">
      <ProductsPage />
    </PinProtectedRoute>
  );
}

function InventoryRoute() {
  return (
    <PinProtectedRoute menuKey="inventory" title="Inventory Lock" description="Inventory access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Inventory">
      <InventoryPage />
    </PinProtectedRoute>
  );
}

function OrdersRoute() {
  return (
    <PinProtectedRoute menuKey="orders" title="Orders Lock" description="Orders access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Orders">
      <OrdersPage />
    </PinProtectedRoute>
  );
}

function CustomersRoute() {
  return (
    <PinProtectedRoute menuKey="customers" title="Customers Lock" description="Customers access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Customers">
      <CustomersPage />
    </PinProtectedRoute>
  );
}

function SuppliersRoute() {
  return (
    <PinProtectedRoute menuKey="suppliers" title="Suppliers Lock" description="Suppliers access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Suppliers">
      <SuppliersPage />
    </PinProtectedRoute>
  );
}

function ReportsRoute() {
  return (
    <PinProtectedRoute menuKey="reports" title="Reports Lock" description="Reports access is protected. Enter the 4-digit PIN to continue." buttonLabel="Unlock Reports">
      <ReportsPage />
    </PinProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRoute />} />
            <Route path="pos" element={<POSRoute />} />
            <Route path="products" element={<ProductsRoute />} />
            <Route path="inventory" element={<InventoryRoute />} />
            <Route path="orders" element={<OrdersRoute />} />
            <Route path="customers" element={<CustomersRoute />} />
            <Route path="suppliers" element={<SuppliersRoute />} />
            <Route path="reports" element={<ReportsRoute />} />
            <Route path="settings" element={<SettingsRoute />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
