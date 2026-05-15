import mongoose, { Schema } from "mongoose";
import type { UserRole } from "../types/roles.js";

const userSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ["Owner", "Manager", "Staff"] satisfies UserRole[],
      required: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const User = mongoose.model("User", userSchema);
