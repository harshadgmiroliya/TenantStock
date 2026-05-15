import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { User } from "../models/User.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.userId).lean();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user._id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  })
);
