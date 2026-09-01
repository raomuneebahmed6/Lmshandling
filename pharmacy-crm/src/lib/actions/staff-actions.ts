"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const staffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["OWNER", "PHARMACIST", "MANAGER", "STAFF"]),
  phone: z.string().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
});

export async function createStaff(formData: FormData) {
  const data = staffSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    phone: formData.get("phone") || undefined,
    shiftStart: formData.get("shiftStart") || undefined,
    shiftEnd: formData.get("shiftEnd") || undefined,
  });

  const passwordHash = await bcrypt.hash(data.password, 10);

  await prisma.staff.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      phone: data.phone,
      shiftStart: data.shiftStart,
      shiftEnd: data.shiftEnd,
    },
  });
  revalidatePath("/admin/staff");
  revalidatePath("/admin");
}

const shiftStatusValues = ["ON_DUTY", "UPCOMING", "ON_LEAVE"] as const;

export async function setShiftStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const shiftStatus = String(formData.get("shiftStatus"));
  if (!shiftStatusValues.includes(shiftStatus as (typeof shiftStatusValues)[number])) {
    throw new Error("Invalid shift status");
  }

  await prisma.staff.update({
    where: { id },
    data: { shiftStatus: shiftStatus as (typeof shiftStatusValues)[number] },
  });
  revalidatePath("/admin/staff");
  revalidatePath("/admin");
}

export async function deactivateStaff(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.staff.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin/staff");
  revalidatePath("/admin");
}
