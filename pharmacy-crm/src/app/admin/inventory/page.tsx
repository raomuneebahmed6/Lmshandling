import { prisma } from "@/lib/prisma";
import { computeBatchStatus } from "@/lib/stock";
import { Panel, Chip, PageHeader } from "@/components/admin/ui";
import {
  createProduct,
  deleteProduct,
  addBatch,
  deleteBatch,
  adjustBatchQuantity,
} from "@/lib/actions/inventory-actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: PageProps<"/admin/inventory">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.toLowerCase() : "";

  const products = await prisma.product.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { batches: { orderBy: { expiresOn: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        kicker={`${products.length} products`}
        title="Inventory & stock"
      />

      <Panel title="Add a product">
        <form action={createProduct} className="grid gap-3 sm:grid-cols-4">
          <input
            name="name"
            placeholder="Product name"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2"
          />
          <input
            name="category"
            placeholder="Category"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="unitPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="Unit price (Rs)"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="reorderAt"
            type="number"
            min="0"
            placeholder="Reorder at (qty)"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary text-primary-ink text-sm font-semibold px-4 py-2 hover:opacity-90 sm:col-span-4 sm:w-fit"
          >
            + Add product
          </button>
        </form>
      </Panel>

      <Panel>
        <form className="mb-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search products or category…"
            className="w-full sm:max-w-xs rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </form>

        <div className="space-y-6">
          {products.length === 0 && (
            <p className="text-sm text-ink-faint">No products found.</p>
          )}
          {products.map((p) => (
            <div
              key={p.id}
              className="border border-border-c rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="font-semibold text-ink">{p.name}</div>
                  <div className="text-xs text-ink-faint mt-0.5">
                    {p.category} · Rs {Number(p.unitPrice).toLocaleString()} ·
                    reorder at {p.reorderAt}
                  </div>
                </div>
                <form action={deleteProduct}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="text-xs font-semibold text-critical hover:underline"
                  >
                    Delete product
                  </button>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-border-c">
                      <th className="pb-2 font-semibold">Batch</th>
                      <th className="pb-2 font-semibold">Expiry</th>
                      <th className="pb-2 font-semibold">Qty</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.batches.map((b) => {
                      const status = computeBatchStatus(
                        b.quantity,
                        p.reorderAt,
                        b.expiresOn,
                      );
                      return (
                        <tr key={b.id} className="border-b border-border-c last:border-0">
                          <td className="py-2 font-data">{b.batchCode}</td>
                          <td className="py-2 font-data tabular">
                            {b.expiresOn
                              ? b.expiresOn.toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="py-2 font-data tabular">
                            {b.quantity}
                          </td>
                          <td className="py-2">
                            <Chip tone={status}>
                              {status === "good"
                                ? "In stock"
                                : status === "warn"
                                  ? "Low"
                                  : "Act now"}
                            </Chip>
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2 justify-end">
                              <form action={adjustBatchQuantity}>
                                <input type="hidden" name="id" value={b.id} />
                                <input type="hidden" name="delta" value="-1" />
                                <button
                                  type="submit"
                                  className="w-6 h-6 rounded border border-border-c text-ink-soft hover:bg-surface-2"
                                  aria-label="Decrease quantity"
                                >
                                  −
                                </button>
                              </form>
                              <form action={adjustBatchQuantity}>
                                <input type="hidden" name="id" value={b.id} />
                                <input type="hidden" name="delta" value="1" />
                                <button
                                  type="submit"
                                  className="w-6 h-6 rounded border border-border-c text-ink-soft hover:bg-surface-2"
                                  aria-label="Increase quantity"
                                >
                                  +
                                </button>
                              </form>
                              <form action={deleteBatch}>
                                <input type="hidden" name="id" value={b.id} />
                                <button
                                  type="submit"
                                  className="text-xs font-semibold text-critical hover:underline"
                                >
                                  Remove
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <form
                action={addBatch}
                className="mt-3 grid gap-2 sm:grid-cols-4 items-end"
              >
                <input type="hidden" name="productId" value={p.id} />
                <input
                  name="batchCode"
                  placeholder="Batch code"
                  required
                  className="rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  placeholder="Quantity"
                  required
                  className="rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <input
                  name="expiresOn"
                  type="date"
                  className="rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-border-c text-sm font-semibold px-3 py-1.5 hover:bg-surface-2"
                >
                  + Add batch
                </button>
              </form>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
