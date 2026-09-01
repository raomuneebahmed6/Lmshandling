export function SiteFooter() {
  return (
    <footer className="border-t border-border-c bg-surface mt-auto">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 grid gap-8 sm:grid-cols-3 text-sm text-ink-soft">
        <div>
          <div className="font-display font-semibold text-ink text-base mb-2">
            Ellah Baksh &amp; Sons
          </div>
          <p className="leading-relaxed">
            Genuine medicines, medical equipment and wellness products,
            serving Okara for decades.
          </p>
        </div>
        <div>
          <div className="font-semibold text-ink mb-2">Visit us</div>
          <p className="leading-relaxed">
            Tehsil Rd, Block-D
            <br />
            Okara, 56300, Pakistan
          </p>
        </div>
        <div>
          <div className="font-semibold text-ink mb-2">Get in touch</div>
          <p className="leading-relaxed">
            WhatsApp: +92 300 2022020
            <br />
            Email: ebsons@ebsons.com.pk
          </p>
        </div>
      </div>
      <div className="border-t border-border-c py-4 text-center text-xs text-ink-faint">
        © {new Date().getFullYear()} Ellah Baksh &amp; Sons Pharmacy. All rights reserved.
      </div>
    </footer>
  );
}
