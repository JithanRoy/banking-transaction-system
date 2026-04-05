import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const isSupabaseConnection = connectionString?.includes(".supabase.co");
const shouldUseSsl =
  process.env.DATABASE_SSL === "true" || isSupabaseConnection;

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
});
