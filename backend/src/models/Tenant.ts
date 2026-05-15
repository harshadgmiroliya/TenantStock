import mongoose, { Schema } from "mongoose";

const tenantSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    /** Physical MongoDB database name for this company (e.g. tenant_665f...) */
    dbName: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

export const Tenant = mongoose.model("Tenant", tenantSchema);
