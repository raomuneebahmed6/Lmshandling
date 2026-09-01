import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Panel, PageHeader } from "@/components/admin/ui";
import { createEvent, deleteEvent } from "@/lib/actions/calendar-actions";

export const dynamic = "force-dynamic";

const typeStyle: Record<string, string> = {
  SHIFT: "bg-primary-soft text-primary",
  RESTOCK: "bg-accent text-accent-ink",
  EXPIRY: "bg-critical-bg text-critical",
  OTHER: "bg-surface-2 text-ink-soft",
};

const typeLabel: Record<string, string> = {
  SHIFT: "Shift",
  RESTOCK: "Delivery",
  EXPIRY: "Expiry",
  OTHER: "Other",
};

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function CalendarPage({
  searchParams,
}: PageProps<"/admin/calendar">) {
  const params = await searchParams;
  const now = new Date();
  const monthParam = typeof params.month === "string" ? params.month : null;
  const [year, month] = monthParam
    ? monthParam.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const prevMonth = new Date(year, month - 2, 1);
  const nextMonth = new Date(year, month, 1);

  const [events, staff] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      include: { staff: true },
      orderBy: { date: "asc" },
    }),
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const eventsByDay = new Map<number, typeof events>();
  for (const e of events) {
    const day = e.date.getDate();
    eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), e]);
  }

  const firstDow = monthStart.getDay();
  const totalDays = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const fmt = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;

  return (
    <>
      <PageHeader
        kicker={`${monthNames[month - 1]} ${year}`}
        title="Shifts & deliveries"
        action={
          <div className="flex gap-2">
            <Link
              href={`/admin/calendar?month=${fmt(prevMonth)}`}
              className="rounded-full border border-border-c px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
            >
              ◂ {monthNames[prevMonth.getMonth()].slice(0, 3)}
            </Link>
            <Link
              href={`/admin/calendar?month=${fmt(nextMonth)}`}
              className="rounded-full border border-border-c px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
            >
              {monthNames[nextMonth.getMonth()].slice(0, 3)} ▸
            </Link>
          </div>
        }
      />

      <Panel title="Add event">
        <form action={createEvent} className="grid gap-3 sm:grid-cols-5 items-end">
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2"
          />
          <select
            name="type"
            defaultValue="SHIFT"
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="SHIFT">Staff shift</option>
            <option value="RESTOCK">Supplier delivery</option>
            <option value="EXPIRY">Batch expiry</option>
            <option value="OTHER">Other</option>
          </select>
          <input
            name="date"
            type="date"
            required
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="staffId"
            defaultValue=""
            className="rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">No staff linked</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-primary text-primary-ink text-sm font-semibold px-4 py-2 hover:opacity-90 sm:col-span-5 sm:w-fit"
          >
            + Add event
          </button>
        </form>
      </Panel>

      <Panel>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wide text-ink-faint mb-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const dayEvents = eventsByDay.get(day) ?? [];
            const isToday = isCurrentMonth && day === now.getDate();
            return (
              <div
                key={day}
                className={`border rounded-lg p-1.5 min-h-[84px] flex flex-col gap-1 ${
                  isToday ? "border-accent ring-1 ring-accent" : "border-border-c"
                }`}
              >
                <div className="text-xs font-semibold text-ink-soft">{day}</div>
                {dayEvents.map((e) => (
                  <form key={e.id} action={deleteEvent}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      title={`${e.title}${e.staff ? " · " + e.staff.name : ""} (click to remove)`}
                      className={`w-full text-left text-[10px] font-semibold px-1.5 py-0.5 rounded truncate ${typeStyle[e.type]}`}
                    >
                      {typeLabel[e.type]}: {e.title}
                    </button>
                  </form>
                ))}
              </div>
            );
          })}
        </div>

        <div className="flex gap-5 mt-4 text-xs text-ink-soft flex-wrap">
          <span className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm bg-primary-soft border border-primary inline-block" />
            Staff shift
          </span>
          <span className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" />
            Supplier delivery
          </span>
          <span className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm bg-critical-bg border border-critical inline-block" />
            Batch expiry
          </span>
        </div>
      </Panel>
    </>
  );
}
