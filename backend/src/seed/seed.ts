import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectGlobalDb } from "../config/db.js";
import { tenantDatabaseManager, tenantDatabaseName } from "../config/tenantDatabaseManager.js";
import { getTenantModels } from "../models/tenant/registerTenantModels.js";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

await connectGlobalDb(uri);

const slugs = ["acme-retail", "globex-trading"];
const existingTenants = await Tenant.find({ slug: { $in: slugs } }).select("_id");
const tenantIds = existingTenants.map((t) => t._id);

if (tenantIds.length) {
  await User.deleteMany({ tenantId: { $in: tenantIds } });
  await Tenant.deleteMany({ _id: { $in: tenantIds } });
  for (const id of tenantIds) {
    try {
      await mongoose.connection.useDb(tenantDatabaseName(id.toString())).dropDatabase();
    } catch {
      // database may not exist yet
    }
  }
}

tenantDatabaseManager.clearCache();

const t1 = new Tenant({ name: "Acme Retail", slug: "acme-retail" });
t1.dbName = tenantDatabaseName(t1._id.toString());
await t1.save();
const t2 = new Tenant({ name: "Globex Trading", slug: "globex-trading" });
t2.dbName = tenantDatabaseName(t2._id.toString());
await t2.save();

const passwordHash = await bcrypt.hash("password123", 10);

await User.create([
  { tenantId: t1._id, email: "owner@acme.test", passwordHash, name: "Acme Owner", role: "Owner" },
  { tenantId: t1._id, email: "staff@acme.test", passwordHash, name: "Acme Staff", role: "Staff" },
  { tenantId: t2._id, email: "manager@globex.test", passwordHash, name: "Globex Manager", role: "Manager" },
]);

async function seedTenantData(tenant: typeof t1) {
  const tenantId = tenant._id;
  const conn = await tenantDatabaseManager.ensureTenantDatabase(tenantId.toString(), tenant.dbName);
  const m = getTenantModels(conn);

  if (tenantId.equals(t1._id)) {
    const attrSize = await m.Attribute.create({
      tenantId,
      name: "Size",
      slug: "size",
      options: [
        { label: "S", slug: "s", sortOrder: 0 },
        { label: "M", slug: "m", sortOrder: 1 },
        { label: "L", slug: "l", sortOrder: 2 },
      ],
    });
    const attrColor = await m.Attribute.create({
      tenantId,
      name: "Color",
      slug: "color",
      options: [
        { label: "Red", slug: "red", sortOrder: 0 },
        { label: "Blue", slug: "blue", sortOrder: 1 },
      ],
    });

    const p1 = await m.Product.create({
      tenantId,
      name: "T-Shirt",
      description: "Cotton tee",
      attributeSelections: [
        { attributeId: attrSize._id, optionSlugs: ["s", "m", "l"] },
        { attributeId: attrColor._id, optionSlugs: ["red", "blue"] },
      ],
    });

    const sizes = ["S", "M", "L"];
    const colors = ["Red", "Blue"];
    const skusT1 = [];
    for (const size of sizes) {
      for (const color of colors) {
        skusT1.push(
          await m.Sku.create({
            tenantId,
            productId: p1._id,
            skuCode: `TEE-${size}-${color}`.toUpperCase(),
            attributes: new Map([
              ["size", size],
              ["color", color],
            ]),
            stock: 20,
            reorderPoint: 15,
            unitCost: 8,
          })
        );
      }
    }

    const s1 = await m.Supplier.create({ tenantId, name: "Acme Supplier Co", email: "sales@supplier.test" });
    await m.PurchaseOrder.create({
      tenantId,
      supplierId: s1._id,
      status: "Confirmed",
      items: [
        { skuId: skusT1[0]!._id, qtyOrdered: 50, qtyReceived: 0, unitPrice: 7.5 },
        { skuId: skusT1[1]!._id, qtyOrdered: 30, qtyReceived: 0, unitPrice: 7.5 },
      ],
    });

    await m.StockMovement.insertMany([
      {
        tenantId,
        skuId: skusT1[0]!._id,
        type: "sale",
        quantityDelta: -3,
        refType: "Manual",
        note: "seed sale",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        tenantId,
        skuId: skusT1[0]!._id,
        type: "purchase",
        quantityDelta: 10,
        refType: "Manual",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);
  }

  if (tenantId.equals(t2._id)) {
    const p2 = await m.Product.create({ tenantId, name: "Widget", description: "Industrial widget" });
    const w1 = await m.Sku.create({
      tenantId,
      productId: p2._id,
      skuCode: "WIDGET-STD",
      attributes: new Map([["variant", "standard"]]),
      stock: 200,
      reorderPoint: 50,
      unitCost: 3,
    });
    await m.StockMovement.create({
      tenantId,
      skuId: w1._id,
      type: "sale",
      quantityDelta: -25,
      refType: "Manual",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
  }
}

await seedTenantData(t1);
await seedTenantData(t2);

console.log("Seed complete (database-per-tenant).");
console.log(`Global DB: tenants + users`);
console.log(`Tenant DBs: ${tenantDatabaseName(t1._id.toString())}, ${tenantDatabaseName(t2._id.toString())}`);
console.log("Tenant 1 (Acme): owner@acme.test / staff@acme.test — password: password123");
console.log("Tenant 2 (Globex): manager@globex.test — password: password123");

await mongoose.disconnect();
