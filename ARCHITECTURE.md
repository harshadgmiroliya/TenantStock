# TenantStock — System Architecture

Assignment-grade design notes for a multi-tenant inventory SaaS: database-per-tenant isolation, dashboard performance at 10k+ SKUs, atomic stock concurrency, optional Redis, and company self-registration.

---

## 1. Multi-tenant isolation: database-per-tenant

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

### Why database-per-tenant (vs row-level `tenantId`)

| | Database-per-tenant | Single DB + `tenantId` filter |
|--|---------------------|-------------------------------|
| Isolation | Strong — wrong query cannot read another DB | Depends on every query including filter |
| Index size | Smaller per tenant | Grows with all tenants |
| Backup/restore | Per company | All-or-nothing |
| Ops cost | Migrations/index sync per tenant DB | One migration |

**Trade-off:** Dynamic DB routing and per-tenant index sync (`syncTenantIndexes` on first access). Cross-tenant reporting is out of scope.

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

## 6. Real-time UI

- Socket.io namespace on the API server; handshake JWT → join `tenant:<tenantId>`.
- Events: `inventory:updated`, `salesOrder:created`, `purchaseOrder:updated`.
- Dev frontend connects to `http://127.0.0.1:4000` directly (avoids Vite WS proxy `ECONNRESET`).

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
