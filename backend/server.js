/**
 * Main HTTP server: Express app with middleware, REST routes, TMDB proxy, Gemini AI,
 * and (in production) static serving of the built React SPA. Talks to PostgreSQL via
 * pool + model classes from ./database.
 */
import "./config/loadEnv.js";
import express from "express";
import path from "path";
import fs from "fs";
import {
  connectToDB,
  pool,
  User,
  Media,
  Review,
  Rating,
  ensureDynamicColumns,
} from "./database/index.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import multer from "multer";
import { sendTransactionalEmail, isEmailConfigured } from "./utils/mailer.js";
import { signupVerificationEmail, passwordResetEmail } from "./utils/emailTemplates.js";
import { GoogleGenAI } from "@google/genai";
import { redactEmail, safeError, safeInfo, sanitizeForLog } from "./utils/rotation.js";

// --- Env guard: without JWT_SECRET we cannot sign or verify tokens safely ---
const JWT_SECRET = process.env.JWT_SECRET?.trim();
if (!JWT_SECRET) {
  safeError(
    "\n[x] Missing JWT_SECRET in backend/.env\n    Add JWT_SECRET (long random string, server-only).\n"
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// TMDB credentials (server-side only); used by the proxy route below so the browser never sees the key.
const TMDB_TOKEN = process.env.TMDB_TOKEN?.trim();
const TMDB_API_KEY = process.env.TMDB_API_KEY?.trim();
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Profile picture uploads: files saved under ./uploads and served at /uploads/...
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

// Global middleware: JSON bodies, cookies (JWT), CORS with credentials for SPA + httpOnly cookie auth.
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

/**
 * GET /api/tmdb/<path> — Proxy to TMDB REST API.
 * Keeps API key / bearer token on the server; validates path (no traversal, allowlist of prefixes).
 */
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

/**
 * If the user row is banned but banned_until is in the past, clear ban in DB and on the in-memory row.
 * Used so expired temporary bans are lifted without a separate cron job.
 */
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

/** Human-readable message for banned users (permanent vs until timestamp). */
const banBlockedMessage = (userRow) =>
  userRow?.banned_until == null
    ? "Account suspended"
    : `Account suspended until ${new Date(userRow.banned_until).toISOString()}`;

/**
 * Auth middleware: read httpOnly cookie `token`, verify JWT, load User, enforce ban, set req.user.
 */
const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Not authorized" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await liftExpiredBanIfNeeded(user);
    if (user.is_banned) return res.status(403).json({ message: banBlockedMessage(user) });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

/** Same as login check but requires role === 'admin' for admin-only API routes. */
const adminRoute = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ message: "Not authorized" });
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: "Admin access required" });
        }
        next();
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
};

// --- Password reset (email OTP) ---
/** Request password-reset OTP by email; persists OTP + expiry on User row and sends mail. */
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    await ensureDynamicColumns();
    const user = await User.findByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;

    await User.updateResetToken(email, otp, expires);

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

/** Verify reset OTP before allowing new password on reset-password. */
app.post("/api/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findByResetToken(email, otp);
    if (!user || user.reset_password_expires < Date.now()) return res.status(400).json({ message: "Invalid/expired OTP" });
    res.status(200).json({ message: "OTP verified" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

/** Set new password after valid OTP. */
app.post("/api/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const user = await User.findByResetToken(email, otp);
    if (!user || user.reset_password_expires < Date.now()) return res.status(400).json({ message: "Invalid/expired OTP" });

    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    await User.resetPassword(email, hashedPassword);
    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// --- Profile (authenticated) ---
/** Update username/email/password hash / demographics; returns fresh user + watchlist. */
app.put("/api/update-profile", protectRoute, async (req, res) => {
  const { username, email, password, birth_date, country_code } = req.body;
  try {
    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (password) {
        updates.passwordHash = await bcryptjs.hash(password, 10);
    }
    if (birth_date !== undefined) {
      updates.birthDate = birth_date === "" || birth_date === null ? null : birth_date;
    }
    if (country_code !== undefined) updates.countryCode = country_code;

    await User.updateProfile(req.user._id, updates);
    if (country_code !== undefined) {
      let cc = country_code === "" || country_code === null ? null : String(country_code).trim().toUpperCase();
      if (cc !== null && cc.length !== 2) {
        return res.status(400).json({ message: "country_code must be a 2-letter ISO code (e.g. US, BD) or empty." });
      }
      updates.countryCode = cc;
    }

    await User.updateProfile(req.user._id, updates);

    const user = await User.findById(req.user._id);
    const watchlist = await User.getWatchlist(req.user._id);
    res.status(200).json({ user: { ...user, watchlist }, message: "Profile updated" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

/** Multipart upload; stores file under uploads/ and saves URL on User row. */
app.post("/api/upload-profile-pic", protectRoute, upload.single("profilePic"), async (req, res) => {
   try {
       if (!req.file) return res.status(400).json({ message: "No file uploaded" });
       const relativeUrl = `/uploads/${req.file.filename}`;
       await User.updateProfilePicture(req.user._id, relativeUrl);
       res.status(200).json({ message: "Profile picture uploaded", url: relativeUrl });
   } catch(err) { res.status(500).json({ message: err.message }); }
});

// --- Signup & email verification ---
/** Create User with bcrypt hash + verification OTP; optional admin role via ADMIN_SECRET. */
app.post("/api/signup", async (req, res) => {
  const { username, email, password, adminCode } = req.body;
  try {
    if (!username || !email || !password) throw new Error("All fields are required!");
    await ensureDynamicColumns();

    if (await User.findByEmail(email)) return res.status(400).json({ message: "User already exists." });
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) return res.status(400).json({ message: "Username taken." });

    const hashedPassword = await bcryptjs.hash(password, 10);
    const verificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000;

    let role = 'user';
    if (adminCode && adminCode === (process.env.ADMIN_SECRET || 'mysecretadmincode')) { role = 'admin'; }

    await User.create({
      username,
      email,
      passwordHash: hashedPassword,
      role,
      verificationToken: verificationOtp,
      verificationExpires,
      isVerified: false
    });

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

/** Send a new signup verification OTP to the user's email. */
app.post("/api/resend-verification", async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) return res.status(400).json({ message: "Email is required" });
    await ensureDynamicColumns();
    const user = await User.findByEmail(email);
    if (!user) return res.status(404).json({ message: "No account with this email." });
    if (user.is_verified) return res.status(400).json({ message: "Account is already verified." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await User.updateVerificationToken(email, otp, verificationExpires);

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

/** Mark account verified and set JWT cookie (user can use the app). */
app.post("/api/verify-email", async (req, res) => {
  const { email, otp } = req.body;
  try {
     await ensureDynamicColumns();
     const user = await User.findByVerificationToken(email, otp);
     if (!user) return res.status(400).json({ message: "Invalid verification code" });
     if (user.verification_expires != null && user.verification_expires < Date.now()) {
       return res.status(400).json({ message: "Code expired. Use 'Resend code' to get a new one." });
     }

     await User.verifyUser(email);
     
    const token = jwt.sign({ id: user.user_id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
     
     res.status(200).json({
         user: {
           _id: user.user_id,
           username: user.username,
           email: user.email,
           profilePic: user.profile_picture,
           role: user.role,
           birth_date: user.birth_date,
           country_code: user.country_code,
           registered_at: user.registered_at,
           last_login: user.last_login,
           watchlist: [],
         },
         message: "Account Verified Successfully."
     });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// --- Login & session ---
/** Validate credentials, enforce verify/ban, set JWT cookie, return user without password_hash + watchlist. */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    await ensureDynamicColumns();
    const user = await User.findByUsername(username);
    
    if (!user || !bcryptjs.compareSync(password, user.password_hash)) {
      return res.status(400).json({ message: "Invalid credentials." });
    }
    await liftExpiredBanIfNeeded(user);
    if (user.is_banned) return res.status(403).json({ message: banBlockedMessage(user) });
    if (user.is_verified === false) return res.status(403).json({ message: "Email not verified. Please verify." });

    await User.updateLastLogin(user._id);

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    
    delete user.password_hash;
    const freshUser = await User.findById(user._id);
    delete freshUser.is_banned;
    const watchlist = await User.getWatchlist(user._id);
    freshUser.watchlist = watchlist;

    res.status(200).json({ user: freshUser, message: "Logged in successfully." });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

/**
 * Restore session on SPA load: verify cookie JWT, return user + watchlist (uses pool for one-shot query + join).
 */
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

/** Clear auth cookie (client session ends; no DB session table). */
app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out" });
});

// --- Watchlist ---
/** Current user's watchlist as TMDB JSON blobs from Media.tmdb_data. */
app.get("/api/watchlist", protectRoute, async (req, res) => {
  try {
      const watchlist = await User.getWatchlist(req.user._id);
      res.status(200).json({ watchlist });
  } catch (err) { res.status(200).json({ watchlist: [] }); }
});

/**
 * Ensure a Media row exists for this TMDB id (create stub from TMDB payload if missing).
 * Returns internal media_id for FKs (watchlist, reviews, ratings).
 */
const ensureMediaStub = async (movie) => {
    let media = await Media.findByTmdbId(String(movie.id));
    if (!media) {
        return await Media.create({
            title: movie.title || movie.name,
            posterUrl: movie.poster_path,
            backdropUrl: movie.backdrop_path,
            releaseDate: movie.release_date || movie.first_air_date || null,
            rating: movie.vote_average || 0,
            numVotes: movie.vote_count || 0,
            tmdbId: String(movie.id),
            tmdbData: movie,
            mediaType: 'movie'
        });
    }
    return media.media_id;
};

/** Insert Watchlist row after ensureMediaStub; rejects if already present. */
app.post("/api/watchlist/add", protectRoute, async (req, res) => {
  try {
    await ensureDynamicColumns();
    const mediaId = await ensureMediaStub(req.body.movie);
    
    if (await User.checkInWatchlist(req.user._id, mediaId)) {
        return res.status(400).json({ message: "Movie already in watchlist" });
    }
    await User.addToWatchlist(req.user._id, mediaId);
    
    const watchlist = await User.getWatchlist(req.user._id);
    res.status(200).json({ watchlist, message: "Added" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

/** Remove by TMDB id (resolves Media row then deletes watchlist link). */
app.delete("/api/watchlist/remove/:id", protectRoute, async (req, res) => {
  try {
    const media = await Media.findByTmdbId(String(req.params.id));
    if (media) {
        await User.removeFromWatchlist(req.user._id, media.media_id);
    }
    const watchlist = await User.getWatchlist(req.user._id);
    res.status(200).json({ watchlist, message: "Removed" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// --- Media: admin metadata & public reviews/ratings ---
/** Public read of admin-overridden poster/backdrop/trailer and JSON metadata for a TMDB id. */
app.get("/api/media/:tmdbId/admin-meta", async (req, res) => {
    try {
        await ensureDynamicColumns();
        const meta = await Media.getAdminMetadata(String(req.params.tmdbId));
        if (!meta) {
            return res.status(200).json({
                admin_metadata: null,
                poster_url: null,
                backdrop_url: null,
                trailer_url: null,
            });
        }
        res.status(200).json({
            admin_metadata: meta.admin_metadata || {},
            poster_url: meta.poster_url || null,
            backdrop_url: meta.backdrop_url || null,
            trailer_url: meta.trailer_url || null,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/** List reviews for a title (by TMDB id); empty if no Media stub yet. */
app.get("/api/media/:tmdbId/reviews", async (req, res) => {
    try {
        const media = await Media.findByTmdbId(String(req.params.tmdbId));
        if(!media) return res.status(200).json({ reviews: [] });
        
        const reviews = await Review.getReviewsForMedia(media.media_id);
        
        res.status(200).json({ reviews });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Create review (one per user per media enforced in Review model / transaction). */
app.post("/api/media/:tmdbId/reviews", protectRoute, async (req, res) => {
    try {
        const content = (req.body.content || "").trim();
        if (!content) return res.status(400).json({ message: "Review cannot be empty" });
        if (content.length > 5000) return res.status(400).json({ message: "Review is too long" });
        const mediaId = await ensureMediaStub(req.body.movie);
        await Review.createReview(req.user._id, mediaId, content);
        const reviews = await Review.getReviewsForMedia(mediaId);
        res.status(200).json({ reviews, message: "Review posted" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Like/dislike; DB triggers keep Review.likes / dislikes in sync. */
app.post("/api/reviews/:reviewId/vote", protectRoute, async (req, res) => {
    try {
        await Review.voteOnReview(req.user._id, req.params.reviewId, req.body.voteType);
        res.status(200).json({ message: "Vote registered" }); 
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Get current rating statistics for a media (internal ratings, not TMDB). */
app.get("/api/media/:tmdbId/rating-stats", async (req, res) => {
    try {
        await ensureDynamicColumns();
        const tmdbId = String(req.params.tmdbId);
        console.log("Getting rating stats for TMDB ID:", tmdbId);
        const stats = await Media.getRatingStats(tmdbId);
        console.log("Rating stats result:", stats);
        
        const rating = stats?.rating ? parseFloat(stats.rating) : 0;
        const num_votes = stats?.num_votes ? parseInt(stats.num_votes) : 0;
        
        res.status(200).json({ rating, num_votes });
    } catch(err) { 
        console.error("Rating stats error:", err);
        res.status(500).json({ message: err.message }); 
    }
});

/** Upsert user rating; triggers refresh Media.rating / num_votes aggregates. */
app.post("/api/media/:tmdbId/ratings", protectRoute, async (req, res) => {
    try {
        console.log("Rating endpoint - user:", req.user._id, "tmdbId:", req.params.tmdbId, "rating:", req.body.rating);
        
        await ensureDynamicColumns();
        const mediaId = await ensureMediaStub(req.body.movie);
        console.log("Media ID:", mediaId);
        
        await Rating.rateMedia(req.user._id, mediaId, req.body.rating);
        console.log("Rating saved, fetching stats...");
        
        const stats = await Media.getRatingStats(String(req.params.tmdbId));
        console.log("Stats after rating:", stats);
        
        const rating = stats?.rating ? parseFloat(stats.rating) : 0;
        const num_votes = stats?.num_votes ? parseInt(stats.num_votes) : 0;
        
        res.status(200).json({ message: "Rating saved", rating, num_votes });
    } catch(err) { 
        console.error("Rating endpoint error:", err);
        res.status(500).json({ message: err.message }); 
    }
});

// --- Admin API (JWT + role admin) ---
/** Paginate-free list of users for admin dashboard. */
app.get("/api/admin/users", adminRoute, async (req, res) => {
    try {
        await ensureDynamicColumns();
        const users = await User.getAllUsers();
        res.status(200).json({ users });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Ban/unban user (cannot target another admin); supports permanent or until timestamp. */
app.patch("/api/admin/users/:userId/ban", adminRoute, async (req, res) => {
    try {
        await ensureDynamicColumns();
        const { banned, durationHours, durationDays, until, permanent } = req.body || {};

        if (banned === false) {
          const success = await User.unbanUser(req.params.userId, "admin");
          if (!success) return res.status(404).json({ message: "User not found or cannot modify" });
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

        const success = await User.banUser(req.params.userId, bannedUntil, "admin");
        if (!success) return res.status(404).json({ message: "User not found or cannot modify" });
        res.status(200).json({
          message: bannedUntil == null ? "User banned (permanent)" : `User banned until ${new Date(bannedUntil).toISOString()}`,
          banned_until: bannedUntil,
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

/** Hard-delete user (cascades per FK definitions in schema). */
app.delete("/api/admin/users/:userId", adminRoute, async (req, res) => {
    try {
        await User.deleteUser(req.params.userId);
        res.status(200).json({ message: "User deleted" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** All reviews with usernames and media titles for moderation UI. */
app.get("/api/admin/reviews", adminRoute, async (req, res) => {
    try {
        const reviews = await Review.getAllReviewsForAdmin();
        res.status(200).json({ reviews });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Remove a single review by id. */
app.delete("/api/admin/reviews/:reviewId", adminRoute, async (req, res) => {
    try {
        await Review.deleteReview(req.params.reviewId);
        res.status(200).json({ message: "Review removed" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Override poster/backdrop/trailer URLs and merge admin_metadata JSONB. */
app.put("/api/admin/media/:tmdbId/custom", adminRoute, async (req, res) => {
    try {
        await ensureDynamicColumns();
        const mediaId = await ensureMediaStub(req.body.movie);
        await Media.updateMediaUrls(mediaId, {
            posterUrl: req.body.poster_url,
            backdropUrl: req.body.backdrop_url,
            trailerUrl: req.body.trailer_url
        });
        
        const metaPatch = {};
        if (req.body.awards !== undefined) metaPatch.awards = req.body.awards;
        if (req.body.secondary_info !== undefined) metaPatch.secondary_info = req.body.secondary_info;
        
        if (Object.keys(metaPatch).length > 0) {
            await Media.updateAdminMetadata(mediaId, metaPatch);
        }
        
        if (req.body.admin_metadata && typeof req.body.admin_metadata === "object") {
            await Media.updateAdminMetadata(mediaId, req.body.admin_metadata);
        }
        res.status(200).json({ message: "Media customized successfully" });
    } catch(err) { res.status(500).json({ message: err.message }); }
});

/** Liveness / sanity check for deploys and local dev. */
app.get("/", (req, res) => { res.send("AIFlix Backend is Running!"); });

// --- Gemini AI: request shape for generateContent ---
const config = {
  responseMimeType: "text/plain",
};

/** Used when GEMINI_MODEL env is unset; first model that works wins. */
const DEFAULT_MODEL_CANDIDATES = ["gemini-2.0-flash-001", "gemini-2.0-flash"];

/** In-memory cache: identical prompts skip API calls for AI_CACHE_TTL_MS. */
const aiCache = new Map();
const AI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Parse comma-separated GEMINI_MODEL into a trimmed list of model ids. */
function parseModelList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pull plain text from @google/genai generateContent response shape. */
function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p?.text).filter(Boolean).join("") || "";
}

/**
 * Call Gemini with retries, optional model fallback list, and rate-limit backoff.
 * Throws on missing key, exhausted quotas, or unsupported models (caller maps to HTTP + fallback list).
 */
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

/**
 * Mood/genre/decade/etc. wizard → prompt → Gemini → parse JSON array of titles.
 * On parse failure or API errors returns curated fallback list + message (200/429/500).
 */
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
    const underlyingMessage = error?.message || "Unknown AI recommendation error";

    if (isQuotaError) {
      return res.status(429).json({
        recommendations: ["The Shawshank Redemption", "Inception", "The Dark Knight", "Interstellar", "Parasite"],
        fallback: true,
        message: `AI quota exceeded, showing curated fallback recommendations (reason: ${underlyingMessage})`
      });
    }

    res.status(500).json({
      recommendations: ["The Shawshank Redemption", "Inception", "The Dark Knight", "Interstellar", "Parasite"],
      fallback: true,
      message: `AI service temporarily unavailable, showing curated fallback recommendations (reason: ${underlyingMessage})`
    });
  }
});

const __dirname = path.resolve();
// Single-origin deploy: serve built Vite app and SPA fallback for client-side routes.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "/frontend/dist")));
  app.get("*", (req, res) => { res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html")); });
}

/** Bind HTTP server then connect PostgreSQL pool (see database/config/db.js). */
app.listen(PORT, async () => {
  await connectToDB();
  safeInfo(`Server is running on http://localhost:${PORT}`);
  if (isEmailConfigured()) {
    safeInfo("Email: ENABLED", { from: redactEmail(process.env.EMAIL_USER) });
  } else {
    safeInfo("Email: OFF — set EMAIL_USER and EMAIL_PASS in backend/.env (Gmail App Password).");
  }
});
