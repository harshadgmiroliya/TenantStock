import mongoose from "mongoose";

const globalDbName = process.env.MONGODB_GLOBAL_DB ?? "tenantstock_global";

export function getGlobalDbName() {
  return globalDbName;
}

export async function connectGlobalDb(uri: string) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName: globalDbName });
}

export function getGlobalConnection() {
  return mongoose.connection;
}
