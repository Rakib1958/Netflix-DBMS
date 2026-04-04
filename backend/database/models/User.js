/**
 * User model: auth fields, profile, watchlist, admin ban/delete; uses pool + transactions where needed.
 */
import { pool } from '../config/db.js';
import { toDateOnlyString } from '../../utils/dateOnly.js';

export class User {
  // Authentication methods
  static async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
    return rows[0];
  }

  static async findByUsername(username) {
    const { rows } = await pool.query(
      'SELECT user_id AS _id, username, email, password_hash, role, is_verified, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login, is_banned, banned_until FROM "User" WHERE username = $1',
      [username]
    );
    return rows[0];
  }

  static async findById(userId) {
    const { rows } = await pool.query(
      'SELECT user_id AS _id, username, email, role, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login, is_banned, banned_until FROM "User" WHERE user_id = $1',
      [userId]
    );
    return rows[0];
  }

  static async findByVerificationToken(email, otp) {
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1 AND verification_token = $2', [email, otp]);
    return rows[0];
  }

  static async findByResetToken(email, otp) {
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1 AND reset_password_otp = $2', [email, otp]);
    return rows[0];
  }

  // User creation and updates
  static async create(userData) {
    const { username, email, passwordHash, role, verificationToken, verificationExpires, isVerified } = userData;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO "User" (username, email, password_hash, role, verification_token, verification_expires, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id',
        [username, email, passwordHash, role, verificationToken, verificationExpires, isVerified]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateProfile(userId, updates) {
    const { username, email, passwordHash, birthDate, countryCode } = updates;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (username) {
        await client.query('UPDATE "User" SET username = $1 WHERE user_id = $2', [username, userId]);
      }
      if (email) {
        await client.query('UPDATE "User" SET email = $1 WHERE user_id = $2', [email, userId]);
      }
      if (passwordHash) {
        await client.query('UPDATE "User" SET password_hash = $1 WHERE user_id = $2', [passwordHash, userId]);
      }
      if (birthDate) {
        await client.query('UPDATE "User" SET birth_date = $1 WHERE user_id = $2', [birthDate, userId]);
      }
      if (countryCode) {
        await client.query('UPDATE "User" SET country_code = $1 WHERE user_id = $2', [countryCode, userId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateProfilePicture(userId, relativeUrl) {
    await pool.query('UPDATE "User" SET profile_picture = $1 WHERE user_id = $2', [relativeUrl, userId]);
  }

  static async updateLastLogin(userId) {
    await pool.query('UPDATE "User" SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [userId]);
  }

  static async updateVerificationToken(email, otp, verificationExpires) {
    await pool.query('UPDATE "User" SET verification_token = $1, verification_expires = $2 WHERE email = $3', [otp, verificationExpires, email]);
  }

  static async verifyUser(email) {
    await pool.query('UPDATE "User" SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE email = $1', [email]);
  }

  static async updateResetToken(email, otp, expires) {
    await pool.query('UPDATE "User" SET reset_password_otp = $1, reset_password_expires = $2 WHERE email = $3', [otp, expires, email]);
  }

  static async resetPassword(email, hashedPassword) {
    await pool.query('UPDATE "User" SET password_hash = $1, reset_password_otp = NULL, reset_password_expires = NULL WHERE email = $2', [hashedPassword, email]);
  }

  // Admin methods
  static async getAllUsers() {
    const { rows } = await pool.query(
      'SELECT user_id, username, email, role, is_verified, is_banned, banned_until, registered_at, last_login FROM "User"'
    );
    return rows;
  }

  static async unbanUser(userId, adminRole) {
    const { rowCount } = await pool.query(
      'UPDATE "User" SET is_banned = FALSE, banned_until = NULL WHERE user_id = $1 AND role <> $2',
      [userId, adminRole]
    );
    return rowCount > 0;
  }

  static async banUser(userId, bannedUntil, adminRole) {
    const { rowCount } = await pool.query(
      'UPDATE "User" SET is_banned = TRUE, banned_until = $1 WHERE user_id = $2 AND role <> $3',
      [bannedUntil, userId, adminRole]
    );
    return rowCount > 0;
  }

  static async deleteUser(userId) {
    await pool.query('DELETE FROM "User" WHERE user_id = $1', [userId]);
  }

  // Watchlist methods
  static async getWatchlist(userId) {
    const { rows } = await pool.query(
      `SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes, m.plot_summary, m.media_type
       FROM Watchlist w
       JOIN Media m ON w.media_id = m.media_id
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: r.media_id,
      kind: r.media_type === 'series' ? 'series' : 'movie',
      title: r.title,
      poster_url: r.poster_url,
      backdrop_url: r.backdrop_url,
      poster_path: null,
      backdrop_path: null,
      release_date: toDateOnlyString(r.release_date),
      vote_average: r.rating != null ? parseFloat(r.rating) : 0,
      vote_count: r.num_votes != null ? parseInt(r.num_votes, 10) : 0,
      overview: r.plot_summary,
    }));
  }

  static async checkInWatchlist(userId, mediaId) {
    const { rowCount } = await pool.query('SELECT * FROM Watchlist WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);
    return rowCount > 0;
  }

  static async addToWatchlist(userId, mediaId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query('SELECT * FROM Watchlist WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);
      if (rowCount > 0) {
        await client.query('ROLLBACK');
        return false; // Already in watchlist
      }
      await client.query('INSERT INTO Watchlist (user_id, media_id) VALUES ($1, $2)', [userId, mediaId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async removeFromWatchlist(userId, mediaId) {
    await pool.query('DELETE FROM Watchlist WHERE user_id = $1 AND media_id = $2', [userId, mediaId]);
  }
}