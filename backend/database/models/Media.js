/**
 * Media model: catalog rows (movies + TV series), list/search/detail, admin CRUD, ratings metadata.
 */
import { pool } from '../config/db.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

export class Media {
  static async findByTmdbId(tmdbId) {
    const { rows } = await pool.query('SELECT media_id FROM Media WHERE tmdb_id = $1', [String(tmdbId)]);
    return rows[0];
  }

  static async findById(mediaId) {
    if (!isUuid(mediaId)) return null;
    const { rows } = await pool.query(
      `SELECT m.*, mv.tagline, mv.box_office_worldwide, mv.production_budget, mv.aspect_ratio
       FROM Media m
       INNER JOIN Movie mv ON mv.media_id = m.media_id
       WHERE m.media_id = $1 AND m.media_type = 'movie'`,
      [mediaId]
    );
    return rows[0] || null;
  }

  static async findSeriesById(mediaId) {
    if (!isUuid(mediaId)) return null;
    const { rows } = await pool.query(
      `SELECT m.*, tv.total_seasons, tv.total_episodes, tv.series_start, tv.series_end, tv.status
       FROM Media m
       INNER JOIN TVSeries tv ON tv.media_id = m.media_id
       WHERE m.media_id = $1 AND m.media_type = 'series'`,
      [mediaId]
    );
    return rows[0] || null;
  }

  static async findSummaryById(mediaId) {
    if (!isUuid(mediaId)) return null;
    const { rows } = await pool.query(
      `SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.release_year,
              m.rating, m.num_votes, m.plot_summary, m.media_type
       FROM Media m WHERE m.media_id = $1`,
      [mediaId]
    );
    return rows[0] || null;
  }

  /** Count rows that appear in the movie catalog (Media + Movie). */
  static async countCatalogMovies() {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM Media m INNER JOIN Movie mv ON mv.media_id = m.media_id WHERE m.media_type = 'movie'`
    );
    return rows[0]?.c ?? 0;
  }

  /** Count TV series in catalog (Media + TVSeries). */
  static async countCatalogSeries() {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM Media m INNER JOIN TVSeries tv ON tv.media_id = m.media_id WHERE m.media_type = 'series'`
    );
    return rows[0]?.c ?? 0;
  }

  static async getGenresForMedia(mediaId) {
    const { rows } = await pool.query(
      `SELECT g.genre_id, g.name
       FROM Genre g
       INNER JOIN MediaGenre mg ON mg.genre_id = g.genre_id
       WHERE mg.media_id = $1
       ORDER BY g.name`,
      [mediaId]
    );
    return rows;
  }

  /**
   * @param {{ title, posterUrl, backdropUrl, releaseDate, rating, numVotes, tmdbId, tmdbData, mediaType }} mediaData
   */
  static async create(mediaData) {
    const { title, posterUrl, backdropUrl, releaseDate, rating, numVotes, tmdbId, tmdbData, mediaType } = mediaData;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        INSERT INTO Media (title, poster_url, backdrop_url, release_date, rating, num_votes, tmdb_id, tmdb_data, media_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING media_id
      `,
        [title, posterUrl, backdropUrl, releaseDate, rating, numVotes, tmdbId, tmdbData, mediaType]
      );
      await client.query('COMMIT');
      return rows[0].media_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a movie in Media + Movie, optional genre names (links existing or creates Genre rows).
   */
  static async createMovie(payload) {
    const {
      title,
      plotSummary,
      releaseDate,
      releaseYear,
      runtimeMinutes,
      originalLanguage,
      posterUrl,
      backdropUrl,
      trailerUrl,
      tagline,
      boxOfficeWorldwide,
      productionBudget,
      aspectRatio,
      genreNames,
      initialRating,
      initialNumVotes,
      tmdbId,
      tmdbData,
    } = payload;

    const ratingVal =
      initialRating != null && Number.isFinite(Number(initialRating))
        ? Math.min(10, Math.max(0, Number(initialRating)))
        : 0;
    const votesVal =
      initialNumVotes != null && Number.isFinite(Number(initialNumVotes))
        ? Math.max(0, Math.floor(Number(initialNumVotes)))
        : 0;
    const tmdbJson = tmdbData != null ? JSON.stringify(tmdbData) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: mediaRows } = await client.query(
        `
        INSERT INTO Media (
          title, plot_summary, release_date, release_year, runtime_minutes, original_language,
          poster_url, backdrop_url, trailer_url, media_type, rating, num_votes, tmdb_id, tmdb_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'movie', $10, $11, $12, $13::jsonb)
        RETURNING media_id
      `,
        [
          title,
          plotSummary || null,
          releaseDate || null,
          releaseYear != null ? releaseYear : null,
          runtimeMinutes != null ? runtimeMinutes : null,
          originalLanguage || null,
          posterUrl || null,
          backdropUrl || null,
          trailerUrl || null,
          ratingVal,
          votesVal,
          tmdbId != null ? String(tmdbId) : null,
          tmdbJson,
        ]
      );
      const mediaId = mediaRows[0].media_id;

      await client.query(
        `
        INSERT INTO Movie (media_id, tagline, box_office_worldwide, production_budget, aspect_ratio)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [mediaId, tagline || null, boxOfficeWorldwide ?? null, productionBudget ?? null, aspectRatio || null]
      );

      const names = Array.isArray(genreNames) ? genreNames : [];
      for (const raw of names) {
        const name = String(raw || '').trim();
        if (!name) continue;
        await client.query(
          `INSERT INTO Genre (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
          [name]
        );
        const { rows: g } = await client.query(`SELECT genre_id FROM Genre WHERE name = $1`, [name]);
        if (g[0]) {
          await client.query(
            `INSERT INTO MediaGenre (media_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [mediaId, g[0].genre_id]
          );
        }
      }

      await client.query('COMMIT');
      return mediaId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a TV series (Media + TVSeries). Use tmdbId like "tv-94997" to avoid clashing with movie TMDB ids.
   */
  static async createTvSeries(payload) {
    const {
      title,
      plotSummary,
      releaseDate,
      releaseYear,
      runtimeMinutes,
      originalLanguage,
      posterUrl,
      backdropUrl,
      trailerUrl,
      genreNames,
      initialRating,
      initialNumVotes,
      tmdbId,
      tmdbData,
      totalSeasons,
      totalEpisodes,
      seriesStart,
      seriesEnd,
      status,
    } = payload;

    const ratingVal =
      initialRating != null && Number.isFinite(Number(initialRating))
        ? Math.min(10, Math.max(0, Number(initialRating)))
        : 0;
    const votesVal =
      initialNumVotes != null && Number.isFinite(Number(initialNumVotes))
        ? Math.max(0, Math.floor(Number(initialNumVotes)))
        : 0;
    const tmdbJson = tmdbData != null ? JSON.stringify(tmdbData) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: mediaRows } = await client.query(
        `
        INSERT INTO Media (
          title, plot_summary, release_date, release_year, runtime_minutes, original_language,
          poster_url, backdrop_url, trailer_url, media_type, rating, num_votes, tmdb_id, tmdb_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'series', $10, $11, $12, $13::jsonb)
        RETURNING media_id
      `,
        [
          title,
          plotSummary || null,
          releaseDate || null,
          releaseYear != null ? releaseYear : null,
          runtimeMinutes != null ? runtimeMinutes : null,
          originalLanguage || null,
          posterUrl || null,
          backdropUrl || null,
          trailerUrl || null,
          ratingVal,
          votesVal,
          tmdbId != null ? String(tmdbId) : null,
          tmdbJson,
        ]
      );
      const mediaId = mediaRows[0].media_id;

      await client.query(
        `
        INSERT INTO TVSeries (media_id, total_seasons, total_episodes, series_start, series_end, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          mediaId,
          totalSeasons != null ? Math.max(0, Math.floor(Number(totalSeasons))) : 0,
          totalEpisodes != null ? Math.max(0, Math.floor(Number(totalEpisodes))) : 0,
          seriesStart || null,
          seriesEnd || null,
          status || 'ongoing',
        ]
      );

      const names = Array.isArray(genreNames) ? genreNames : [];
      for (const raw of names) {
        const name = String(raw || '').trim();
        if (!name) continue;
        await client.query(`INSERT INTO Genre (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
        const { rows: g } = await client.query(`SELECT genre_id FROM Genre WHERE name = $1`, [name]);
        if (g[0]) {
          await client.query(
            `INSERT INTO MediaGenre (media_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [mediaId, g[0].genre_id]
          );
        }
      }

      await client.query('COMMIT');
      return mediaId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateMovie(mediaId, payload) {
    if (!isUuid(mediaId)) throw new Error('Invalid media id');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fields = [];
      const vals = [];
      let i = 1;

      const map = {
        title: payload.title,
        plot_summary: payload.plotSummary,
        release_date: payload.releaseDate,
        release_year: payload.releaseYear,
        runtime_minutes: payload.runtimeMinutes,
        original_language: payload.originalLanguage,
        poster_url: payload.posterUrl,
        backdrop_url: payload.backdropUrl,
        trailer_url: payload.trailerUrl,
      };
      for (const [col, v] of Object.entries(map)) {
        if (v !== undefined) {
          fields.push(`${col} = $${i++}`);
          vals.push(v);
        }
      }
      if (fields.length) {
        vals.push(mediaId);
        await client.query(`UPDATE Media SET ${fields.join(', ')} WHERE media_id = $${i}`, vals);
      }

      const mvFields = [];
      const mvVals = [];
      let j = 1;
      const mvMap = {
        tagline: payload.tagline,
        box_office_worldwide: payload.boxOfficeWorldwide,
        production_budget: payload.productionBudget,
        aspect_ratio: payload.aspectRatio,
      };
      for (const [col, v] of Object.entries(mvMap)) {
        if (v !== undefined) {
          mvFields.push(`${col} = $${j++}`);
          mvVals.push(v);
        }
      }
      if (mvFields.length) {
        mvVals.push(mediaId);
        await client.query(`UPDATE Movie SET ${mvFields.join(', ')} WHERE media_id = $${j}`, mvVals);
      }

      if (payload.genreNames !== undefined) {
        await client.query(`DELETE FROM MediaGenre WHERE media_id = $1`, [mediaId]);
        const names = Array.isArray(payload.genreNames) ? payload.genreNames : [];
        for (const raw of names) {
          const name = String(raw || '').trim();
          if (!name) continue;
          await client.query(`INSERT INTO Genre (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
          const { rows: g } = await client.query(`SELECT genre_id FROM Genre WHERE name = $1`, [name]);
          if (g[0]) {
            await client.query(
              `INSERT INTO MediaGenre (media_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [mediaId, g[0].genre_id]
            );
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteMovie(mediaId) {
    if (!isUuid(mediaId)) throw new Error('Invalid media id');
    const { rowCount } = await pool.query(`DELETE FROM Media WHERE media_id = $1`, [mediaId]);
    return rowCount > 0;
  }

  static async listMovies({ section = 'all', genre = '', limit = 30, mediaType = 'movie' } = {}) {
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 30, 1), 100);
    const params = [];
    let where = [`m.media_type = $1`];
    params.push(mediaType);

    const g = String(genre || '').trim();
    if (g) {
      params.push(`%${g}%`);
      where.push(
        `EXISTS (SELECT 1 FROM MediaGenre mg JOIN Genre gn ON gn.genre_id = mg.genre_id WHERE mg.media_id = m.media_id AND gn.name ILIKE $${params.length})`
      );
    }

    let orderBy = 'm.created_at DESC';
    switch (section) {
      case 'popular':
        orderBy = 'm.num_votes DESC NULLS LAST, m.created_at DESC';
        break;
      case 'top_rated':
        orderBy = 'm.rating DESC NULLS LAST, m.num_votes DESC NULLS LAST';
        break;
      case 'upcoming':
        where.push(`m.release_date IS NOT NULL AND m.release_date > CURRENT_DATE`);
        orderBy = 'm.release_date ASC NULLS LAST';
        break;
      case 'now_playing':
        where.push(
          `m.release_date IS NOT NULL AND m.release_date <= CURRENT_DATE AND m.release_date >= CURRENT_DATE - INTERVAL '1 year'`
        );
        orderBy = 'm.release_date DESC NULLS LAST';
        break;
      case 'new':
        orderBy = 'm.created_at DESC';
        break;
      case 'all':
      default:
        orderBy = 'm.title ASC';
        break;
    }

    const sql = `
      SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes, m.plot_summary
      FROM Media m
      INNER JOIN Movie mv ON mv.media_id = m.media_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${lim}
    `;
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  static async listSeries({ section = 'all', genre = '', limit = 30 } = {}) {
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 30, 1), 100);
    const params = [];
    let where = [`m.media_type = 'series'`];

    const g = String(genre || '').trim();
    if (g) {
      params.push(`%${g}%`);
      where.push(
        `EXISTS (SELECT 1 FROM MediaGenre mg JOIN Genre gn ON gn.genre_id = mg.genre_id WHERE mg.media_id = m.media_id AND gn.name ILIKE $${params.length})`
      );
    }

    let orderBy = 'm.created_at DESC';
    switch (section) {
      case 'popular':
        orderBy = 'm.num_votes DESC NULLS LAST, m.created_at DESC';
        break;
      case 'top_rated':
        orderBy = 'm.rating DESC NULLS LAST, m.num_votes DESC NULLS LAST';
        break;
      case 'upcoming':
        where.push(`m.release_date IS NOT NULL AND m.release_date > CURRENT_DATE`);
        orderBy = 'm.release_date ASC NULLS LAST';
        break;
      case 'now_playing':
        where.push(
          `m.release_date IS NOT NULL AND m.release_date <= CURRENT_DATE AND m.release_date >= CURRENT_DATE - INTERVAL '1 year'`
        );
        orderBy = 'm.release_date DESC NULLS LAST';
        break;
      case 'new':
        orderBy = 'm.created_at DESC';
        break;
      case 'all':
      default:
        orderBy = 'm.title ASC';
        break;
    }

    const sql = `
      SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes, m.plot_summary
      FROM Media m
      INNER JOIN TVSeries tv ON tv.media_id = m.media_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${lim}
    `;
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  static async searchMovies(query, limit = 40) {
    const q = String(query || '').trim();
    if (!q) return [];
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 40, 1), 100);
    const { rows } = await pool.query(
      `
      SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes, m.plot_summary
      FROM Media m
      INNER JOIN Movie mv ON mv.media_id = m.media_id
      WHERE m.media_type = 'movie'
        AND (m.title ILIKE $1 OR m.plot_summary ILIKE $1)
      ORDER BY m.title ASC
      LIMIT $2
    `,
      [`%${q}%`, lim]
    );
    return rows;
  }

  /** Search movies and TV series; each row includes catalog_kind: 'movie' | 'series'. */
  static async searchCatalog(query, limit = 40) {
    const q = String(query || '').trim();
    if (!q) return [];
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 40, 1), 100);
    const { rows } = await pool.query(
      `
      SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes, m.plot_summary,
             m.media_type AS catalog_kind
      FROM Media m
      WHERE m.media_type IN ('movie', 'series')
        AND (
          (m.media_type = 'movie' AND EXISTS (SELECT 1 FROM Movie mv WHERE mv.media_id = m.media_id))
          OR (m.media_type = 'series' AND EXISTS (SELECT 1 FROM TVSeries tv WHERE tv.media_id = m.media_id))
        )
        AND (m.title ILIKE $1 OR m.plot_summary ILIKE $1)
      ORDER BY m.title ASC
      LIMIT $2
    `,
      [`%${q}%`, lim]
    );
    return rows;
  }

  /** Best-effort title match for AI recommendations: prefers movie, then series. */
  static async matchTitles(titles) {
    const list = Array.isArray(titles) ? titles : [];
    const out = [];
    for (const t of list) {
      const raw = String(t || '').trim();
      if (!raw) {
        out.push(null);
        continue;
      }
      const pat = `%${raw}%`;
      let { rows } = await pool.query(
        `
        SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes,
               'movie'::text AS catalog_kind
        FROM Media m
        INNER JOIN Movie mv ON mv.media_id = m.media_id
        WHERE m.media_type = 'movie' AND m.title ILIKE $1
        ORDER BY LENGTH(m.title) ASC
        LIMIT 1
      `,
        [pat]
      );
      if (rows[0]) {
        out.push(rows[0]);
        continue;
      }
      ({ rows } = await pool.query(
        `
        SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes,
               'series'::text AS catalog_kind
        FROM Media m
        INNER JOIN TVSeries tv ON tv.media_id = m.media_id
        WHERE m.media_type = 'series' AND m.title ILIKE $1
        ORDER BY LENGTH(m.title) ASC
        LIMIT 1
      `,
        [pat]
      ));
      out.push(rows[0] || null);
    }
    return out;
  }

  static async listRecommendations(mediaId, limit = 10) {
    if (!isUuid(mediaId)) return [];
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 30);
    const { rows: shared } = await pool.query(
      `
      SELECT DISTINCT m2.media_id, m2.title, m2.poster_url, m2.backdrop_url, m2.release_date, m2.rating, m2.num_votes
      FROM MediaGenre mg1
      JOIN MediaGenre mg2 ON mg1.genre_id = mg2.genre_id AND mg2.media_id <> mg1.media_id
      JOIN Media m2 ON m2.media_id = mg2.media_id
      INNER JOIN Movie mv2 ON mv2.media_id = m2.media_id
      WHERE mg1.media_id = $1 AND m2.media_type = 'movie'
      ORDER BY m2.num_votes DESC NULLS LAST
      LIMIT $2
    `,
      [mediaId, lim]
    );
    if (shared.length >= lim) return shared;
    const { rows: filler } = await pool.query(
      `
      SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes
      FROM Media m
      INNER JOIN Movie mv ON mv.media_id = m.media_id
      WHERE m.media_type = 'movie' AND m.media_id <> $1
      ORDER BY RANDOM()
      LIMIT $2
    `,
      [mediaId, lim - shared.length]
    );
    const seen = new Set(shared.map((r) => r.media_id));
    const merged = [...shared];
    for (const r of filler) {
      if (!seen.has(r.media_id)) {
        seen.add(r.media_id);
        merged.push(r);
      }
    }
    return merged.slice(0, lim);
  }

  static async listRecommendationsSeries(mediaId, limit = 10) {
    if (!isUuid(mediaId)) return [];
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 30);
    const { rows: shared } = await pool.query(
      `
      SELECT DISTINCT m2.media_id, m2.title, m2.poster_url, m2.backdrop_url, m2.release_date, m2.rating, m2.num_votes
      FROM MediaGenre mg1
      JOIN MediaGenre mg2 ON mg1.genre_id = mg2.genre_id AND mg2.media_id <> mg1.media_id
      JOIN Media m2 ON m2.media_id = mg2.media_id
      INNER JOIN TVSeries tv2 ON tv2.media_id = m2.media_id
      WHERE mg1.media_id = $1 AND m2.media_type = 'series'
      ORDER BY m2.num_votes DESC NULLS LAST
      LIMIT $2
    `,
      [mediaId, lim]
    );
    if (shared.length >= lim) return shared;
    const { rows: filler } = await pool.query(
      `
      SELECT m.media_id, m.title, m.poster_url, m.backdrop_url, m.release_date, m.rating, m.num_votes
      FROM Media m
      INNER JOIN TVSeries tv ON tv.media_id = m.media_id
      WHERE m.media_type = 'series' AND m.media_id <> $1
      ORDER BY RANDOM()
      LIMIT $2
    `,
      [mediaId, lim - shared.length]
    );
    const seen = new Set(shared.map((r) => r.media_id));
    const merged = [...shared];
    for (const r of filler) {
      if (!seen.has(r.media_id)) {
        seen.add(r.media_id);
        merged.push(r);
      }
    }
    return merged.slice(0, lim);
  }

  static async listAllForAdmin() {
    const { rows } = await pool.query(
      `
      SELECT m.media_id, m.title, m.release_date, m.created_at, m.poster_url, m.media_type
      FROM Media m
      WHERE EXISTS (SELECT 1 FROM Movie mv WHERE mv.media_id = m.media_id)
         OR EXISTS (SELECT 1 FROM TVSeries tv WHERE tv.media_id = m.media_id)
      ORDER BY m.created_at DESC
    `
    );
    return rows;
  }

  static async getAdminMetadata(tmdbId) {
    const { rows } = await pool.query(
      'SELECT admin_metadata, poster_url, backdrop_url, trailer_url FROM Media WHERE tmdb_id = $1',
      [tmdbId]
    );
    return rows[0];
  }

  static async getAdminMetadataByMediaId(mediaId) {
    if (!isUuid(mediaId)) return null;
    const { rows } = await pool.query(
      'SELECT admin_metadata, poster_url, backdrop_url, trailer_url FROM Media WHERE media_id = $1',
      [mediaId]
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
    const { rows } = await pool.query('SELECT rating, num_votes FROM Media WHERE tmdb_id = $1', [String(tmdbId)]);
    return rows[0] || null;
  }

  static async getRatingStatsByMediaId(mediaId) {
    if (!isUuid(mediaId)) return null;
    const { rows } = await pool.query('SELECT rating, num_votes FROM Media WHERE media_id = $1', [mediaId]);
    return rows[0] || null;
  }
}
