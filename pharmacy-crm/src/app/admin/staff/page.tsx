import { prisma } from "@/lib/prisma";
import { Panel, Chip, PageHeader } from "@/components/admin/ui";
import { ShiftStatusForm } from "@/components/admin/ShiftStatusForm";
import { createStaff, deactivateStaff } from "@/lib/actions/staff-actions";

export const dynamic = "force-dynamic";

const statusChip: Record<
  string,
  { tone: "good" | "warn" | "critical" | "neutral"; label: string }
> = {
  ON_DUTY: { tone: "good", label: "On duty" },
  UPCOMING: { tone: "neutral", label: "Upcoming" },
  ON_LEAVE: { tone: "critical", label: "On leave" },
};

export default async function StaffPage() {
  const staff = await prisma.staff.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader kicker={`${staff.length} team members`} title="Staff" />

      <Panel title="Add staff member">
        <form action={createStaff} className="grid gap-3 sm:grid-cols-3">
          <input
            name="name"
            placeholder="Full name"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="email"
            type="email"
            placeholder="Login email"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="password"
            type="password"
            placeholder="Temporary password"
            required
            minLength={6}
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="role"
            required
            defaultValue="STAFF"
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="OWNER">Owner</option>
            <option value="PHARMACIST">Pharmacist</option>
            <option value="MANAGER">Manager</option>
            <option value="STAFF">Staff</option>
          </select>
          <input
            name="phone"
            placeholder="Phone (optional)"
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="shiftStart"
              type="time"
              className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              name="shiftEnd"
              type="time"
              className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary text-primary-ink text-sm font-semibold px-4 py-2 hover:opacity-90 sm:col-span-3 sm:w-fit"
          >
            + Add staff
          </button>
        </form>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint border-b border-border-c">
                <th className="pb-2 font-semibold">Name</th>
                <th className="pb-2 font-semibold">Role</th>
                <th className="pb-2 font-semibold">Shift</th>
                <th className="pb-2 font-semibold">Contact</th>
                <th className="pb-2 font-semibold">Today</th>
                <th className="pb-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const chip = statusChip[s.shiftStatus];
                return (
                  <tr key={s.id} className="border-b border-border-c last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-primary-soft text-primary text-[11px] font-bold flex items-center justify-center">
                          {s.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span className="font-semibold text-ink">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-ink-soft">{s.role}</td>
                    <td className="py-2.5 font-data text-ink-soft">
                      {s.shiftStart && s.shiftEnd
                        ? `${s.shiftStart} – ${s.shiftEnd}`
                        : "—"}
                    </td>
                    <td className="py-2.5 font-data text-ink-soft">
                      {s.phone || "—"}
                    </td>
                    <td className="py-2.5">
                      <ShiftStatusForm staffId={s.id} value={s.shiftStatus} />
                      <div className="mt-1">
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <form action={deactivateStaff}>
                        <input type="hidden" name="id" value={s.id} />
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
