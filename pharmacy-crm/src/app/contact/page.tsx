import { SiteHeader } from "@/components/public/SiteHeader";
import { SiteFooter } from "@/components/public/SiteFooter";

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-16">
          <h1 className="font-display font-semibold text-3xl text-ink mb-2">
            Get in touch
          </h1>
          <p className="text-ink-soft mb-10">
            Questions about a medicine, an order, or delivery — reach us
            however is easiest.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="https://wa.me/923002022020"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-border-c bg-surface p-6 hover:border-accent transition"
            >
              <div className="font-semibold text-ink mb-1">WhatsApp</div>
              <div className="text-ink-soft text-sm">+92 300 2022020</div>
            </a>
            <a
              href="mailto:ebsons@ebsons.com.pk"
              className="rounded-xl border border-border-c bg-surface p-6 hover:border-accent transition"
            >
              <div className="font-semibold text-ink mb-1">Email</div>
              <div className="text-ink-soft text-sm">ebsons@ebsons.com.pk</div>
            </a>
            <div className="rounded-xl border border-border-c bg-surface p-6 sm:col-span-2">
              <div className="font-semibold text-ink mb-1">Visit the store</div>
              <div className="text-ink-soft text-sm">
                Tehsil Rd, Block-D, Okara, 56300, Pakistan
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
