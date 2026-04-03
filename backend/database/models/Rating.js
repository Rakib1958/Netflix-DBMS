/**
 * Rating model: upsert user rating; DB triggers update Media aggregates.
 */
import { pool } from '../config/db.js';

export class Rating {
  static async rateMedia(userId, mediaId, ratingValue) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO Rating (user_id, media_id, rating_value) VALUES ($1, $2, $3)
        ON CONFLICT (user_id, media_id) DO UPDATE SET rating_value = EXCLUDED.rating_value
      `, [userId, mediaId, ratingValue]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}