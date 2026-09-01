import { prisma } from "@/lib/prisma";
import { Panel, PageHeader } from "@/components/admin/ui";
import { OrderStatusForm } from "@/components/admin/OrderStatusForm";
import { recordOrder } from "@/lib/actions/order-actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, customers, products] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { customer: true, items: { include: { product: true } } },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader kicker="In-store + website" title="Orders" />

      <Panel title="Record a sale">
        <form action={recordOrder} className="grid gap-3 sm:grid-cols-5 items-end">
          <select
            name="customerId"
            defaultValue=""
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">Walk-in customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="productId"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2"
          >
            <option value="" disabled defaultChecked>
              Select product
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — Rs {Number(p.unitPrice).toLocaleString()}
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min="1"
            defaultValue="1"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="source"
            defaultValue="IN_STORE"
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="IN_STORE">In-store</option>
            <option value="WEBSITE">Website</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-primary text-primary-ink text-sm font-semibold px-4 py-2 hover:opacity-90 sm:col-span-5 sm:w-fit"
          >
            + Record sale
          </button>
        </form>
      </Panel>

      <Panel>
        {orders.length === 0 && (
          <p className="text-sm text-ink-faint">No orders yet.</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-border-c">
                <th className="pb-2 font-semibold">Order</th>
                <th className="pb-2 font-semibold">Source</th>
                <th className="pb-2 font-semibold">Customer</th>
                <th className="pb-2 font-semibold">Items</th>
                <th className="pb-2 font-semibold">Total</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border-c last:border-0">
                  <td className="py-2.5 font-data font-semibold text-ink">
                    #{o.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="py-2.5 text-ink-soft">
                    {o.source === "IN_STORE" ? "In-store" : "ebsons.com.pk"}
                  </td>
                  <td className="py-2.5">{o.customer?.name ?? "Walk-in"}</td>
                  <td className="py-2.5 font-data tabular">
                    {o.items.reduce((n, i) => n + i.quantity, 0)}
                  </td>
                  <td className="py-2.5 font-data tabular">
                    Rs {Number(o.total).toLocaleString()}
                  </td>
                  <td className="py-2.5">
                    <OrderStatusForm orderId={o.id} value={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
