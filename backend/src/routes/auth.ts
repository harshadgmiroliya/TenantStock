import { Router } from "express";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { signToken } from "../utils/jwt.js";
import { tenantDatabaseManager, tenantDatabaseName } from "../config/tenantDatabaseManager.js";
import { HttpError } from "../utils/httpError.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { companyName, slug, ownerName, email, password } = req.body as {
      companyName?: string;
      slug?: string;
      ownerName?: string;
      email?: string;
      password?: string;
    };
    if (!companyName || !slug || !ownerName || !email || !password) {
      res.status(400).json({ error: "companyName, slug, ownerName, email, password required" });
      return;
    }
    const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    const existing = await Tenant.findOne({ slug: normalizedSlug });
    if (existing) {
      throw new HttpError(409, "Company slug already registered");
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new HttpError(409, "Email already in use");
    }

    const tenantId = new Types.ObjectId();
    const dbName = tenantDatabaseName(tenantId.toString());

    const tenant = await Tenant.create({
      _id: tenantId,
      name: companyName.trim(),
      slug: normalizedSlug,
      dbName,
    });

    await tenantDatabaseManager.ensureTenantDatabase(tenant._id.toString(), tenant.dbName);

    const passwordHash = await bcrypt.hash(password, 10);
    const owner = await User.create({
      tenantId: tenant._id,
      email: email.toLowerCase(),
      passwordHash,
      name: ownerName.trim(),
      role: "Owner",
    });

    const token = signToken(owner._id.toString(), tenant._id.toString(), owner.role);
    res.status(201).json({
      token,
      tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug, dbName: tenant.dbName },
      user: {
        id: owner._id,
        companyId: tenant._id,
        tenantId: tenant._id,
        email: owner.email,
        name: owner.name,
        role: owner.role,
      },
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const tenant = await Tenant.findById(user.tenantId);
    const token = signToken(user._id.toString(), user.tenantId.toString(), user.role);
    res.json({
      token,
      user: {
        id: user._id,
        companyId: user.tenantId,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: tenant ? { id: tenant._id, name: tenant.name, slug: tenant.slug, dbName: tenant.dbName } : undefined,
    });
  })
);
