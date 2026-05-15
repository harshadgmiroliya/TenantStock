import { Router } from "express";
import { Types } from "mongoose";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import { getTenantContext } from "../utils/tenantContext.js";

export const suppliersRouter = Router();

suppliersRouter.use(tenantStack);

suppliersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const rows = await models.Supplier.find({ tenantId }).sort({ name: 1 }).lean();
    res.json(rows);
  })
);

suppliersRouter.post(
  "/",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const { name, email, phone, defaultLeadDays } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      defaultLeadDays?: number;
    };
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const s = await models.Supplier.create({
      tenantId,
      name,
      email: email ?? "",
      phone: phone ?? "",
      defaultLeadDays: defaultLeadDays ?? 7,
    });
    res.status(201).json(s);
  })
);

suppliersRouter.patch(
  "/:id",
  requireRole("Owner", "Manager"),
  asyncHandler(async (req, res) => {
    const { tenantId, models } = getTenantContext(req);
    const id = new Types.ObjectId(req.params.id);
    const s = await models.Supplier.findOneAndUpdate({ _id: id, tenantId }, { $set: req.body }, { new: true });
    if (!s) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(s);
  })
);
