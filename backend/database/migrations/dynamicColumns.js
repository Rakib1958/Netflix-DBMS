/**
 * Runtime migrations: add optional User/Media columns if missing (verification, ban, TMDB JSON, etc.).
 */
import { pool } from '../config/db.js';

export async function ensureDynamicColumns() {
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS reset_password_otp VARCHAR(10)`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS reset_password_expires BIGINT`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS verification_expires BIGINT`);
  await pool.query(`ALTER TABLE Media ADD COLUMN IF NOT EXISTS tmdb_id VARCHAR(50) UNIQUE`);
  await pool.query(`ALTER TABLE Media ADD COLUMN IF NOT EXISTS tmdb_data JSONB`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS banned_until BIGINT`);
  await pool.query(`ALTER TABLE Media ADD COLUMN IF NOT EXISTS admin_metadata JSONB DEFAULT '{}'::jsonb`);
}