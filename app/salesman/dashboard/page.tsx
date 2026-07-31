import Link from 'next/link';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default async function SalesmanDashboardPage() {
  const user = await requireUser();
  const supabase = createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [{ data: routes }, { count: visitsToday }, { count: ordersToday }] = await Promise.all([
    supabase.from('routes').select('id').eq('salesman_id', user.id).eq('is_active', true),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('salesman_id', user.id)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('collected_by', user.id)
      .gte('placed_at', todayStart.toISOString())
      .lte('placed_at', todayEnd.toISOString()),
  ]);

  const hasRoute = (routes ?? []).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Today</h1>
        <p className="mt-1 text-sm text-ink-500">Your route and visit summary.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-sm text-ink-500">Visits Today</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{visitsToday ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-500">Orders Collected</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{ordersToday ?? 0}</p>
        </Card>
      </div>

      {!hasRoute ? (
        <Card>
          <CardHeader>
            <CardTitle>No route assigned yet</CardTitle>
          </CardHeader>
          <p className="text-sm text-ink-500">
            Your admin will assign a route and retailer beat plan — it will appear here once set up.
          </p>
        </Card>
      ) : null}

      <Link href="/salesman/dcr">
        <Card className="flex items-center gap-3 p-4">
          <FileText className="h-5 w-5 text-primary-600" />
          <div>
            <p className="text-sm font-medium text-ink-900">Daily Call Report</p>
            <p className="text-xs text-ink-400">Review your attendance, visits, and collections by date</p>
          </div>
        </Card>
      </Link>
    </div>
  );
}
