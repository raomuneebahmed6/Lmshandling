import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Medicines & Products" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border-c bg-surface sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-9 h-9 rounded-lg bg-primary text-primary-ink flex items-center justify-center font-display font-bold text-sm">
            EB
          </span>
          <span className="font-display font-semibold text-lg text-ink leading-none">
            Ebsons
          </span>
        </Link>
        <nav className="hidden sm:flex items-center gap-7 text-sm font-medium text-ink-soft">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <a
          href="https://wa.me/923002022020"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold bg-accent text-accent-ink px-4 py-2 rounded-full hover:opacity-90 transition shrink-0"
        >
          WhatsApp us
        </a>
      </div>
    </header>
  );
}
