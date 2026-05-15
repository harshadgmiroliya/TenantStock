import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import * as attributeController from "../controllers/attributeController.js";

export const attributesRouter = Router();

attributesRouter.use(tenantStack);

attributesRouter.get("/", asyncHandler(attributeController.listAttributes));
attributesRouter.get("/:id", asyncHandler(attributeController.getAttributeById));
attributesRouter.post("/", requireRole("Owner", "Manager"), asyncHandler(attributeController.createAttribute));
attributesRouter.patch("/:id", requireRole("Owner", "Manager"), asyncHandler(attributeController.updateAttribute));
attributesRouter.delete("/:id", requireRole("Owner", "Manager"), asyncHandler(attributeController.deleteAttribute));
