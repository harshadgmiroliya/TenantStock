import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "./utils/jwt.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { productsRouter } from "./routes/products.js";
import { skusRouter } from "./routes/skus.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { purchaseOrdersRouter } from "./routes/purchaseOrders.js";
import { salesOrdersRouter } from "./routes/salesOrders.js";
import { stockMovementsRouter } from "./routes/stockMovements.js";
import { attributesRouter } from "./routes/attributes.js";
import { productVariantsRouter } from "./routes/productVariants.js";
import { connectGlobalDb, getGlobalDbName } from "./config/db.js";
import { tenantDatabaseManager } from "./config/tenantDatabaseManager.js";

export async function startServer() {
  const app = express();
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN?.split(",") ?? true,
      credentials: true,
    })
  );
  app.use(express.json());

  const clientOrigins = process.env.CLIENT_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigins?.length ? clientOrigins : true,
      credentials: true,
    },
    transports: ["polling", "websocket"],
  });
  app.set("io", io);

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }
      const payload = verifyToken(token);
      socket.data.tenantId = payload.tenantId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const tid = socket.data.tenantId as string | undefined;
    if (tid) {
      socket.join(`tenant:${tid}`);
    }
  });

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, globalDb: getGlobalDbName(), tenancy: "database-per-tenant" })
  );

  app.use("/api/auth", authRouter);
  app.use("/api", meRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/skus", skusRouter);
  app.use("/api/suppliers", suppliersRouter);
  app.use("/api/purchase-orders", purchaseOrdersRouter);
  app.use("/api/sales-orders", salesOrdersRouter);
  app.use("/api/stock-movements", stockMovementsRouter);
  app.use("/api/attributes", attributesRouter);
  app.use("/api/product-variants", productVariantsRouter);

  app.use(errorHandler);

  const port = Number(process.env.PORT) || 4000;
  httpServer.listen(port, () => {
    console.log(`API listening on http://localhost:${port} (global DB: ${getGlobalDbName()})`);
  });
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

await connectGlobalDb(uri);
tenantDatabaseManager.clearCache();
await startServer();
