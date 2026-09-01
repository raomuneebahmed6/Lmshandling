# Ebsons Command Center

A custom-built website and staff/inventory/CRM system for **Ellah Baksh & Sons Pharmacy** (Okara), replacing the need for a separate storefront and admin tool.

- **Public website** — home, medicine/product catalog, contact — built to eventually replace or sit alongside `ebsons.com.pk`.
- **Admin command center** (`/admin`, staff login required) — dashboard, inventory & stock (with batch/expiry tracking), staff, customers (CRM), calendar (shifts & deliveries), and orders.

Built with Next.js (App Router), Prisma, PostgreSQL, and Auth.js — deployable for free on Vercel + Neon/Supabase.

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and AUTH_SECRET (see below)
npx prisma migrate dev       # creates tables
npx prisma db seed           # loads sample pharmacy data + login accounts
npm run dev
```

Visit `http://localhost:3000` for the public site, and `http://localhost:3000/login` for staff sign-in.

**Sample logins after seeding** (change these before going live):

| Role   | Email                  | Password     |
| ------ | ----------------------- | ------------ |
| Owner  | owner@ebsons.com.pk     | ebsons2026   |
| Staff  | sana@ebsons.com.pk      | staff12345   |

## 2. Getting a free database

The app needs a PostgreSQL database. Either of these free options works:

- **[Neon](https://neon.tech)** — free serverless Postgres, integrates natively with Vercel.
- **[Supabase](https://supabase.com)** — free Postgres with a dashboard/table editor if you like a GUI.

Steps (Neon shown, Supabase is nearly identical):

1. Create a free account and a new project.
2. Copy the connection string it gives you (starts with `postgresql://...`).
3. Paste it as `DATABASE_URL` in `.env.local` (local dev) and later in Vercel's Environment Variables (production).
4. Run `npx prisma migrate deploy` once against it to create the tables, then `npx prisma db seed` if you want sample data (skip seeding on the real production database once real data is in place).

## 3. Environment variables

See `.env.example`. You need:

- `DATABASE_URL` — your Postgres connection string.
- `AUTH_SECRET` — random string used to sign login sessions. Generate one with `openssl rand -base64 32`.
- `NEXTAUTH_URL` — the site's base URL (`http://localhost:3000` locally, your Vercel URL in production).

## 4. Deploying to Vercel (free tier)

1. Push this repository to GitHub (already done if you're reading this from the repo).
2. Go to [vercel.com](https://vercel.com), "Add New Project", import this repo, and set the **Root Directory** to `pharmacy-crm`.
3. Add the environment variables from step 3 above in Vercel's project settings.
4. Deploy. On the first deploy, run the database migration once from your machine (pointed at the production `DATABASE_URL`):
   ```bash
   DATABASE_URL="<your-production-url>" npx prisma migrate deploy
   ```
5. Optionally seed sample data the same way, or start adding real staff/products directly from `/admin` once you've created your first owner account (see below).

### Creating the first owner account in production

The seed script is meant for trying the app out. For a real launch, create just one owner account by running once:

```bash
DATABASE_URL="<your-production-url>" npx tsx prisma/seed.ts
```

then immediately change that account's password, or add a small one-off script to create a single user instead of the full sample dataset — ask for this and it can be added.

## 5. What's next / connecting to ebsons.com.pk

This build is a fully custom website + backend (not tied to Shopify), so it can either:

- **Replace** `ebsons.com.pk` once the catalog is fully loaded and a checkout flow is added, or
- **Run alongside it**, with the command center used for in-store staff, inventory and CRM while the existing Shopify site keeps handling online orders (in which case a future step is syncing Shopify orders into the `Order` table via Shopify's Admin API).

Possible next steps, roughly in order of value:
1. Add an online checkout/cart flow to the public site (currently browse + WhatsApp order).
2. Add image uploads for products.
3. Add reporting (sales by day/week, best sellers).
4. Point a custom domain (or subdomain like `admin.ebsons.com.pk`) at the Vercel deployment.
