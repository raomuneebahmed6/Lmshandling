import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Seeding...");

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.stockBatch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staff.deleteMany();

  const ownerPassword = await bcrypt.hash("ebsons2026", 10);
  const staffPassword = await bcrypt.hash("staff12345", 10);

  const staff = await Promise.all(
    [
      { name: "Ali Hassan", email: "owner@ebsons.com.pk", role: "OWNER" as const, phone: "0300 1234567", shiftStart: "09:00", shiftEnd: "18:00", shiftStatus: "ON_DUTY" as const, password: ownerPassword },
      { name: "Sana Riaz", email: "sana@ebsons.com.pk", role: "STAFF" as const, phone: "0301 2345678", shiftStart: "09:00", shiftEnd: "15:00", shiftStatus: "ON_DUTY" as const, password: staffPassword },
      { name: "Bilal Ahmed", email: "bilal@ebsons.com.pk", role: "STAFF" as const, phone: "0302 3456789", shiftStart: "15:00", shiftEnd: "21:00", shiftStatus: "UPCOMING" as const, password: staffPassword },
      { name: "Fatima Noor", email: "fatima@ebsons.com.pk", role: "MANAGER" as const, phone: "0303 4567890", shiftStart: "09:00", shiftEnd: "18:00", shiftStatus: "ON_DUTY" as const, password: staffPassword },
      { name: "Zeeshan Iqbal", email: "zeeshan@ebsons.com.pk", role: "PHARMACIST" as const, phone: "0306 7890123", shiftStart: "08:00", shiftEnd: "16:00", shiftStatus: "ON_DUTY" as const, password: staffPassword },
      { name: "Ayesha Malik", email: "ayesha@ebsons.com.pk", role: "STAFF" as const, phone: "0305 6789012", shiftStart: "09:00", shiftEnd: "15:00", shiftStatus: "ON_LEAVE" as const, password: staffPassword },
    ].map((s) =>
      prisma.staff.create({
        data: {
          name: s.name,
          email: s.email,
          passwordHash: s.password,
          role: s.role,
          phone: s.phone,
          shiftStart: s.shiftStart,
          shiftEnd: s.shiftEnd,
          shiftStatus: s.shiftStatus,
        },
      }),
    ),
  );

  const productDefs = [
    { name: "Panadol Extra 500mg", category: "Pain relief", unitPrice: 45, reorderAt: 100, batch: "PDX-2409", qty: 420, expiryDays: 540 },
    { name: "Augmentin 625mg", category: "Antibiotic", unitPrice: 320, reorderAt: 50, batch: "AUG-1187", qty: 38, expiryDays: 70 },
    { name: "Disprin Regular", category: "Pain relief", unitPrice: 20, reorderAt: 80, batch: "DIS-0921", qty: 310, expiryDays: 640 },
    { name: "Ensure Vanilla 400g", category: "Nutrition", unitPrice: 1850, reorderAt: 20, batch: "ENS-3302", qty: 12, expiryDays: 40 },
    { name: "Centrum Silver", category: "Multivitamin", unitPrice: 1200, reorderAt: 25, batch: "CEN-7741", qty: 6, expiryDays: 11 },
    { name: "Accu-Chek Strips (50)", category: "Medical device", unitPrice: 2400, reorderAt: 30, batch: "ACC-5560", qty: 54, expiryDays: 480 },
    { name: "Panadol CF", category: "Cold & flu", unitPrice: 60, reorderAt: 60, batch: "PCF-2214", qty: 0, expiryDays: 10 },
    { name: "Brufen 400mg", category: "Pain relief", unitPrice: 55, reorderAt: 70, batch: "BRU-8823", qty: 190, expiryDays: 520 },
    { name: "Nutrifactor Biotin", category: "Supplement", unitPrice: 1450, reorderAt: 25, batch: "NBI-4471", qty: 29, expiryDays: 100 },
    { name: "Certeza BP Monitor", category: "Medical device", unitPrice: 4200, reorderAt: 5, batch: "CBP-1109", qty: 8, expiryDays: null },
    { name: "Herbiotics Zyva Syrup", category: "Cough & cold", unitPrice: 380, reorderAt: 20, batch: "HZS-6603", qty: 15, expiryDays: 35 },
    { name: "Surbex-Z", category: "Multivitamin", unitPrice: 480, reorderAt: 60, batch: "SBZ-9012", qty: 260, expiryDays: 600 },
  ];

  const products = await Promise.all(
    productDefs.map((p) =>
      prisma.product.create({
        data: {
          name: p.name,
          category: p.category,
          unitPrice: p.unitPrice,
          reorderAt: p.reorderAt,
          batches: {
            create: [
              {
                batchCode: p.batch,
                quantity: p.qty,
                expiresOn: p.expiryDays !== null ? daysFromNow(p.expiryDays) : null,
              },
            ],
          },
        },
      }),
    ),
  );

  const customers = await Promise.all(
    [
      { name: "Muhammad Aslam", phone: "0311 1112223", notes: "Regular — diabetic supplies" },
      { name: "Rukhsana Bibi", phone: "0312 2223334", notes: "Prefers WhatsApp order confirm" },
      { name: "Imran Sheikh", phone: "0313 3334445", notes: "Monthly refill — BP medicine" },
      { name: "Sadia Yousaf", phone: "0314 4445556", notes: "New customer, baby care" },
      { name: "Kashif Mehmood", phone: "0315 5556667", notes: "Website + in-store" },
    ].map((c) => prisma.customer.create({ data: c })),
  );

  const panadol = products[0];
  const augmentin = products[1];
  const ensure = products[3];

  await prisma.order.create({
    data: {
      customerId: customers[2].id,
      source: "WEBSITE",
      status: "DELIVERED",
      total: Number(augmentin.unitPrice) * 3,
      items: { create: [{ productId: augmentin.id, quantity: 3, unitPrice: augmentin.unitPrice }] },
    },
  });
  await prisma.order.create({
    data: {
      source: "IN_STORE",
      status: "COMPLETED",
      total: Number(panadol.unitPrice) * 2,
      items: { create: [{ productId: panadol.id, quantity: 2, unitPrice: panadol.unitPrice }] },
    },
  });
  await prisma.order.create({
    data: {
      customerId: customers[3].id,
      source: "WEBSITE",
      status: "PACKING",
      total: Number(ensure.unitPrice) * 1,
      items: { create: [{ productId: ensure.id, quantity: 1, unitPrice: ensure.unitPrice }] },
    },
  });

  const today = new Date();
  const onDate = (day: number) => new Date(today.getFullYear(), today.getMonth(), day, 9, 0);

  await Promise.all(
    [
      { title: "Ali opens store", type: "SHIFT" as const, date: onDate(2), staffId: staff[0].id },
      { title: "GSK delivery", type: "RESTOCK" as const, date: onDate(3) },
      { title: "Fatima 9-6 shift", type: "SHIFT" as const, date: onDate(5), staffId: staff[3].id },
      { title: "Panadol CF batch", type: "EXPIRY" as const, date: onDate(9) },
      { title: "Abbott delivery", type: "RESTOCK" as const, date: onDate(11) },
      { title: "Bilal evening shift", type: "SHIFT" as const, date: onDate(14), staffId: staff[2].id },
      { title: "Ensure batch review", type: "EXPIRY" as const, date: onDate(18) },
      { title: "GSK delivery", type: "RESTOCK" as const, date: onDate(20) },
      { title: "Centrum Silver batch", type: "EXPIRY" as const, date: onDate(27) },
    ].map((e) =>
      prisma.calendarEvent.create({
        data: {
          title: e.title,
          type: e.type,
          date: e.date,
          staffId: "staffId" in e ? e.staffId : undefined,
        },
      }),
    ),
  );

  console.log("Seed complete.");
  console.log("Owner login: owner@ebsons.com.pk / ebsons2026");
  console.log("Staff login (any staff email above) / staff12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
