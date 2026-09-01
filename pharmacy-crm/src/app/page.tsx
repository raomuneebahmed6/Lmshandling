import Link from "next/link";
import { SiteHeader } from "@/components/public/SiteHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const categories = [
  { name: "Medicines", blurb: "Full A–Z range, genuine and in stock" },
  { name: "Medical devices", blurb: "BP monitors, glucometers, nebulizers" },
  { name: "Multivitamins", blurb: "For every age and need" },
  { name: "Mother & baby care", blurb: "Trusted essentials" },
  { name: "Personal care", blurb: "Skin, hair and wellness" },
  { name: "Cosmetics", blurb: "Body n Body and more" },
];

export default async function HomePage() {
  const featured = await prisma.product.findMany({
    take: 6,
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border-c bg-surface">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20 grid gap-10 sm:grid-cols-2 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">
                Okara&apos;s trusted pharmacy
              </p>
              <h1 className="font-display font-semibold text-4xl sm:text-5xl text-ink leading-tight text-balance">
                Genuine medicines, delivered with care.
              </h1>
              <p className="mt-4 text-ink-soft text-base leading-relaxed max-w-md">
                Ellah Baksh &amp; Sons has served Okara for decades with
                authentic medicines, medical equipment and wellness products
                — in store and on WhatsApp.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/products"
                  className="bg-primary text-primary-ink font-semibold text-sm px-5 py-2.5 rounded-full hover:opacity-90 transition"
                >
                  Browse medicines
                </Link>
                <a
                  href="https://wa.me/923002022020"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border-c text-ink font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-surface-2 transition"
                >
                  Order on WhatsApp
                </a>
              </div>
            </div>
            <div className="rounded-2xl bg-primary-soft border border-border-c p-8">
              <dl className="grid grid-cols-2 gap-6">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-faint mb-1">
                    Years serving Okara
                  </dt>
                  <dd className="font-display text-3xl font-semibold text-primary">
                    30+
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-faint mb-1">
                    Free delivery
                  </dt>
                  <dd className="font-display text-3xl font-semibold text-primary">
                    First 5 orders
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-faint mb-1">
                    Brands stocked
                  </dt>
                  <dd className="font-display text-3xl font-semibold text-primary">
                    50+
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-faint mb-1">
                    Order support
                  </dt>
                  <dd className="font-display text-3xl font-semibold text-primary">
                    WhatsApp
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
          <h2 className="font-display font-semibold text-2xl text-ink mb-8">
            Shop by category
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.name}
                href="/products"
                className="rounded-xl border border-border-c bg-surface p-5 hover:border-accent transition"
              >
                <div className="font-semibold text-ink">{c.name}</div>
                <div className="text-sm text-ink-soft mt-1">{c.blurb}</div>
              </Link>
            ))}
          </div>
        </section>

        {featured.length > 0 && (
          <section className="bg-surface-2/60 border-y border-border-c">
            <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
              <h2 className="font-display font-semibold text-2xl text-ink mb-8">
                Recently added
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border-c bg-surface p-5"
                  >
                    <div className="text-xs uppercase tracking-wide text-ink-faint mb-1">
                      {p.category}
                    </div>
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="mt-2 font-data tabular text-primary font-medium">
                      Rs {Number(p.unitPrice).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 text-center">
          <h2 className="font-display font-semibold text-2xl text-ink mb-3">
            Can&apos;t find what you need?
          </h2>
          <p className="text-ink-soft mb-6 max-w-md mx-auto">
            Message us on WhatsApp — we&apos;ll confirm availability and
            price, even for items not listed online.
          </p>
          <a
            href="https://wa.me/923002022020"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-accent text-accent-ink font-semibold text-sm px-6 py-3 rounded-full hover:opacity-90 transition"
          >
            Chat with us
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
