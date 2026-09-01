import { prisma } from "@/lib/prisma";
import { Panel, PageHeader } from "@/components/admin/ui";
import { createCustomer, deleteCustomer } from "@/lib/actions/customer-actions";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      orders: { orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <>
      <PageHeader kicker="CRM" title="Customers" />

      <Panel title="Add customer">
        <form action={createCustomer} className="grid gap-3 sm:grid-cols-3">
          <input
            name="name"
            placeholder="Full name"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="phone"
            placeholder="Phone number"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="notes"
            placeholder="Notes (optional)"
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary text-primary-ink text-sm font-semibold px-4 py-2 hover:opacity-90 sm:col-span-3 sm:w-fit"
          >
            + Add customer
          </button>
        </form>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-border-c">
                <th className="pb-2 font-semibold">Customer</th>
                <th className="pb-2 font-semibold">Phone</th>
                <th className="pb-2 font-semibold">Orders</th>
                <th className="pb-2 font-semibold">Lifetime spend</th>
                <th className="pb-2 font-semibold">Last visit</th>
                <th className="pb-2 font-semibold">Notes</th>
                <th className="pb-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const spend = c.orders.reduce(
                  (sum, o) => sum + Number(o.total),
                  0,
                );
                return (
                  <tr key={c.id} className="border-b border-border-c last:border-0">
                    <td className="py-2.5 font-semibold text-ink">{c.name}</td>
                    <td className="py-2.5 font-data text-ink-soft">{c.phone}</td>
                    <td className="py-2.5 font-data tabular">{c.orders.length}</td>
                    <td className="py-2.5 font-data tabular">
                      Rs {spend.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-ink-soft">
                      {c.orders[0]?.createdAt.toLocaleDateString() ?? "—"}
                    </td>
                    <td className="py-2.5 text-ink-soft max-w-[220px] truncate">
                      {c.notes || "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <form action={deleteCustomer}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="text-xs font-semibold text-critical hover:underline"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
