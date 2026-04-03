/**
 * Review model: list by media, create with duplicate check, votes, admin moderation.
 */
import { pool } from '../config/db.js';

export class Review {
  static async getReviewsForMedia(mediaId) {
    const { rows } = await pool.query(`
      SELECT r.review_id, r.content, r.likes, r.dislikes, r.posted_at, u.username, u.profile_picture
      FROM Review r JOIN "User" u ON r.user_id = u.user_id
      WHERE r.media_id = $1 ORDER BY r.posted_at DESC
    `, [mediaId]);
    return rows;
  }

  static async createReview(userId, mediaId, content) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Check if user already reviewed this media
      const { rows } = await client.query(
        'SELECT COUNT(*) as count FROM Review WHERE user_id = $1 AND media_id = $2',
        [userId, mediaId]
      );
      if (parseInt(rows[0].count) > 0) {
        await client.query('ROLLBACK');
        throw new Error('User has already reviewed this media');
      }
      await client.query('INSERT INTO Review (user_id, media_id, content) VALUES ($1, $2, $3)', [userId, mediaId, content]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async voteOnReview(userId, reviewId, voteType) {
    await pool.query(`
      INSERT INTO ReviewVote (user_id, review_id, vote_type) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, review_id) DO UPDATE SET vote_type = EXCLUDED.vote_type
    `, [userId, reviewId, voteType]);
  }

  static async getAllReviewsForAdmin() {
    const { rows } = await pool.query(`
      SELECT r.review_id, r.content, u.username, m.title
      FROM Review r JOIN "User" u ON r.user_id = u.user_id
      JOIN Media m ON r.media_id = m.media_id
    `);
    return rows;
  }

  static async deleteReview(reviewId) {
    await pool.query('DELETE FROM Review WHERE review_id = $1', [reviewId]);
  }
}