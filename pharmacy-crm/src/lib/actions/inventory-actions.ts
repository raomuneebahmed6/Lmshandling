"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  reorderAt: z.coerce.number().int().min(0),
});

export async function createProduct(formData: FormData) {
  const data = productSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    unitPrice: formData.get("unitPrice"),
    reorderAt: formData.get("reorderAt"),
  });

  await prisma.product.create({ data });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/products");
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/products");
}

const batchSchema = z.object({
  productId: z.string().min(1),
  batchCode: z.string().min(1),
  quantity: z.coerce.number().int().min(0),
  expiresOn: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
});

export async function addBatch(formData: FormData) {
  const data = batchSchema.parse({
    productId: formData.get("productId"),
    batchCode: formData.get("batchCode"),
    quantity: formData.get("quantity"),
    expiresOn: formData.get("expiresOn") || undefined,
  });

  await prisma.stockBatch.create({ data });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/products");
}

export async function deleteBatch(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.stockBatch.delete({ where: { id } });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/products");
}

export async function adjustBatchQuantity(formData: FormData) {
  const id = String(formData.get("id"));
  const delta = Number(formData.get("delta"));

  const batch = await prisma.stockBatch.findUniqueOrThrow({ where: { id } });
  const nextQuantity = Math.max(0, batch.quantity + delta);

  await prisma.stockBatch.update({
    where: { id },
    data: { quantity: nextQuantity },
  });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/products");
}
