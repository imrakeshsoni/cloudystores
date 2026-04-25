import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/app/store/auth.store';
import { decodeToken } from '@/lib/auth/token';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
  tenantSlug: z.string().min(1, 'Required'),
});

type FormData = z.infer<typeof schema>;

const ADMIN_DEMO_TENANT_SLUG = 'medplus';
const ADMIN_DEMO_EMAIL = 'admin@medplus.com';
const ADMIN_DEMO_PASSWORD = 'Demo1234';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const [isAdminLoginPending, setIsAdminLoginPending] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tenantSlug: searchParams.get('slug') ?? '',
    },
  });

  const applyAuthenticatedSession = (accessToken: string, refreshToken: string, user: any) => {
    const payload = decodeToken(accessToken);
    setTokens(accessToken, refreshToken);
    setUser({
      ...user,
      id: user.id ?? payload?.sub ?? '',
      tenantId: user.tenantId ?? payload?.tenantId ?? '',
      permissions: payload?.permissions ?? {},
    });
  };

  const loginWithCredentials = async (data: FormData) => {
    const res = await apiClient.post('/api/auth/login', data);
    const { accessToken, refreshToken, user } = res.data.data;
    applyAuthenticatedSession(accessToken, refreshToken, user);
    navigate('/dashboard');
  };

  const getAdminDemoCredentials = (): FormData => ({
    tenantSlug: ADMIN_DEMO_TENANT_SLUG,
    email: ADMIN_DEMO_EMAIL,
    password: ADMIN_DEMO_PASSWORD,
  });

  const onSubmit = async (data: FormData) => {
    try {
      await loginWithCredentials(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Login failed');
    }
  };

  const handleAdminLogin = async () => {
    setIsAdminLoginPending(true);

    try {
      const credentials = getAdminDemoCredentials();
      setValue('tenantSlug', credentials.tenantSlug);
      setValue('email', credentials.email);
      setValue('password', credentials.password);
      await loginWithCredentials(credentials);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Admin demo login failed');
    } finally {
      setIsAdminLoginPending(false);
    }
  };

  return (
    <div className="app-noise flex min-h-screen items-center justify-center px-4 py-8 md:px-8">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hero-panel hidden min-h-[720px] flex-col justify-between lg:flex">
          <div className="space-y-6">
            <span className="chip">Premium control surface</span>
            <div className="rounded-2xl p-6 text-white" style={{ background: 'var(--text-primary)' }}>
              <div className="mb-10 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
                  <Store className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xl font-semibold">ShopOS</p>
                  <p className="text-sm text-white/60">Run every counter with calm precision.</p>
                </div>
              </div>
              <h1 className="max-w-xl text-5xl font-semibold tracking-tight text-white">
                Retail software with hardware-level clarity.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/70">
                One refined workspace for selling faster, tracking stock, and reviewing daily
                performance with polished, low-friction workflows.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Live POS', 'Fast checkout designed for real counters.'],
              ['Unified stock', 'See inventory, low stock, and sell-through in one place.'],
              ['Elegant reports', 'Daily revenue, GST, and product performance at a glance.'],
            ].map(([title, description]) => (
              <div key={title} className="card p-5">
                <Sparkles className="mb-4 h-5 w-5 text-blue-500" />
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card-strong flex items-center rounded-[2rem] p-4 md:p-8">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <div
                className="mb-5 inline-flex items-center justify-center rounded-2xl p-3 text-white"
                style={{ background: 'var(--accent)' }}
              >
                <Store className="h-6 w-6" />
              </div>
              <p className="section-label">Sign In</p>
              <h2 className="mt-3 text-3xl">Welcome back to your storefront.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Sign in to manage products, inventory, orders, and reports from one clean,
                focused workspace.
              </p>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <div className="card p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-900">Protected sessions</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Secure auth for every store team.</p>
              </div>
              <div className="card p-4">
                <Sparkles className="mb-3 h-5 w-5" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-semibold text-slate-900">Designed to feel premium</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Sharper spacing, calmer surfaces, faster scanning.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Shop ID</label>
                <input {...register('tenantSlug')} placeholder="medplus" className="input" />
                {errors.tenantSlug && (
                  <p className="mt-1 text-xs text-rose-500">{errors.tenantSlug.message}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <input {...register('email')} type="email" placeholder="owner@example.com" className="input" />
                {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input {...register('password')} type="password" className="input" />
                {errors.password && (
                  <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>
                )}
              </div>

              <button type="submit" disabled={isSubmitting || isAdminLoginPending} className="btn-primary mt-2 w-full py-3">
                {isSubmitting ? 'Signing in…' : 'Enter ShopOS'}
                {!isSubmitting && <ChevronRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                disabled={isSubmitting || isAdminLoginPending}
                onClick={handleAdminLogin}
                className="btn-secondary w-full py-3"
              >
                {isAdminLoginPending ? 'Preparing admin demo…' : 'Login as Admin'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              New shop?{' '}
              <Link to="/register" className="font-semibold text-slate-900">
                Register for free
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
