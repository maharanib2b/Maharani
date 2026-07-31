import Link from 'next/link';
import { ClipboardList, Clock, TrendingUp, Wallet, PackageSearch } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

interface RecentProductRow {
  products: { id: string; name: string } | null;
}

export default async function RetailerHomePage() {
  const user = await requireUser();
  const supabase = createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    { count: totalOrders },
    { count: pendingOrders },
    { data: monthlyOrders },
    { data: retailer },
    { data: recentItems },
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('retailer_id', user.id),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('retailer_id', user.id)
      .in('status', ['pending', 'confirmed', 'processing']),
    supabase
      .from('orders')
      .select('grand_total')
      .eq('retailer_id', user.id)
      .gte('placed_at', startOfMonth.toISOString())
      .returns<{ grand_total: number }[]>(),
    supabase.from('retailers').select('outstanding_balance').eq('id', user.id).maybeSingle<{ outstanding_balance: number }>(),
    supabase
      .from('order_items')
      .select('products ( id, name ), orders!inner ( retailer_id, placed_at )')
      .eq('orders.retailer_id', user.id)
      .order('id', { ascending: false })
      .limit(30)
      .returns<RecentProductRow[]>(),
  ]);

  const monthlyPurchase = (monthlyOrders ?? []).reduce((sum, o) => sum + o.grand_total, 0);

  // De-duplicate to the 5 most recently ordered distinct products.
  const seen = new Set<string>();
  const recentProducts: { id: string; name: string }[] = [];
  for (const row of recentItems ?? []) {
    if (row.products && !seen.has(row.products.id)) {
      seen.add(row.products.id);
      recentProducts.push(row.products);
      if (recentProducts.length >= 5) break;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Welcome</h1>
        <p className="mt-1 text-sm text-ink-500">Here&apos;s how your account looks today.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={ClipboardList} label="Total Orders" value={totalOrders ?? 0} />
        <StatCard icon={Clock} label="Pending Orders" value={pendingOrders ?? 0} accent={(pendingOrders ?? 0) > 0} />
        <StatCard icon={TrendingUp} label="This Month" value={`₹${monthlyPurchase.toFixed(0)}`} />
        <StatCard
          icon={Wallet}
          label="Outstanding"
          value={`₹${(retailer?.outstanding_balance ?? 0).toFixed(0)}`}
          accent={(retailer?.outstanding_balance ?? 0) > 0}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-primary-600" />
          <h2 className="text-sm font-semibold text-ink-800">Recently Ordered</h2>
        </div>
        {recentProducts.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-500">
              Products you've ordered before will show up here for quick reordering.
            </p>
          </Card>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentProducts.map((p) => (
              <Link key={p.id} href={`/retailer/catalog/${p.id}`}>
                <span className="inline-block whitespace-nowrap rounded-xl border border-ink-100 bg-white px-3.5 py-2 text-sm font-medium text-ink-700 hover:border-primary-300 hover:text-primary-600">
                  {p.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Browse the catalog</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-ink-500">Find products, check pricing, and place your order.</p>
        <Link href="/retailer/catalog" className="text-sm font-medium text-primary-600 hover:text-primary-700">
          Go to catalog →
        </Link>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50">
        <Icon className="h-4 w-4 text-primary-600" />
      </div>
      <p className={`text-lg font-semibold ${accent ? 'text-primary-600' : 'text-ink-950'}`}>{value}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </Card>
  );
}
