# TenantStock — System Architecture

Assignment-grade design notes for a multi-tenant inventory SaaS: database-per-tenant isolation, dashboard performance at 10k+ SKUs, atomic stock concurrency, optional Redis, and company self-registration.

---

## 1. Multi-tenant isolation

### Decision

**Chosen approach: separate database per tenant** (database-per-tenant on one MongoDB cluster).

| Database | Purpose | Collections |
|----------|---------|-------------|
| **`tenantstock_global`** (`MONGODB_GLOBAL_DB`) | Control plane | `tenants`, `users` |
| **`tenant_<tenantId>`** (stored as `Tenant.dbName`) | One isolated DB per company | `products`, `skus`, `attributes`, `suppliers`, `purchaseorders`, `salesorders`, `stockmovements`, … |

After login, JWT carries `tenantId` / `companyId`. Middleware `tenantStack` = `requireAuth` → `attachTenantDb` loads `Tenant.dbName` from the global DB and opens that tenant’s connection via `TenantDatabaseManager` (`mongoose.useDb` + in-process cache).

### Request flow

```
POST /api/auth/login  → global DB only
GET  /api/dashboard   → JWT → attachTenantDb → tenant DB aggregations
```

### Pros (database-per-tenant — why we chose it)

- **Strong isolation** — A bug or missing filter cannot read or write another tenant’s collections; isolation is enforced at the database boundary.
- **Smaller working sets** — Each tenant DB only holds that company’s SKUs/orders, which helps query performance and cache locality (relevant for the &lt;2s dashboard with 10k+ products **per tenant**).
- **Per-tenant operations** — Backup, restore, export, or archive one company without touching others.
- **Independent scaling path** — High-volume tenants can later move to dedicated clusters or shards without redesigning the whole platform.
- **Aligns with MongoDB guidance** — Common pattern for SaaS when tenant count is moderate and isolation is a priority.

### Cons (database-per-tenant — trade-offs we accept)

- **Higher application complexity** — Every authenticated request must resolve the correct DB (`attachTenantDb`, `getTenantModels(conn)`).
- **Migrations are per tenant** — Schema/index changes must run across all tenant databases (we use `syncTenantIndexes` on first access; production needs a migration runner).
- **More databases to manage** — Connection caching helps, but ops tooling must account for N tenant DBs.
- **Cross-tenant analytics** — Platform-wide reporting across companies is harder (not required for this assignment).
- **Provisioning step** — New companies need DB creation/index sync (`POST /api/auth/register` + `ensureTenantDatabase`).

---

### Alternatives considered

#### Option A — Row-level tenancy (single DB, `tenantId` on every document)

**Pros**

- Simplest application code — one connection, one set of models; always filter by `tenantId`.
- Single migration — indexes and schema change once for all tenants.
- Easy cross-tenant admin/reporting if ever needed.

**Cons**

- **Weakest isolation** — One forgotten `tenantId` in a query can leak data across companies.
- **Larger indexes and collections** — All tenants share the same `skus` / `orders` collections; hot tenants affect everyone.
- **Risk under load** — Concurrent writes from many tenants contend on the same collections.

**Why not chosen:** Data isolation is a core assignment requirement; row-level is fast to build but too easy to get wrong in production.

---

#### Option B — Schema-based tenancy (e.g. one DB, collection prefix or namespace per tenant)

In MongoDB this often means **one database per tenant** (what we use) or non-standard patterns like **prefixed collection names** (`acme_products`, `globex_products`) inside a shared database.

**Pros**

- Still one cluster connection string; tenants can be grouped logically.
- Can feel lighter than “many databases” on platforms that charge per DB (depends on host).

**Cons**

- **Non-idiomatic in MongoDB** — Unlike PostgreSQL `schema`, MongoDB has no first-class schema namespace; prefixes are convention-only and easy to mis-apply.
- **Same leakage risk as row-level** if prefix/filter is omitted.
- **Messy migrations** — Renaming or syncing many prefixed collections is awkward.

**Why not chosen:** MongoDB’s natural isolation unit is the **database**, not a schema. We use real separate databases rather than emulating schemas with naming hacks.

---

#### Option C — Separate database per tenant ✅ **chosen**

See **Pros** and **Cons** above. This is the implemented model (`tenantstock_global` + `tenant_<id>`).

---

## 2. Company registration & provisioning

`POST /api/auth/register` (public):

1. Validate unique `slug` and email.
2. Pre-generate `tenantId` (`ObjectId`) and `dbName = tenant_<id>`.
3. Create `Tenant` + `User` (role `Owner`) in **global** DB.
4. `ensureTenantDatabase(tenantId, dbName)` — creates connection, syncs indexes.
5. Return JWT with `{ sub, companyId, tenantId, role }`.

Login and all inventory routes use the same JWT shape. Existing seed tenants get `dbName` on the `Tenant` document.

---

## 3. Performance: dashboard &lt; 2s at 10k+ SKUs

Goals from the assignment: dashboard must stay responsive with large catalogs.

### 3.1 Server-side aggregation (no full SKU load)

`dashboardService.computeDashboardSummary` uses MongoDB pipelines only:

- **Inventory value / SKU count** — `$group` on `skus`.
- **Low stock** — `$match` with `$expr: { $lt: ["$stock", "$reorderPoint"] }`, `$limit: 200`, then merge inbound from open POs in a second aggregation (not N+1 per SKU in application code).
- **Top sellers (30d)** — `$group` on `stockmovements` with `$lookup` to `skus`.
- **7-day movement chart** — `$dateToString` bucket on `createdAt`.

Indexes on tenant models (`tenantId`, `stock`, `reorderPoint`, movement `createdAt`) support these scans inside a **single tenant database** (smaller working set than multi-tenant monolith).

### 3.2 Optional Redis read cache

When `REDIS_URL` is set:

- Key: `tenantstock:dashboard:<tenantId>`
- TTL: `DASHBOARD_CACHE_TTL_SECONDS` (default 60)
- Response includes `cached: true|false` for debugging

On stock-changing operations (sales fulfill/cancel, PO receipt), `invalidateDashboardCache` deletes the key. If Redis is down or unset, the API falls back to MongoDB-only with no crash.

### 3.3 Further production optimizations (documented, not all implemented)

- Compound indexes tuned from `explain("executionStats")` on slow aggregations.
- Read preference `secondaryPreferred` for dashboard reads.
- Materialized “dashboard snapshot” collection updated by change streams (for sub-second SLA at very large scale).
- CDN + pagination on product list UI (API list endpoints support standard Mongoose limits).

---

## 4. Concurrency: atomic stock decrement

**Problem:** Two staff fulfill the same SKU concurrently; read-modify-write can oversell.

**Solution:** Conditional atomic update in `stockService.atomicDecrementStock`:

```javascript
// Only succeeds when stock >= quantity
db.skus.findOneAndUpdate(
  { _id: skuId, tenantId, stock: { $gte: quantity } },
  { $inc: { stock: -quantity } },
  { new: true, session }
)
```

If the full quantity is not available, a second pass decrements `min(need, available)` so partial fulfillment stays correct without negative stock.

`orderService.fulfillSalesOrder` runs inside a **MongoDB transaction** on the tenant connection: atomic decrements + `StockMovement` rows + order line updates commit or roll back together.

PO receipts use `$inc` on stock within the same transaction pattern (`poService`).

---

## 5. Domain model (tenant DB)

| Entity | Role |
|--------|------|
| `Product` | Merchandising parent; `attributeSelections[]` = which attribute options apply |
| `Attribute` | Option catalog (Size, Color, …) |
| `Sku` / `ProductVariant` | Stock-bearing units |
| `Supplier`, `PurchaseOrder` | Inbound; statuses `Draft` → `Sent` → `Confirmed` → `Received` |
| `SalesOrder` | Outbound; `pending` / `partial` / `fulfilled` / `cancelled` |
| `StockMovement` | Ledger (`sale`, `purchase`, `adjustment`); notes can record before/after |

**Smart low-stock:** `stock < reorderPoint` **and** `stock + inboundOpenPO < reorderPoint`.

---

## 6. Real-time UI (Socket.io)

The assignment requires **real-time updates** when inventory or orders change. We use Socket.io for **push notifications** so open screens refresh without manual reload or constant polling.

### When we use Socket.io (triggers)

Emit to the tenant room `tenant:<tenantId>` after a **successful write** that other users should see quickly:

| Event | Emitted when | Why Socket.io |
|-------|----------------|---------------|
| `inventory:updated` | Sales order fulfill/cancel, PO receipt, SKU stock edit, manual stock movement | Stock levels and low-stock alerts must update on Dashboard / Inventory for all logged-in users |
| `salesOrder:created` | New sales order created | Sales Orders list should show new rows for managers/staff on other tabs |
| `purchaseOrder:created` | New PO created | Purchase Orders list stays in sync |
| `purchaseOrder:updated` | PO status change or line receipt | PO workflow and inbound quantities affect low-stock logic |

**Frontend reaction:** pages subscribe via `SocketContext` → `lastInventoryEvent` timestamp bumps → `useEffect` refetches REST data (Dashboard, Inventory, Sales Orders, Purchase Orders). Socket.io carries a **signal to refresh**, not the full payload (keeps messages small; source of truth stays MongoDB).

### When we do **not** need Socket.io

- **Login / register / read-only GET** — normal HTTP is enough.
- **Single-user, same-tab edits** — the API response already returns updated data; socket is for **other clients** in the same tenant.
- **Historical reports** — load once via REST; no live stream required.
- **If real-time were dropped** — acceptable fallback: poll `/api/dashboard/summary` every N seconds (worse UX and more load; Socket.io is the assignment-aligned choice).

### How it works

- Server: Socket.io on the HTTP server; JWT in `handshake.auth.token` → join `tenant:<tenantId>` (same isolation as REST).
- Client: connects after login with bearer token; listens for the events above.
- Dev: frontend may connect directly to `http://127.0.0.1:4000` (see `frontend/src/config/socket.ts`) to avoid Vite WebSocket proxy `ECONNRESET`.
- Production multi-node: use `@socket.io/redis-adapter` so emits reach all API instances (not implemented in this repo; noted in deploy sketch).

---

## 7. Security & roles

| Role | Typical access |
|------|----------------|
| `Owner` | Full tenant admin |
| `Manager` | POs, products, fulfill orders |
| `Staff` | Read + limited mutations (route-level `requireRole`) |

Passwords: bcrypt. Secrets: `JWT_SECRET` in env (never committed).

---

## 8. DevOps & local run

```bash
# MongoDB required; Redis optional
cd backend && cp .env.example .env && npm install && npm run seed && npm run dev
cd frontend && npm install && npm run dev
```

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Cluster connection string |
| `MONGODB_GLOBAL_DB` | Global control-plane DB name |
| `JWT_SECRET` | Token signing |
| `REDIS_URL` | Optional dashboard cache |
| `CLIENT_ORIGIN` | CORS + Socket.io |

**Deploy sketch:** API behind reverse proxy; MongoDB Atlas; Redis Elasticache; horizontal API replicas with sticky sessions optional (Socket.io adapter Redis for multi-node).

---

## 9. Folder structure (pragmatic vs ideal)

Current layout: `controllers/`, `routes/`, `services/`, `models/tenant/` — flat Express style for speed of delivery.

Ideal at scale: `modules/inventory`, `modules/orders`, `core/tenant`, `core/auth` — deferred to avoid a large refactor in a time-boxed assignment; boundaries already exist in services (`orderService`, `poService`, `dashboardService`).

---

## 10. Known limitations & future work

- No automated cross-tenant migration runner (run index sync per tenant or admin script).
- Product list APIs: basic pagination; not cursor-based infinite scroll.
- Register UI on frontend optional; API is ready.
- Stock movement schema uses `note` for before/after in some paths; dedicated `stockBefore`/`stockAfter` fields possible.
- Load testing script for concurrent fulfill not included in repo.
- `KEYS` in Redis `cacheDel` only used for glob patterns; single-key delete uses `DEL`.

---

## 11. Time breakdown (author estimate)

| Area | Hours |
|------|-------|
| Backend tenancy, models, auth, register | ~4 |
| Orders, PO, transactions, atomic stock | ~3 |
| Dashboard aggregations + Redis | ~2 |
| Frontend (Ant Design, charts, sockets) | ~4 |
| Seed, docs, fixes | ~2 |
| **Total** | **~15** |
