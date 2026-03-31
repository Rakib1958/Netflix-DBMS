import "./config/loadEnv.js";
import express from "express";
import path from "path";
import fs from "fs";
import { connectToDB, pool } from "./config/db.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import multer from "multer";
import { sendTransactionalEmail, isEmailConfigured } from "./utils/mailer.js";
import { signupVerificationEmail, passwordResetEmail } from "./utils/emailTemplates.js";
import { GoogleGenAI } from "@google/genai";
import { redactEmail, safeError, safeInfo, sanitizeForLog } from "./utils/rotation.js";

const JWT_SECRET = process.env.JWT_SECRET?.trim();
if (!JWT_SECRET) {
  safeError(
    "\n[x] Missing JWT_SECRET in backend/.env\n    Add JWT_SECRET (long random string, server-only).\n"
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

const TMDB_TOKEN = process.env.TMDB_TOKEN?.trim();
const TMDB_API_KEY = process.env.TMDB_API_KEY?.trim();
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const uploadDir = path.join(path.resolve(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      callback(null, origin);
    },
    credentials: true,
  })
);
app.use('/uploads', express.static(uploadDir));

app.get(/^\/api\/tmdb\/(.+)$/, async (req, res) => {
  try {
    if (!TMDB_TOKEN && !TMDB_API_KEY) {
      return res.status(503).json({
        message: "TMDB is not configured. Set TMDB_TOKEN (v4) or TMDB_API_KEY (v3) in backend/.env",
      });
    }

    const tmdbPath = req.params?.[0] || "";
    if (
      tmdbPath.includes("..") ||
      tmdbPath.includes("\\") ||
      tmdbPath.startsWith("http") ||
      tmdbPath.includes("://")
    ) {
      return res.status(400).json({ message: "Invalid TMDB path" });
    }

    const allowedPrefixes = [
      "movie/",
      "search/",
      "discover/",
      "trending/",
      "genre/",
      "tv/",
      "person/",
      "configuration/",
    ];
    if (!allowedPrefixes.some((p) => tmdbPath.startsWith(p))) {
      return res.status(403).json({ message: "TMDB path not allowed" });
    }

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }

    const isJwtLike = !!TMDB_TOKEN && /^eyJ[A-Za-z0-9_-]+\./.test(TMDB_TOKEN);
    const effectiveApiKey = TMDB_API_KEY || (!isJwtLike ? TMDB_TOKEN : null);
    if (effectiveApiKey) {
      qs.set("api_key", effectiveApiKey);
    }

    const url = `${TMDB_BASE_URL}/${tmdbPath}${qs.toString() ? `?${qs.toString()}` : ""}`;

    const useBearer = isJwtLike;
    const tmdbRes = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(useBearer ? { Authorization: `Bearer ${TMDB_TOKEN}` } : {}),
      },
    });

    const contentType = tmdbRes.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await tmdbRes.json()
      : await tmdbRes.text();

    return res.status(tmdbRes.status).json(body);
  } catch (err) {
    safeError("tmdb proxy error:", sanitizeForLog({
      path: req?.params?.[0],
      message: err?.message || String(err),
    }));
    return res.status(500).json({ message: "Failed to reach TMDB" });
  }
});

const ensureDynamicColumns = async () => {
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
};

const liftExpiredBanIfNeeded = async (userRow) => {
  if (!userRow) return userRow;
  const userId = userRow._id ?? userRow.user_id;
  if (userRow.is_banned && userRow.banned_until != null && userRow.banned_until <= Date.now()) {
    await pool.query('UPDATE "User" SET is_banned = FALSE, banned_until = NULL WHERE user_id = $1', [userId]);
    userRow.is_banned = false;
    userRow.banned_until = null;
  }
  return userRow;
};

const banBlockedMessage = (userRow) =>
  userRow?.banned_until == null
    ? "Account suspended"
    : `Account suspended until ${new Date(userRow.banned_until).toISOString()}`;

const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Not authorized" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT user_id AS _id, username, email, role, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login, is_banned, banned_until FROM "User" WHERE user_id = $1',
      [decoded.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });
    await liftExpiredBanIfNeeded(user);
    if (user.is_banned) return res.status(403).json({ message: banBlockedMessage(user) });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

const adminRoute = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ message: "Not authorized" });
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await pool.query('SELECT user_id, role FROM "User" WHERE user_id = $1', [decoded.id]);
        if (!rows[0] || rows[0].role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }
        next();
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
};

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    await ensureDynamicColumns();
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
    if (!rows[0]) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;

    await pool.query('UPDATE "User" SET reset_password_otp = $1, reset_password_expires = $2 WHERE email = $3', [otp, expires, email]);

    if (!isEmailConfigured()) {
      return res
        .status(503)
        .json({ message: "Email is not configured. Set EMAIL_USER and EMAIL_PASS in backend/.env" });
    }
    const { subject, text, html } = passwordResetEmail({ otp });
    await sendTransactionalEmail({ to: email, subject, text, html });
    res.status(200).json({ message: "OTP sent to your email." });
  } catch (error) {
    safeError("forgot-password:", error);
    res.status(500).json({ message: error.message || "Failed to send email" });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1 AND reset_password_otp = $2', [email, otp]);
    if (!rows[0] || rows[0].reset_password_expires < Date.now()) return res.status(400).json({ message: "Invalid/expired OTP" });
    res.status(200).json({ message: "OTP verified" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post("/api/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1 AND reset_password_otp = $2', [email, otp]);
    if (!rows[0] || rows[0].reset_password_expires < Date.now()) return res.status(400).json({ message: "Invalid/expired OTP" });

    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    await pool.query('UPDATE "User" SET password_hash = $1, reset_password_otp = NULL, reset_password_expires = NULL WHERE email = $2', [hashedPassword, email]);
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.put("/api/update-profile", protectRoute, async (req, res) => {
  const { username, email, password, birth_date, country_code } = req.body;
  try {
    if (username) await pool.query('UPDATE "User" SET username = $1 WHERE user_id = $2', [username, req.user._id]);
    if (email) await pool.query('UPDATE "User" SET email = $1 WHERE user_id = $2', [email, req.user._id]);
    if (password) {
        const hash = await bcryptjs.hash(password, 10);
        await pool.query('UPDATE "User" SET password_hash = $1 WHERE user_id = $2', [hash, req.user._id]);
    }
    if (birth_date !== undefined) {
      const bd = birth_date === "" || birth_date === null ? null : birth_date;
      await pool.query('UPDATE "User" SET birth_date = $1 WHERE user_id = $2', [bd, req.user._id]);
    }
    if (country_code !== undefined) {
      let cc = country_code === "" || country_code === null ? null : String(country_code).trim().toUpperCase();
      if (cc !== null && cc.length !== 2) {
        return res.status(400).json({ message: "country_code must be a 2-letter ISO code (e.g. US, BD) or empty." });
      }
      await pool.query('UPDATE "User" SET country_code = $1 WHERE user_id = $2', [cc, req.user._id]);
    }

    const { rows } = await pool.query(
      'SELECT user_id AS _id, username, email, role, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login FROM "User" WHERE user_id = $1',
      [req.user._id]
    );
    const wlRows = await pool.query('SELECT m.tmdb_data FROM Watchlist w JOIN Media m ON w.media_id = m.media_id WHERE w.user_id = $1', [req.user._id]);
    res.status(200).json({ user: { ...rows[0], watchlist: wlRows.rows.map(r => r.tmdb_data) }, message: "Profile updated" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post("/api/upload-profile-pic", protectRoute, upload.single("profilePic"), async (req, res) => {
   try {
       if (!req.file) return res.status(400).json({ message: "No file uploaded" });
       const relativeUrl = `/uploads/${req.file.filename}`;
       await pool.query('UPDATE "User" SET profile_picture = $1 WHERE user_id = $2', [relativeUrl, req.user._id]);
       res.status(200).json({ message: "Profile picture uploaded", url: relativeUrl });
   } catch(err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/signup", async (req, res) => {
  const { username, email, password, adminCode } = req.body;
  try {
    if (!username || !email || !password) throw new Error("All fields are required!");
    await ensureDynamicColumns();

    if ((await pool.query('SELECT * FROM "User" WHERE email = $1', [email])).rowCount > 0) return res.status(400).json({ message: "User already exists." });
    if ((await pool.query('SELECT * FROM "User" WHERE username = $1', [username])).rowCount > 0) return res.status(400).json({ message: "Username taken." });

    const hashedPassword = await bcryptjs.hash(password, 10);
    const verificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000;

    let role = 'user';
    if (adminCode && adminCode === (process.env.ADMIN_SECRET || 'mysecretadmincode')) { role = 'admin'; }

    await pool.query(
        'INSERT INTO "User" (username, email, password_hash, role, verification_token, verification_expires, is_verified) VALUES ($1, $2, $3, $4, $5, $6, FALSE)',
        [username, email, hashedPassword, role, verificationOtp, verificationExpires]
    );

    if (!isEmailConfigured()) {
      return res
        .status(503)
        .json({ message: "Email is not configured. Set EMAIL_USER and EMAIL_PASS in backend/.env" });
    }
    const { subject, text, html } = signupVerificationEmail({ otp: verificationOtp });
    await sendTransactionalEmail({ to: email, subject, text, html });

    res.status(200).json({ message: "Signup successful. Check your email for the verification code." });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post("/api/resend-verification", async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) return res.status(400).json({ message: "Email is required" });
    await ensureDynamicColumns();
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
    if (!rows[0]) return res.status(404).json({ message: "No account with this email." });
    if (rows[0].is_verified) return res.status(400).json({ message: "Account is already verified." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await pool.query('UPDATE "User" SET verification_token = $1, verification_expires = $2 WHERE email = $3', [otp, verificationExpires, email]);

    if (!isEmailConfigured()) {
      return res
        .status(503)
        .json({ message: "Email is not configured. Set EMAIL_USER and EMAIL_PASS in backend/.env" });
    }
    const { subject, text, html } = signupVerificationEmail({ otp });
    await sendTransactionalEmail({ to: email, subject, text, html });
    res.status(200).json({ message: "A new verification code was sent to your email." });
  } catch (error) {
    safeError("resend-verification:", error);
    res.status(500).json({ message: error.message || "Failed to send" });
  }
});

app.post("/api/verify-email", async (req, res) => {
  const { email, otp } = req.body;
  try {
     await ensureDynamicColumns();
     const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1 AND verification_token = $2', [email, otp]);
     const userDoc = rows[0];
     if (!userDoc) return res.status(400).json({ message: "Invalid verification code" });
     if (userDoc.verification_expires != null && userDoc.verification_expires < Date.now()) {
       return res.status(400).json({ message: "Code expired. Use “Resend code” to get a new one." });
     }

     await pool.query('UPDATE "User" SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE email = $1', [email]);
     
    const token = jwt.sign({ id: userDoc.user_id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
     
     res.status(200).json({
         user: {
           _id: userDoc.user_id,
           username: userDoc.username,
           email: userDoc.email,
           profilePic: userDoc.profile_picture,
           role: userDoc.role,
           birth_date: userDoc.birth_date,
           country_code: userDoc.country_code,
           registered_at: userDoc.registered_at,
           last_login: userDoc.last_login,
           watchlist: [],
         },
         message: "Account Verified Successfully."
     });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    await ensureDynamicColumns();
    const { rows } = await pool.query(
      'SELECT user_id AS _id, username, email, password_hash, role, is_verified, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login, is_banned, banned_until FROM "User" WHERE username = $1',
      [username]
    );
    const userDoc = rows[0];
    
    if (!userDoc || !bcryptjs.compareSync(password, userDoc.password_hash)) {
      return res.status(400).json({ message: "Invalid credentials." });
    }
    await liftExpiredBanIfNeeded(userDoc);
    if (userDoc.is_banned) return res.status(403).json({ message: banBlockedMessage(userDoc) });
    if (userDoc.is_verified === false) return res.status(403).json({ message: "Email not verified. Please verify." });

    await pool.query('UPDATE "User" SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [userDoc._id]);

    const token = jwt.sign({ id: userDoc._id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    
    delete userDoc.password_hash;
    const { rows: freshRows } = await pool.query(
      'SELECT user_id AS _id, username, email, role, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login, is_banned FROM "User" WHERE user_id = $1',
      [userDoc._id]
    );
    Object.assign(userDoc, freshRows[0]);
    delete userDoc.is_banned;
    const wlRows = await pool.query('SELECT m.tmdb_data FROM Watchlist w JOIN Media m ON w.media_id = m.media_id WHERE w.user_id = $1', [userDoc._id]);
    userDoc.watchlist = wlRows.rows.map(r => r.tmdb_data);

    res.status(200).json({ user: userDoc, message: "Logged in successfully." });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.get("/api/fetch-user", async (req, res) => {
  const { token } = req.cookies;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT user_id AS _id, username, email, role, profile_picture AS "profilePic", birth_date, country_code, registered_at, last_login, is_banned, banned_until FROM "User" WHERE user_id = $1',
      [decoded.id]
    );
    const userDoc = rows[0];
    if (!userDoc) return res.status(400).json({ message: "No user found." });
    await liftExpiredBanIfNeeded(userDoc);
    if (userDoc.is_banned) {
      res.clearCookie("token");
      return res.status(403).json({ message: banBlockedMessage(userDoc) });
    }
    
    delete userDoc.is_banned;
    const wlRows = await pool.query('SELECT m.tmdb_data FROM Watchlist w JOIN Media m ON w.media_id = m.media_id WHERE w.user_id = $1', [userDoc._id]);
    userDoc.watchlist = wlRows.rows.map(r => r.tmdb_data);

    res.status(200).json({ user: userDoc });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out" });
});

app.get("/api/watchlist", protectRoute, async (req, res) => {
  try {
      const { rows } = await pool.query('SELECT m.tmdb_data FROM Watchlist w JOIN Media m ON w.media_id = m.media_id WHERE w.user_id = $1', [req.user._id]);
      res.status(200).json({ watchlist: rows.map(r => r.tmdb_data) });
  } catch (err) { res.status(200).json({ watchlist: [] }); }
});

const ensureMediaStub = async (movie) => {
    let mediaRes = await pool.query('SELECT media_id FROM Media WHERE tmdb_id = $1', [String(movie.id)]);
    if (mediaRes.rowCount === 0) {
        const insertRes = await pool.query(`
            INSERT INTO Media (title, poster_url, backdrop_url, release_date, rating, num_votes, tmdb_id, tmdb_data, media_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'movie') RETURNING media_id
        `, [movie.title || movie.name, movie.poster_path, movie.backdrop_path, movie.release_date || movie.first_air_date || null, movie.vote_average || 0, movie.vote_count || 0, String(movie.id), movie]);
        return insertRes.rows[0].media_id;
    }
    return mediaRes.rows[0].media_id;
};

app.post("/api/watchlist/add", protectRoute, async (req, res) => {
  try {
    await ensureDynamicColumns();
    const mediaId = await ensureMediaStub(req.body.movie);
    
    if ((await pool.query('SELECT * FROM Watchlist WHERE user_id = $1 AND media_id = $2', [req.user._id, mediaId])).rowCount > 0) {
        return res.status(400).json({ message: "Movie already in watchlist" });
    }
    await pool.query('INSERT INTO Watchlist (user_id, media_id) VALUES ($1, $2)', [req.user._id, mediaId]);
    
    const wlRows = await pool.query('SELECT m.tmdb_data FROM Watchlist w JOIN Media m ON w.media_id = m.media_id WHERE w.user_id = $1', [req.user._id]);
    res.status(200).json({ watchlist: wlRows.rows.map(r => r.tmdb_data), message: "Added" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.delete("/api/watchlist/remove/:id", protectRoute, async (req, res) => {
  try {
    const mediaRes = await pool.query('SELECT media_id FROM Media WHERE tmdb_id = $1', [String(req.params.id)]);
    if (mediaRes.rowCount > 0) {
        await pool.query('DELETE FROM Watchlist WHERE user_id = $1 AND media_id = $2', [req.user._id, mediaRes.rows[0].media_id]);
    }
    const wlRows = await pool.query('SELECT m.tmdb_data FROM Watchlist w JOIN Media m ON w.media_id = m.media_id WHERE w.user_id = $1', [req.user._id]);
    res.status(200).json({ watchlist: wlRows.rows.map(r => r.tmdb_data), message: "Removed" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get("/api/media/:tmdbId/admin-meta", async (req, res) => {
    try {
        await ensureDynamicColumns();
        const { rows } = await pool.query(
            "SELECT admin_metadata, poster_url, backdrop_url, trailer_url FROM Media WHERE tmdb_id = $1",
            [String(req.params.tmdbId)]
        );
        if (rows.length === 0) {
            return res.status(200).json({
                admin_metadata: null,
                poster_url: null,
                backdrop_url: null,
                trailer_url: null,
            });
        }
        const row = rows[0];
        res.status(200).json({
            admin_metadata: row.admin_metadata || {},
            poster_url: row.poster_url || null,
            backdrop_url: row.backdrop_url || null,
            trailer_url: row.trailer_url || null,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/media/:tmdbId/reviews", async (req, res) => {
    try {
        const mediaRes = await pool.query('SELECT media_id FROM Media WHERE tmdb_id = $1', [String(req.params.tmdbId)]);
        if(mediaRes.rowCount === 0) return res.status(200).json({ reviews: [] });
        
        const { rows } = await pool.query(`
            SELECT r.review_id, r.content, r.likes, r.dislikes, r.posted_at, u.username, u.profile_picture 
            FROM Review r JOIN "User" u ON r.user_id = u.user_id 
            WHERE r.media_id = $1 ORDER BY r.posted_at DESC
        `, [mediaRes.rows[0].media_id]);
        
        res.status(200).json({ reviews: rows });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/media/:tmdbId/reviews", protectRoute, async (req, res) => {
    try {
        const content = (req.body.content || "").trim();
        if (!content) return res.status(400).json({ message: "Review cannot be empty" });
        if (content.length > 5000) return res.status(400).json({ message: "Review is too long" });
        const mediaId = await ensureMediaStub(req.body.movie);
        await pool.query('INSERT INTO Review (user_id, media_id, content) VALUES ($1, $2, $3)', [req.user._id, mediaId, content]);
        const { rows } = await pool.query(`SELECT r.review_id, r.content, r.likes, r.dislikes, r.posted_at, u.username, u.profile_picture FROM Review r JOIN "User" u ON r.user_id = u.user_id WHERE r.media_id = $1 ORDER BY r.posted_at DESC`, [mediaId]);
        res.status(200).json({ reviews: rows, message: "Review posted" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/reviews/:reviewId/vote", protectRoute, async (req, res) => {
    try {
        await pool.query(`
            INSERT INTO ReviewVote (user_id, review_id, vote_type) VALUES ($1, $2, $3)
            ON CONFLICT (user_id, review_id) DO UPDATE SET vote_type = EXCLUDED.vote_type
        `, [req.user._id, req.params.reviewId, req.body.voteType]);
        res.status(200).json({ message: "Vote registered" }); 
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/media/:tmdbId/ratings", protectRoute, async (req, res) => {
    try {
        const mediaId = await ensureMediaStub(req.body.movie);
        await pool.query(`
            INSERT INTO Rating (user_id, media_id, rating_value) VALUES ($1, $2, $3)
            ON CONFLICT (user_id, media_id) DO UPDATE SET rating_value = EXCLUDED.rating_value
        `, [req.user._id, mediaId, req.body.rating]);
        res.status(200).json({ message: "Rating saved" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/admin/users", adminRoute, async (req, res) => {
    try {
        await ensureDynamicColumns();
        const { rows } = await pool.query(
          'SELECT user_id, username, email, role, is_verified, is_banned, banned_until, registered_at, last_login FROM "User"'
        );
        res.status(200).json({ users: rows });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/admin/users/:userId/ban", adminRoute, async (req, res) => {
    try {
        await ensureDynamicColumns();
        const { banned, durationHours, durationDays, until, permanent } = req.body || {};

        if (banned === false) {
          const { rowCount } = await pool.query(
            'UPDATE "User" SET is_banned = FALSE, banned_until = NULL WHERE user_id = $1 AND role <> $2',
            [req.params.userId, "admin"]
          );
          if (rowCount === 0) return res.status(404).json({ message: "User not found or cannot modify" });
          return res.status(200).json({ message: "Ban lifted" });
        }

        let bannedUntil = null;
        if (permanent === true) {
          bannedUntil = null;
        } else if (until) {
          const t = new Date(until).getTime();
          if (Number.isNaN(t) || t <= Date.now()) return res.status(400).json({ message: "Invalid `until` date" });
          bannedUntil = t;
        } else if (durationHours != null || durationDays != null) {
          const h = durationHours != null ? Number(durationHours) : Number(durationDays) * 24;
          if (!Number.isFinite(h) || h <= 0) return res.status(400).json({ message: "Invalid duration" });
          bannedUntil = Date.now() + Math.round(h * 60 * 60 * 1000);
        } else {
          bannedUntil = null;
        }

        const { rowCount } = await pool.query(
            'UPDATE "User" SET is_banned = TRUE, banned_until = $1 WHERE user_id = $2 AND role <> $3',
            [bannedUntil, req.params.userId, "admin"]
        );
        if (rowCount === 0) return res.status(404).json({ message: "User not found or cannot modify" });
        res.status(200).json({
          message: bannedUntil == null ? "User banned (permanent)" : `User banned until ${new Date(bannedUntil).toISOString()}`,
          banned_until: bannedUntil,
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/admin/users/:userId", adminRoute, async (req, res) => {
    try {
        await pool.query('DELETE FROM "User" WHERE user_id = $1', [req.params.userId]);
        res.status(200).json({ message: "User deleted" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/admin/reviews", adminRoute, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT r.review_id, r.content, u.username, m.title 
            FROM Review r 
            JOIN "User" u ON r.user_id = u.user_id 
            JOIN Media m ON r.media_id = m.media_id
            ORDER BY r.posted_at DESC
        `);
        res.status(200).json({ reviews: rows });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/admin/reviews/:reviewId", adminRoute, async (req, res) => {
    try {
        await pool.query('DELETE FROM Review WHERE review_id = $1', [req.params.reviewId]);
        res.status(200).json({ message: "Review removed" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/admin/media/:tmdbId/custom", adminRoute, async (req, res) => {
    try {
        await ensureDynamicColumns();
        const mediaId = await ensureMediaStub(req.body.movie);
        if (req.body.poster_url) await pool.query('UPDATE Media SET poster_url = $1 WHERE media_id = $2', [req.body.poster_url, mediaId]);
        if (req.body.backdrop_url) await pool.query('UPDATE Media SET backdrop_url = $1 WHERE media_id = $2', [req.body.backdrop_url, mediaId]);
        if (req.body.trailer_url) await pool.query('UPDATE Media SET trailer_url = $1 WHERE media_id = $2', [req.body.trailer_url, mediaId]);
        const metaPatch = {};
        if (req.body.awards !== undefined) metaPatch.awards = req.body.awards;
        if (req.body.secondary_info !== undefined) metaPatch.secondary_info = req.body.secondary_info;
        if (Object.keys(metaPatch).length > 0) {
            await pool.query(
                `UPDATE Media SET admin_metadata = COALESCE(admin_metadata, '{}'::jsonb) || $1::jsonb WHERE media_id = $2`,
                [JSON.stringify(metaPatch), mediaId]
            );
        }
        if (req.body.admin_metadata && typeof req.body.admin_metadata === "object") {
            await pool.query(
                `UPDATE Media SET admin_metadata = COALESCE(admin_metadata, '{}'::jsonb) || $1::jsonb WHERE media_id = $2`,
                [JSON.stringify(req.body.admin_metadata), mediaId]
            );
        }
        res.status(200).json({ message: "Media customized successfully" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/", (req, res) => { res.send("AIFlix Backend is Running!"); });

const config = {
  responseMimeType: "text/plain",
};

const DEFAULT_MODEL_CANDIDATES = ["gemini-2.0-flash-001", "gemini-2.0-flash"];

const aiCache = new Map(); 
const AI_CACHE_TTL_MS = 6 * 60 * 60 * 1000; 

function parseModelList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p?.text).filter(Boolean).join("") || "";
}

async function getAIRecommendation(prompt) {
  const cached = aiCache.get(prompt);
  if (cached && cached.expiresAt > Date.now() && cached.text) {
    return cached.text;
  }

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey || String(apiKey).trim() === "" || apiKey.includes("AIzaSyAjWA-EtxLo6kUnE7mlrbpi-UzUIXP4MBc")) {
    throw new Error("Missing `GOOGLE_GENAI_API_KEY` in `backend/.env`.");
  }

  const envModels = parseModelList(process.env.GEMINI_MODEL);
  const models = envModels.length > 0 ? envModels : DEFAULT_MODEL_CANDIDATES;

  const ai = new GoogleGenAI({ apiKey });
  const MAX_RETRIES = 2;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          config,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        const text = extractText(response);
        if (text) {
          aiCache.set(prompt, { expiresAt: Date.now() + AI_CACHE_TTL_MS, text });
          return text;
        }
        break;
      } catch (error) {
        const msg = error?.message || String(error);
        const isRateLimit = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
        const isModelNotFound = /404|not found|is not supported for generateContent/i.test(msg);

        if (isRateLimit && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          continue;
        }

        if (isRateLimit && i === models.length - 1) {
          throw new Error(
            "API rate limit exceeded. Please wait a moment and try again.");
        }

        if (isModelNotFound && i < models.length - 1) {
          break;
        }

        throw new Error(msg || "Failed to generate AI recommendations.");
      }
    }
  }

  throw new Error(
    "No Gemini model returned text. Set `GEMINI_MODEL` in `backend/.env` to a model your API key supports (comma-separated fallbacks)."
  );
}

app.post("/api/ai/recommendations", protectRoute, async (req, res) => {
  try {
    const { decade, genre, language, length, mood } = req.body;

    if (!decade || !genre || !language || !length || !mood) {
      return res.status(400).json({ message: "All recommendation parameters are required" });
    }

    const userPrompt = `Given the following user inputs:

- Decade: ${decade}
- Genre: ${genre}
- Language: ${language}
- Length: ${length}
- Mood: ${mood}

Recommend 10 ${mood.toLowerCase()} ${
      language
    }-language ${genre.toLowerCase()} movies released in the ${
      decade
    } with a runtime between ${
      length
    }. Return the list as plain JSON array of movie titles only, No extra text, no explanations, no code blocks, no markdown, just the JSON array.
    example:
[
  "Movie Title 1",
  "Movie Title 2",
  "Movie Title 3",
  "Movie Title 4",
  "Movie Title 5",
  "Movie Title 6",
  "Movie Title 7",
  "Movie Title 8",
  "Movie Title 9",
  "Movie Title 10"
]`;

    const result = await getAIRecommendation(userPrompt);

    // Be resilient to the model returning extra text or fenced blocks.
    const raw = typeof result === "string" ? result.trim() : "";
    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    const jsonText =
      firstBracket !== -1 && lastBracket !== -1 ? raw.slice(firstBracket, lastBracket + 1) : raw;

    let recommendationArray;
    try {
      recommendationArray = JSON.parse(jsonText);
    } catch {
      recommendationArray = null;
    }
    const titles = Array.isArray(recommendationArray)
      ? recommendationArray
          .map((x) => (typeof x === "string" ? x : x?.title || x?.name))
          .filter(Boolean)
          .slice(0, 10)
      : [];

    if (titles.length === 0) {
      return res.status(200).json({
        recommendations: ["The Shawshank Redemption", "Inception", "The Dark Knight", "Interstellar", "Parasite"],
        fallback: true,
        message: "AI returned unexpected format, showing curated fallback recommendations"
      });
    }

    res.status(200).json({ recommendations: titles });
  } catch (error) {
    safeError("AI recommendation error:", error);
    const isQuotaError = /rate limit|quota|RESOURCE_EXHAUSTED|429/i.test(error.message);

    if (isQuotaError) {
      return res.status(429).json({
        recommendations: ["The Shawshank Redemption", "Inception", "The Dark Knight", "Interstellar", "Parasite"],
        fallback: true,
        message: "AI quota exceeded, showing curated fallback recommendations"
      });
    }

    res.status(500).json({
      recommendations: ["The Shawshank Redemption", "Inception", "The Dark Knight", "Interstellar", "Parasite"],
      fallback: true,
      message: "AI service temporarily unavailable, showing curated fallback recommendations"
    });
  }
});

const __dirname = path.resolve();
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "/frontend/dist")));
  app.get("*", (req, res) => { res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html")); });
}

app.listen(PORT, async () => {
  await connectToDB();
  safeInfo(`Server is running on http://localhost:${PORT}`);
  if (isEmailConfigured()) {
    safeInfo("Email: ENABLED", { from: redactEmail(process.env.EMAIL_USER) });
  } else {
    safeInfo("Email: OFF — set EMAIL_USER and EMAIL_PASS in backend/.env (Gmail App Password).");
  }
});
