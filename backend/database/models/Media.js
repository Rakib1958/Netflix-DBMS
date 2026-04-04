/**
 * Media model: TMDB-linked rows, create stub, admin poster/backdrop/trailer/metadata.
 */
import { pool } from '../config/db.js';

export class Media {
  static async findByTmdbId(tmdbId) {
    const { rows } = await pool.query('SELECT media_id FROM Media WHERE tmdb_id = $1', [String(tmdbId)]);
    return rows[0];
  }

  static async create(mediaData) {
    const { title, posterUrl, backdropUrl, releaseDate, rating, numVotes, tmdbId, tmdbData, mediaType } = mediaData;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        INSERT INTO Media (title, poster_url, backdrop_url, release_date, rating, num_votes, tmdb_id, tmdb_data, media_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING media_id
      `, [title, posterUrl, backdropUrl, releaseDate, rating, numVotes, tmdbId, tmdbData, mediaType]);
      await client.query('COMMIT');
      return rows[0].media_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAdminMetadata(tmdbId) {
    const { rows } = await pool.query(
      "SELECT admin_metadata, poster_url, backdrop_url, trailer_url FROM Media WHERE tmdb_id = $1",
      [tmdbId]
    );
    return rows[0];
  }

  static async updateMediaUrls(mediaId, updates) {
    const { posterUrl, backdropUrl, trailerUrl } = updates;
    if (posterUrl) {
      await pool.query('UPDATE Media SET poster_url = $1 WHERE media_id = $2', [posterUrl, mediaId]);
    }
    if (backdropUrl) {
      await pool.query('UPDATE Media SET backdrop_url = $1 WHERE media_id = $2', [backdropUrl, mediaId]);
    }
    if (trailerUrl) {
      await pool.query('UPDATE Media SET trailer_url = $1 WHERE media_id = $2', [trailerUrl, mediaId]);
    }
  }

  static async updateAdminMetadata(mediaId, metadata) {
    if (Object.keys(metadata).length > 0) {
      await pool.query(
        `UPDATE Media SET admin_metadata = COALESCE(admin_metadata, '{}'::jsonb) || $1::jsonb WHERE media_id = $2`,
        [JSON.stringify(metadata), mediaId]
      );
    }
  }

  static async getRatingStats(tmdbId) {
    const { rows } = await pool.query(
      'SELECT rating, num_votes FROM Media WHERE tmdb_id = $1',
      [String(tmdbId)]
    );
    return rows[0] || null;
  }
}