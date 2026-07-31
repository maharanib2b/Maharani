import Link from 'next/link';
import { Search, PackageSearch } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/retailer/product-card';
import { getBatchedPriceOverrides } from '@/lib/retailer/effective-price';

const PAGE_SIZE = 24;

interface Option {
  id: string;
  name: string;
}

interface ProductListRow {
  id: string;
  name: string;
  sku_code: string;
  is_new_launch: boolean;
  brands: { name: string } | null;
  categories: { name: string } | null;
  product_images: { image_url: string }[];
  product_packs: { id: string; base_price: number; ptr: number | null; mrp: number | null }[];
}

export default async function RetailerCatalogPage({
  searchParams,
}: {
  searchParams: { q?: string; brand?: string; category?: string; availability?: string; page?: string };
}) {
  const user = await requireUser();
  const supabase = createClient();

  const { data: retailer } = await supabase
    .from('retailers')
    .select('area_id')
    .eq('id', user.id)
    .maybeSingle<{ area_id: string }>();

  const q = searchParams.q?.trim() ?? '';
  const brandFilter = searchParams.brand ?? '';
  const categoryFilter = searchParams.category ?? '';
  // "Availability" is scoped to whether the product is currently orderable
  // (is_active) — true per-warehouse stock availability depends on a
  // retailer→warehouse mapping that doesn't exist yet in this schema.
  const availabilityFilter = searchParams.availability ?? '';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('products')
    .select(
      'id, name, sku_code, is_new_launch, brands ( name ), categories ( name ), product_images ( image_url ), product_packs ( id, base_price, ptr, mrp )',
      { count: 'exact' }
    )
    .eq('is_active', true)
    .order('name')
    .range(from, to);

  if (q) query = query.or(`name.ilike.%${q}%,sku_code.ilike.%${q}%`);
  if (brandFilter) query = query.eq('brand_id', brandFilter);
  if (categoryFilter) query = query.eq('category_id', categoryFilter);
  if (availabilityFilter === 'unavailable') query = query.eq('is_active', false); // effectively empty — kept explicit, not hidden

  const [{ data, count }, { data: brandOptions }, { data: categoryOptions }] = await Promise.all([
    query,
    supabase.from('brands').select('id, name').eq('is_active', true).order('name'),
    supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
  ]);

  const products = (data ?? []) as unknown as ProductListRow[];
  const brands = (brandOptions ?? []) as Option[];
  const categories = (categoryOptions ?? []) as Option[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Batched price-override lookup — ONE query for the whole page of
  // products, not one per product. See lib/retailer/effective-price.ts
  // for the single-product version used on the detail page and the
  // shared batched version used here, on cart, and on checkout.
  //
  // RLS on price_lists already restricts 'retailer' rows to ones
  // belonging to this retailer, and 'area' rows to this retailer's
  // own area — so every row returned here already applies to us.
  const productIds = products.map((p) => p.id);
  const overrideByProduct = await getBatchedPriceOverrides(supabase, productIds);

  const hasFilters = q || brandFilter || categoryFilter || availabilityFilter;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-950">Catalog</h1>
        <p className="mt-1 text-sm text-ink-500">Browse and order products for your shop.</p>
      </div>

      <form method="get" className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input name="q" defaultValue={q} placeholder="Search products…" className="pl-9" />
        </div>
        <Select name="brand" defaultValue={brandFilter}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select name="category" defaultValue={categoryFilter}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
          {hasFilters ? (
            <Link href="/retailer/catalog">
              <Button type="button" size="sm" variant="ghost">
                Clear
              </Button>
            </Link>
          ) : null}
        </div>
      </form>

      {products.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <PackageSearch className="h-8 w-8 text-ink-300" />
          <p className="font-medium text-ink-700">
            {hasFilters ? 'No products match your search' : 'Catalog coming soon'}
          </p>
          <p className="text-sm text-ink-400">
            {hasFilters
              ? 'Try a different search term or clear the filters above.'
              : 'Your distributor is setting up the product catalog. Check back shortly.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                id={p.id}
                name={p.name}
                brandName={p.brands?.name}
                imageUrl={p.product_images[0]?.image_url}
                isNewLaunch={p.is_new_launch}
                fromPrice={cheapestPackPrice(p.product_packs, overrideByProduct.get(p.id) ?? null)}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              {page > 1 ? (
                <Link href={buildPageHref(searchParams, page - 1)}>
                  <Button size="sm" variant="outline">
                    Previous
                  </Button>
                </Link>
              ) : null}
              <span className="text-xs text-ink-400">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={buildPageHref(searchParams, page + 1)}>
                  <Button size="sm" variant="outline">
                    Next
                  </Button>
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function cheapestPackPrice(
  packs: { base_price: number; ptr: number | null }[],
  override: number | null
): number | null {
  if (packs.length === 0) return null;
  if (override !== null) return override;
  const prices = packs.map((p) => p.ptr ?? p.base_price);
  return Math.min(...prices);
}

function buildPageHref(
  searchParams: { q?: string; brand?: string; category?: string; availability?: string },
  page: number
): string {
  const params = new URLSearchParams();
  if (searchParams.q) params.set('q', searchParams.q);
  if (searchParams.brand) params.set('brand', searchParams.brand);
  if (searchParams.category) params.set('category', searchParams.category);
  if (searchParams.availability) params.set('availability', searchParams.availability);
  params.set('page', String(page));
  return `/retailer/catalog?${params.toString()}`;
}
