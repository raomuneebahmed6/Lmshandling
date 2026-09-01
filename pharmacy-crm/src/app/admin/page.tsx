import { prisma } from "@/lib/prisma";
import { computeBatchStatus, daysUntil } from "@/lib/stock";
import { Panel, Kpi, Chip, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [products, staff, todayOrders] = await Promise.all([
    prisma.product.findMany({ include: { batches: true } }),
    prisma.staff.findMany({ where: { active: true } }),
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);

  const allBatches = products.flatMap((p) =>
    p.batches.map((b) => ({
      ...b,
      productName: p.name,
      reorderAt: p.reorderAt,
      computedStatus: computeBatchStatus(b.quantity, p.reorderAt, b.expiresOn),
    })),
  );

  const lowStockCount = allBatches.filter(
    (b) => b.computedStatus === "warn" || b.computedStatus === "critical",
  ).length;

  const expiringSoon = allBatches
    .filter((b) => b.expiresOn && daysUntil(b.expiresOn) <= 60)
    .sort(
      (a, b) => (a.expiresOn?.getTime() ?? 0) - (b.expiresOn?.getTime() ?? 0),
    )
    .slice(0, 6);

  const onDuty = staff.filter((s) => s.shiftStatus === "ON_DUTY").length;

  const todaySales = todayOrders.reduce(
    (sum, o) => sum + Number(o.total),
    0,
  );

  return (
    <>
      <PageHeader kicker="Overview" title="Dashboard" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-2">
        <Kpi
          label="Today's sales"
          value={`Rs ${todaySales.toLocaleString()}`}
          sub={`${todayOrders.length} orders today`}
        />
        <Kpi
          label="Items low / critical"
          value={String(lowStockCount)}
          tone={lowStockCount > 0 ? "down" : "up"}
          sub={lowStockCount > 0 ? "Needs review" : "All healthy"}
        />
        <Kpi
          label="Expiring within 60 days"
          value={String(expiringSoon.length)}
          tone={expiringSoon.length > 0 ? "down" : "up"}
          sub="Batches to review"
        />
        <Kpi
          label="Staff on duty"
          value={`${onDuty} / ${staff.length}`}
          sub="Active team members"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Needs attention" hint="Low stock & expiring batches">
          {allBatches.filter((b) => b.computedStatus !== "good").length ===
            0 && <p className="text-sm text-ink-faint">Nothing urgent right now.</p>}
          <ul className="divide-y divide-border-c">
            {allBatches
              .filter((b) => b.computedStatus !== "good")
              .slice(0, 6)
              .map((b) => (
                <li key={b.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      {b.productName}
                    </div>
                    <div className="text-xs text-ink-faint mt-0.5">
                      Batch {b.batchCode} · {b.quantity} left
                      {b.expiresOn &&
                        ` · expires ${b.expiresOn.toLocaleDateString()}`}
                    </div>
                  </div>
                  <Chip tone={b.computedStatus}>
                    {b.computedStatus === "critical" ? "Act now" : "Low"}
                  </Chip>
                </li>
              ))}
          </ul>
        </Panel>

        <Panel title="Batches expiring soon" hint="Sorted by nearest date">
          {expiringSoon.length === 0 && (
            <p className="text-sm text-ink-faint">No batches expiring soon.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-border-c">
                  <th className="pb-2 font-semibold">Product</th>
                  <th className="pb-2 font-semibold">Batch</th>
                  <th className="pb-2 font-semibold">Expiry</th>
                  <th className="pb-2 font-semibold">Qty</th>
                </tr>
              </thead>
              <tbody>
                {expiringSoon.map((b) => (
                  <tr key={b.id} className="border-b border-border-c last:border-0">
                    <td className="py-2 font-medium text-ink">
                      {b.productName}
                    </td>
                    <td className="py-2 font-data text-ink-faint">
                      {b.batchCode}
                    </td>
                    <td className="py-2 font-data tabular">
                      {b.expiresOn?.toLocaleDateString()}
                    </td>
                    <td className="py-2 font-data tabular">{b.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
