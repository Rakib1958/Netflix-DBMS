# Netflix DBMS: Database + Authentication Quick Reference

## 1. Goal
A lightweight, instantly memorable map of what was built, where it is in the code, and how it fits together.

- Base project: `PostgreSQL + Express + React + Node` (PERN).
- Focus: Database implementation and user auth.
- Target skill: onboard new contributor in minutes.

---

## 2. Core Files to Open First

- `backend/server.js` (main API + auth middleware + route definitions).
- `backend/database/models/User.js` (user entity and logic patterns in ORM-style code).
- `backend/database/models/Media.js`, `Rating.js`, `Review.js`, `Watchlist` (data model shape).
- `backend/database/schema.sql`/`schema_update.sql` (if present for raw table definitions; otherwise use docs).

---

## 3. Database Implementation (What, Where, Why)

### 3.1. What’s in the schema

- users
  - UUID PK, username/email unique, hashed password, role (`user/admin`), profile data,
  - email verification fields (`is_email_verified`, OTP token, expiry), ban fields (`is_banned`, `banned_until`).

- media
  - UUID PK, `tmdb_id`, text metadata, rating summary, `tmdb_data` JSONB, `admin_metadata` JSONB.

- ratings
  - user-media FK, 1..10, unique per user+media.

- reviews
  - user-media FK, content, like/dislike counts, timestamped.

- watchlist
  - user-media FK, unique pair.

- genres + media_genre
  - many-to-many linking (typical normalized movie genre design).

- people + credits
  - cast/crew relationships where media links person via credits.

### 3.2. Key relational design patterns

- FKs with `ON DELETE CASCADE` for safe cleanup.
- UUID keys for security and cross-service safety.
- Indexes on common lookups (`email`, `username`, `tmdb_id`, `user_id` etc.).
- JSONB for extensibility (`tmdb_data`, `admin_metadata`) while keeping structured tables for queries.

### 3.3. Implementation points (code path)

- Data access through model files under `backend/database/models/*.js`.
- DB config/connection is in `backend/database/config/db.js` (PostgreSQL pooling via `pg`).
- Queries in `server.js` follow route-logic style (CRUD per route rather than a full repository service layer).

---

## 4. Authentication & Authorization (What, Where, How)

### 4.1. Basic session model

- JWT token signed with `process.env.JWT_SECRET`.
- Expiry 7 days + cookie settings:
  - `httpOnly`, `secure`, `sameSite: 'Strict'`.
- Stored client-side in cookie named `jwt`; used by backend for auth middleware.

### 4.2. Signup + email verification (24h OTP)

- Route in `backend/server.js`: `POST /api/signup`.
- Flow:
  1. Create user row with `is_email_verified=false`.
  2. Generate 6-digit `verification_token` + expiry.
  3. Send email via `utils/mailer.js` + templates.
  4. Verify via `POST /api/verify-email`.
  5. On success, update `is_email_verified=true` and issue JWT.

- Includes `POST /api/resend-verification` as helper.

### 4.3. Login/logout

- Route: `POST /api/login` checks hashed password (`bcryptjs.compare`).
- Sets JWT cookie.
- `POST /api/logout` clears cookie.
- `GET /api/fetch-user` returns current user via decoded JWT.

### 4.4. Reset password flow

- `POST /api/forgot-password` creates 10-min reset OTP + send email.
- `POST /api/verify-otp` validates token.
- `POST /api/reset-password` saves hashed new password.

### 4.5. JWT middleware and role checks

- `protectRoute` (in `server.js`):
  - reads `req.cookies.jwt`; verifies JWT; fetches user; checks ban status.
  - attaches `req.userId` on success.
- `adminRoute`: checks `user.role === 'admin'` (on top of protect route logic).

- Protected routes include watchlist, ratings, reviews, profile, AI endpoint.
- Admin-only routes include user list/ban/delete, review moderation, custom media metadata.

### 4.6. Ban system

- User can be banned temporarily or permanently (`is_banned`, `banned_until`).
- `protectRoute` rejects banned users with 403.
- `adminRoute` has endpoints for ban/unban.

### 4.7. Security principles summarized

- Passwords hashed with `bcryptjs` 10 salt rounds.
- OTP tokens expire strictly (10m for reset, 24h for email verification).
- `httpOnly` cookies to reduce XSS attack surface.
- CSRF mitigation with `sameSite` cookie policy.
- `safeError` / `sanitizeForLog` utilities to avoid leaks.
- API key hiding: TMDB / Gemini keys only in backend env, frontend uses `/api/tmdb/*` proxy.

---

## 5. Quick mental map by feature

- Account events: `signup ➜ verify-email ➜ login ➜ fetch-user ➜ logout`.
- Recovery: `forgot-password ➜ verify-otp ➜ reset-password`.
- Profile: `update-profile`, `upload-profile-pic` (Multer local upload).
- Media engagement: watchlist, rates, reviews.
- Admin: user moderation + custom metadata + review moderation.

---

## 6. Handy “need-to-remember” bullet list

- Main auth implementation lives in `backend/server.js`.
- Data model lives in `backend/database/models/*` plus `backend/database/config/db.js`.
- `users`, `media`, `ratings`, `reviews`, `watchlist` are the core relational tables for auth + UX.
- `protectRoute` = auth guard; `adminRoute` = role guard.
- JWT + OTP = two-layer trust for user identity.
- `media` uses JSONB fields to keep free structure for TMDB + admin overrides without schema change.

---

## 7. What to open first when debugging

1. `backend/server.js` around auth routes (lines 250-340 + middleware lines 140-190).
2. `backend/database/models/User.js` for model-level field names.
3. `backend/database/schema.sql` / migration to verify column definitions.
4. `frontend/src/store/authStore.js` to see client login/sign-up behavior.
5. `frontend/src/pages/*SignIn*` and `*SignUp*` for flow visuals.

---

## 8. Quick “common questions” answers

- Q: Where is the JWT parsed? A: `protectRoute` in `backend/server.js`.
- Q: Where is the password hashed? A: in signup/reset password handlers via `bcryptjs.hash`.
- Q: Where are banned users blocked? A: in `protectRoute` ban checks.
- Q: Where does email OTP logic live? A: in signup/forgot-password flows with `utils/mailer.js`.
- Q: If I add a field to users, do I touch DB + models? A: yes, update `users` schema + `User.js` + relevant endpoint payload handling.

---

## 9. Quick revision strategy

1. Draw a 2x2 matrix: (Authentication, Authorization) × (Server routes, DB fields).
2. Walk through one user story (sign-up → verify → login → add-to-watchlist). Mark touched tables and routes.
3. Use the README / this docs file as cheat sheet when editing code (line-by-line mapping).

---

## 10. A one-sentence elevator pitch for each part

- Database: relational, normalized, user-driven content + media catalog, with JSONB for flexible customizations and TMDB snapshot.
- Authentication: JWT cookie-based with email OTP verification, recovery and admin ban protections.

