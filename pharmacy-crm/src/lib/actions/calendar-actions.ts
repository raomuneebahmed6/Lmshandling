"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const eventSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["SHIFT", "RESTOCK", "EXPIRY", "OTHER"]),
  date: z.coerce.date(),
  staffId: z.string().optional(),
  notes: z.string().optional(),
});

export async function createEvent(formData: FormData) {
  const staffId = formData.get("staffId");
  const data = eventSchema.parse({
    title: formData.get("title"),
    type: formData.get("type"),
    date: formData.get("date"),
    staffId: staffId ? String(staffId) : undefined,
    notes: formData.get("notes") || undefined,
  });

  await prisma.calendarEvent.create({
    data: {
      title: data.title,
      type: data.type,
      date: data.date,
      staffId: data.staffId || null,
      notes: data.notes,
    },
  });
  revalidatePath("/admin/calendar");
}

export async function deleteEvent(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.calendarEvent.delete({ where: { id } });
  revalidatePath("/admin/calendar");
}
