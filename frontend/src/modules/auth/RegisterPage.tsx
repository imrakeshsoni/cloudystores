import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, CircleCheckBig, LayoutTemplate, Store } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

const schema = z.object({
  shopName:  z.string().min(2, 'Shop name required'),
  shopType:  z.enum(['medical','grocery','retail','restaurant','electronics','clothing','other']),
  ownerName: z.string().min(2, 'Your name required'),
  email:     z.string().email('Invalid email'),
  phone:     z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  password:  z.string().min(8, 'Minimum 8 characters'),
  state:     z.string().min(2, 'State required'),
  gstNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const SHOP_TYPES = [
  { value: 'medical',     label: 'Medical / Pharmacy' },
  { value: 'grocery',     label: 'Grocery / Kirana' },
  { value: 'retail',      label: 'General Retail' },
  { value: 'restaurant',  label: 'Restaurant / Café' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing',    label: 'Clothing / Apparel' },
  { value: 'other',       label: 'Other' },
];

const STATES = [
  'Andhra Pradesh','Assam','Bihar','Delhi','Goa','Gujarat','Haryana',
  'Karnataka','Kerala','Madhya Pradesh','Maharashtra','Odisha',
  'Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal',
];

export function RegisterPage() {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await apiClient.post('/api/tenant/onboarding/register', data);
      const { slug } = res.data.data;
      toast.success(`Shop registered! Your shop ID is: ${slug}`);
      navigate(`/login?slug=${slug}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Registration failed');
    }
  };

  return (
    <div className="app-noise flex min-h-screen items-center justify-center px-4 py-8 md:px-8">
      <div className="grid w-full max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hero-panel hidden min-h-[820px] flex-col justify-between lg:flex">
          <div>
            <span className="chip">Launch your store in minutes</span>
            <h1 className="mt-6 max-w-xl text-balance">
              A storefront operating system designed with product-page polish.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              Set up your brand, onboard your team, and move from paperwork to a modern retail
              workflow with a calm, premium interface.
            </p>
          </div>

          <div className="space-y-4">
            {[
              ['14-day trial', 'No card required to explore the full experience.'],
              ['Guided onboarding', 'Smart defaults for retail, pharmacy, grocery, and more.'],
              ['Built for India', 'GST, inventory control, POS, and reporting in one place.'],
            ].map(([title, description]) => (
              <div key={title} className="card flex items-start gap-4 p-5">
                <CircleCheckBig className="mt-1 h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-strong rounded-[2rem] p-5 md:p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div
                className="mb-4 inline-flex items-center justify-center rounded-2xl p-3 text-white"
                style={{ background: 'var(--accent)' }}
              >
                <Store className="h-6 w-6" />
              </div>
              <p className="section-label">Start Free Trial</p>
              <h2 className="mt-3 text-3xl">Create a store that feels future-ready.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Your setup experience now mirrors the rest of the product: clean hierarchy, soft
                glass surfaces, and less visual clutter.
              </p>
            </div>
            <div className="card hidden p-4 md:block">
              <LayoutTemplate className="mb-3 h-5 w-5 text-blue-500" />
              <p className="text-sm font-semibold text-slate-900">Premium first impression</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Clearer forms, calmer spacing, sharper trust cues.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Shop Name</label>
                <input {...register('shopName')} placeholder="Med Plus Pharmacy" className="input" />
                {errors.shopName && <p className="mt-1 text-xs text-rose-500">{errors.shopName.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Shop Type</label>
                <select {...register('shopType')} className="input">
                  {SHOP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">State</label>
                <select {...register('state')} className="input">
                  <option value="">Select state</option>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.state && <p className="mt-1 text-xs text-rose-500">{errors.state.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">Owner Name</label>
                <input {...register('ownerName')} placeholder="Rajesh Kumar" className="input" />
                {errors.ownerName && <p className="mt-1 text-xs text-rose-500">{errors.ownerName.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <input {...register('email')} type="email" className="input" />
                {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Mobile</label>
                <input {...register('phone')} placeholder="9876543210" className="input" />
                {errors.phone && <p className="mt-1 text-xs text-rose-500">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input {...register('password')} type="password" className="input" />
                {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  GST Number <span className="text-slate-400">(optional)</span>
                </label>
                <input {...register('gstNumber')} placeholder="22AAAAA0000A1Z5" className="input" />
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary mt-2 w-full py-3">
              {isSubmitting ? 'Creating your shop…' : 'Start Free Trial'}
              {!isSubmitting && <ChevronRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-slate-900">Sign in</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
