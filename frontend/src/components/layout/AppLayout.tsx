import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  Users,
  Truck,
  BarChart3,
  Settings,
  LogOut,
  Store,
} from 'lucide-react';
import { useAuthStore } from '@/app/store/auth.store';
import { apiClient } from '@/lib/api/client';
import { getShopTypeLabel, useActiveShop } from '@/lib/shop/shopType';

export const NAV_ITEMS = [
  { to: '/dashboard', lockKey: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pos', lockKey: 'pos', icon: ShoppingCart, label: 'POS / Billing' },
  { to: '/products', lockKey: 'products', icon: Package, label: 'Products' },
  { to: '/inventory', lockKey: 'inventory', icon: Boxes, label: 'Inventory' },
  { to: '/orders', lockKey: 'orders', icon: Receipt, label: 'Orders' },
  { to: '/customers', lockKey: 'customers', icon: Users, label: 'Customers' },
  { to: '/suppliers', lockKey: 'suppliers', icon: Truck, label: 'Suppliers' },
  { to: '/reports', lockKey: 'reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', lockKey: 'settings', icon: Settings, label: 'Settings' },
];

export function AppLayout() {
  const { user, logout, hydrateContext } = useAuthStore();
  const activeShop = useActiveShop();
  const navigate = useNavigate();

  const { data: bootstrap } = useQuery({
    queryKey: ['app-bootstrap'],
    queryFn: () => apiClient.get('/api/core/context/bootstrap').then((r) => r.data.data),
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (bootstrap) {
      hydrateContext({
        user: bootstrap.user,
        shops: bootstrap.shops,
        activeShopId: bootstrap.activeShopId,
      });
    }
  }, [bootstrap, hydrateContext]);

  const handleLogout = async () => {
    try { await apiClient.post('/api/auth/logout'); } catch {}
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        className="hidden lg:flex w-64 flex-col"
        style={{
          background: 'var(--surface)',
          borderRight: '1px solid var(--surface-border)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid var(--surface-border)' }}>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--accent)' }}
          >
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              ShopOS
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {getShopTypeLabel(activeShop?.type)}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-item${isActive ? ' active' : ''}`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="px-3 pb-4 space-y-1" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '0.75rem' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {(user?.name ?? 'O')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {user?.name ?? 'Store Owner'}
              </p>
              <p className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="nav-item w-full"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{
            background: 'rgba(245,245,247,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--surface-border)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent)' }}
            >
              <Store className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>ShopOS</span>
          </div>
          <span className="chip text-xs">{user?.email}</span>
        </header>

        {/* Mobile horizontal nav */}
        <div
          className="lg:hidden sticky top-[49px] z-10 flex gap-1.5 overflow-x-auto px-4 py-2.5"
          style={{
            background: 'rgba(245,245,247,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--surface-border)',
          }}
        >
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-600 bg-white/70 border border-black/[0.06]'
                }`
              }
              style={({ isActive }) => isActive ? { background: 'var(--accent)' } : {}}
            >
              {label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
