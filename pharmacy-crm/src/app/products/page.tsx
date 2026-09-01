import { SiteHeader } from "@/components/public/SiteHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { batches: true },
  });

  const byCategory = products.reduce<Record<string, typeof products>>(
    (acc, p) => {
      (acc[p.category] ??= []).push(p);
      return acc;
    },
    {},
  );

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12">
          <h1 className="font-display font-semibold text-3xl text-ink mb-2">
            Medicines &amp; products
          </h1>
          <p className="text-ink-soft mb-10 max-w-lg">
            Availability updates as our pharmacists restock. Not sure if we
            carry something? Ask us on WhatsApp.
          </p>

          {Object.keys(byCategory).length === 0 && (
            <p className="text-ink-soft">
              Catalog is being set up — check back soon.
            </p>
          )}

          <div className="space-y-12">
            {Object.entries(byCategory).map(([category, items]) => (
              <section key={category}>
                <h2 className="font-display font-semibold text-xl text-ink mb-4">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => {
                    const inStock = p.batches.some((b) => b.quantity > 0);
                    return (
                      <div
                        key={p.id}
                        className="rounded-xl border border-border-c bg-surface p-5 flex flex-col"
                      >
                        <div className="font-semibold text-ink">{p.name}</div>
                        <div className="mt-2 font-data tabular text-primary font-medium">
                          Rs {Number(p.unitPrice).toLocaleString()}
                        </div>
                        <span
                          className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            inStock
                              ? "bg-good-bg text-good"
                              : "bg-critical-bg text-critical"
                          }`}
                        >
                          {inStock ? "In stock" : "Ask availability"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
