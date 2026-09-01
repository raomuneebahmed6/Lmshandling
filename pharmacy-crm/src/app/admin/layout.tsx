import { auth, signOut } from "@/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex flex-col gap-6 border-r border-border-c bg-surface p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2">
          <span className="w-9 h-9 rounded-lg bg-primary text-primary-ink flex items-center justify-center font-display font-bold text-sm">
            EB
          </span>
          <div className="leading-tight">
            <div className="font-display font-semibold text-sm text-ink">
              Ebsons
            </div>
            <div className="text-[11px] text-ink-faint">Command Center</div>
          </div>
        </div>

        <AdminNav />

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-auto border-t border-border-c pt-3"
        >
          <div className="px-2 mb-2">
            <div className="text-sm font-semibold text-ink">
              {session?.user?.name}
            </div>
            <div className="text-[11px] text-ink-faint uppercase tracking-wide">
              {session?.user?.role}
            </div>
          </div>
          <button
            type="submit"
            className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </aside>

      <main className="p-5 sm:p-8 max-w-6xl w-full">{children}</main>
    </div>
  );
}
