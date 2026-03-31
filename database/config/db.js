import "./loadEnv.js";
import pkg from "pg";
import { safeError, safeInfo, sanitizeForLog } from "../utils/rotation.js";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function connectToDB() {
  try {
    const client = await pool.connect();
    safeInfo("PostgreSQL Connected!");
    client.release();
  } catch (error) {
    safeError("Error connecting to PostgreSQL:", sanitizeForLog(error));
    process.exit(1);
  }
}

export { pool };
