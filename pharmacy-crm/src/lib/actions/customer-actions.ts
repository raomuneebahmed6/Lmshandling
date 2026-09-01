"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  notes: z.string().optional(),
});

export async function createCustomer(formData: FormData) {
  const data = customerSchema.parse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    notes: formData.get("notes") || undefined,
  });

  await prisma.customer.create({ data });
  revalidatePath("/admin/customers");
}

export async function deleteCustomer(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/admin/customers");
}
