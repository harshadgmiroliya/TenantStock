import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { tenantStack } from "../middleware/tenantStack.js";
import * as productController from "../controllers/productController.js";

export const productsRouter = Router();

productsRouter.use(tenantStack);

productsRouter.get("/", asyncHandler(productController.listProducts));
productsRouter.get("/:id", asyncHandler(productController.getProductById));
productsRouter.post("/", requireRole("Owner", "Manager"), asyncHandler(productController.createProduct));
productsRouter.patch("/:id", requireRole("Owner", "Manager"), asyncHandler(productController.updateProduct));
