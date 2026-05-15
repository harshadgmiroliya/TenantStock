import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import * as productVariantController from "../controllers/productVariantController.js";

export const productVariantsRouter = Router();

productVariantsRouter.use(tenantStack);

productVariantsRouter.get("/", asyncHandler(productVariantController.listProductVariants));
productVariantsRouter.get("/:id", asyncHandler(productVariantController.getProductVariantById));
productVariantsRouter.post("/", requireRole("Owner", "Manager"), asyncHandler(productVariantController.createProductVariant));
productVariantsRouter.patch("/:id", requireRole("Owner", "Manager"), asyncHandler(productVariantController.updateProductVariant));
productVariantsRouter.delete("/:id", requireRole("Owner", "Manager"), asyncHandler(productVariantController.deleteProductVariant));
