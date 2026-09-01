"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const orderSchema = z.object({
  customerId: z.string().optional(),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  source: z.enum(["IN_STORE", "WEBSITE"]),
});

export async function recordOrder(formData: FormData) {
  const data = orderSchema.parse({
    customerId: formData.get("customerId") || undefined,
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    source: formData.get("source"),
  });

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: data.productId },
  });
  const total = Number(product.unitPrice) * data.quantity;

  await prisma.order.create({
    data: {
      customerId: data.customerId || null,
      source: data.source,
      status: "COMPLETED",
      total,
      items: {
        create: [
          {
            productId: data.productId,
            quantity: data.quantity,
            unitPrice: product.unitPrice,
          },
        ],
      },
    },
  });

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/customers");
}

const statusValues = [
  "PENDING",
  "PACKING",
  "COMPLETED",
  "DELIVERED",
  "CANCELLED",
] as const;

export async function updateOrderStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!statusValues.includes(status as (typeof statusValues)[number])) {
    throw new Error("Invalid status");
  }

  await prisma.order.update({
    where: { id },
    data: { status: status as (typeof statusValues)[number] },
  });
  revalidatePath("/admin/orders");
}
