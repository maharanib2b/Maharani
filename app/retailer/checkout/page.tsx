import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckoutForm } from '@/components/retailer/checkout-form';
import { getBatchedPriceOverrides } from '@/lib/retailer/effective-price';

interface CartItemDetail {
  id: string;
  quantity: number;
  product_id: string;
  product_packs: { pack_name: string; base_price: number; ptr: number | null; is_active: boolean } | null;
  products: { name: string; gst_percent: number; is_active: boolean } | null;
}

export default async function CheckoutPage() {
  const user = await requireUser();
  const supabase = createClient();

  const { data: retailer } = await supabase
    .from('retailers')
    .select('shop_name, address, areas ( name )')
    .eq('id', user.id)
    .maybeSingle<{ shop_name: string; address: string | null; areas: { name: string } | null }>();

  const { data: cartData } = await supabase
    .from('cart_items')
    .select(
      'id, quantity, product_id, product_packs ( pack_name, base_price, ptr, is_active ), products ( name, gst_percent, is_active )'
    )
    .eq('retailer_id', user.id);

  const items = (cartData ?? []) as unknown as CartItemDetail[];

  if (items.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-ink-950">Checkout</h1>
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <ShoppingCart className="h-8 w-8 text-ink-300" />
          <p className="font-medium text-ink-700">Your cart is empty</p>
          <Link href="/retailer/catalog">
            <Button className="mt-2">Browse catalog</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const overrideByProduct = await getBatchedPriceOverrides(supabase, productIds);

  let subtotal = 0;
  let gstTotal = 0;
  const lines = items.map((item) => {
    const pack = item.product_packs;
    const product = item.products;
    const unitPrice = pack ? overrideByProduct.get(item.product_id) ?? pack.ptr ?? pack.base_price : 0;
    const lineSubtotal = unitPrice * item.quantity;
    const gstPercent = product?.gst_percent ?? 0;
    const lineGst = (lineSubtotal * gstPercent) / 100;
    subtotal += lineSubtotal;
    gstTotal += lineGst;

    return {
      id: item.id,
      productName: product?.name ?? 'Unknown product',
      packName: pack?.pack_name ?? '',
      quantity: item.quantity,
      lineTotal: lineSubtotal + lineGst,
      isUnavailable: !pack?.is_active || !product?.is_active,
    };
  });

  const grandTotal = subtotal + gstTotal;
  const canPlaceOrder = lines.every((l) => !l.isUnavailable);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-ink-950">Checkout</h1>

      <Card>
        <CardHeader>
          <CardTitle>Deliver to</CardTitle>
        </CardHeader>
        <p className="text-sm font-medium text-ink-900">{retailer?.shop_name}</p>
        <p className="text-sm text-ink-500">{retailer?.address ?? 'No address on file'}</p>
        {retailer?.areas?.name ? <p className="text-xs text-ink-400">{retailer.areas.name}</p> : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex justify-between text-sm">
              <span className={line.isUnavailable ? 'text-primary-600' : 'text-ink-600'}>
                {line.productName} ({line.packName}) × {line.quantity}
                {line.isUnavailable ? ' — unavailable' : ''}
              </span>
              <span className="font-medium text-ink-900">₹{line.lineTotal.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-ink-100 pt-3">
          <div className="flex justify-between text-sm text-ink-600">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-ink-600">
            <span>GST</span>
            <span>₹{gstTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-ink-950">
            <span>Total</span>
            <span>₹{grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </Card>

      {!canPlaceOrder ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          Some items in your cart are no longer available. Please go back to your cart and remove them before
          placing this order.
        </div>
      ) : (
        <CheckoutForm />
      )}
    </div>
  );
}
