# TenantStock

Multi-tenant inventory SaaS for the **MERN Stack Developer** technical assignment: React + Express + MongoDB, JWT roles, Socket.io, purchase/sales orders, dashboard analytics (&lt;2s design target at 10k+ SKUs), and **atomic stock** under concurrency.

UI uses **Ant Design** and **Ant Design Charts** (the PDF does not require a specific component library).

## Repository layout

| Path | Description |
|------|-------------|
| [`backend/`](./backend/) | Express API, database-per-tenant Mongoose, Socket.io, seed |
| [`frontend/`](./frontend/) | Vite + React + TypeScript + Ant Design |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System design: tenancy, performance, Redis, concurrency |

## Prerequisites

- Node.js 20+
- MongoDB 6+ (local or Atlas)
- Redis 6+ **optional** (dashboard cache; works without it)

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed    # global DB + 2 tenant databases with sample data
npm run dev     # http://localhost:4000
```

Optional Redis (faster repeat dashboard loads):

```bash
# In backend/.env
REDIS_URL=redis://127.0.0.1:6379
DASHBOARD_CACHE_TTL_SECONDS=60
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

## Multi-tenancy

- **Global DB** (`tenantstock_global`): `tenants`, `users`
- **Per company**: dedicated MongoDB database (`tenant_<id>`, stored on `Tenant.dbName`)
- JWT includes `companyId` / `tenantId`; middleware routes each request to the correct DB

See [ARCHITECTURE.md](./ARCHITECTURE.md) for trade-offs, atomic stock, and dashboard strategy.

## API highlights

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Register company + owner (provisions tenant DB) |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/dashboard/summary` | Aggregated metrics (`cached` flag if Redis hit) |
| CRUD | `/api/products`, `/api/attributes`, … | Tenant-scoped inventory |

Bearer token: `Authorization: Bearer <jwt>`

### Register example

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "companyName": "Demo Co",
    "slug": "demo-co",
    "ownerName": "Jane Owner",
    "email": "jane@demo.test",
    "password": "password123"
  }'
```

## Test users (after `npm run seed`)

| Tenant | Email | Password | Role |
|--------|-------|----------|------|
| Acme Retail | `owner@acme.test` | `password123` | Owner |
| Acme Retail | `staff@acme.test` | `password123` | Staff |
| Globex Trading | `manager@globex.test` | `password123` | Manager |

## Features

- Database-per-tenant isolation + company registration API
- Products with per-attribute **option** selection; attributes CRUD
- Suppliers, purchase orders (workflow + partial receipts)
- Sales orders: create → fulfill (partial) → cancel with restock
- **Atomic** SKU decrement on fulfill (`stock: { $gte: qty }` + `$inc`)
- Dashboard: inventory value, smart low-stock (net inbound POs), top sellers, 7-day chart
- Optional **Redis** dashboard cache with invalidation on stock changes
- Socket.io tenant rooms for live refresh

## Build

```bash
cd backend && npm run seed && npm run dev
cd frontend && npm run dev
```

## License

Private / assignment use.
