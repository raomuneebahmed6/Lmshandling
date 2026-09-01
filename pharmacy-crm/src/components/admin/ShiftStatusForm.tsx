"use client";

import { useRef } from "react";
import { setShiftStatus } from "@/lib/actions/staff-actions";

export function ShiftStatusForm({
  staffId,
  value,
}: {
  staffId: string;
  value: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setShiftStatus} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={staffId} />
      <select
        name="shiftStatus"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-border-c bg-surface-2 text-xs px-2 py-1"
      >
        <option value="ON_DUTY">On duty</option>
        <option value="UPCOMING">Upcoming</option>
        <option value="ON_LEAVE">On leave</option>
      </select>
    </form>
  );
}
