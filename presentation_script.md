# 🎤 Netflix-DBMS — Presentation Script & Advanced Topics

> This is a companion to the main guide. It gives you the **exact order** to present in, **what to show on screen**, and deep dives into advanced topics examiners love to ask about.

---

## Part A: Recommended Presentation Order (20–30 min)

### Slide 1: Title & Introduction (1 min)
**Say**: "Our project is a Netflix-like streaming platform built with PostgreSQL as the database, Node.js/Express as the backend, and React as the frontend. The core focus is demonstrating relational database concepts — tables, constraints, triggers, functions, stored procedures, and transactions."

---

### Slide 2: Architecture Overview (2 min)
**Show**: The architecture diagram from the main guide.

**Say**: "The system has 3 layers. The React frontend communicates with an Express REST API. The API connects to PostgreSQL using a connection pool. We also integrate TMDB for movie data and Google Gemini for AI recommendations."

**Key point**: "All our business logic involving data integrity is handled by the DATABASE, not the application code."

---

### Slide 3: Live Demo — User Flow (3 min)
**Show**: Open the app in browser. Demonstrate:
1. Sign up → email verification OTP
2. Login → browse movies
3. Open a movie → rate it → write a review → like a review
4. Add to watchlist
5. Show admin panel (if you're admin)

**Say**: "Every action you see here involves SQL queries, transactions, and triggers running behind the scenes."

---

### Slide 4: Database Schema / ER Diagram (3 min)
**Show**: The ER diagram. Walk through:
1. **Media** (parent table) → **Movie** and **TVSeries** (children). "This is table inheritance using foreign keys"
2. **User** → **Rating**, **Review**, **Watchlist**. "Users interact with media through junction/relationship tables"
3. **MediaGenre**, **Credit** — "Many-to-many relationships implemented with junction tables"

**Say**: "We have 15+ tables with proper normalization. Every relationship is enforced by foreign keys with CASCADE delete."

---

### Slide 5: Constraints Deep Dive (3 min)
**Show**: Open `schema.sql`. Highlight:

```sql
-- PRIMARY KEY with UUID
media_id UUID PRIMARY KEY DEFAULT uuid_generate_v4()

-- FOREIGN KEY with cascade
media_id UUID NOT NULL UNIQUE REFERENCES Media(media_id) ON DELETE CASCADE

-- CHECK constraint (enum-like behavior)
media_type VARCHAR(20) CHECK (media_type IN ('movie', 'series'))
rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10)

-- COMPOSITE PRIMARY KEY (junction table)
PRIMARY KEY (media_id, genre_id)

-- UNIQUE constraint (business rule)
UNIQUE(user_id, media_id) -- one rating per user per movie
```

**Say**: "Constraints enforce data integrity at the DATABASE level. Even if application code has bugs, invalid data can never enter the database."

---

### Slide 6: ⭐ Triggers & Functions (5 min — THIS IS THE MOST IMPORTANT SLIDE)

**Show**: `schema.sql` lines 177–248. Walk through each one:

#### Trigger 1: Auto-timestamp
```sql
CREATE TRIGGER update_media_modtime
    BEFORE UPDATE ON Media
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
```
**Say**: "BEFORE UPDATE — fires before the row is saved. The function sets `NEW.updated_at = NOW()`. This means every time media data changes, the timestamp updates automatically."

#### Trigger 2: Auto-calculate rating (⭐ STAR OF THE SHOW)
```sql
-- The function
CREATE OR REPLACE FUNCTION update_media_rating()
RETURNS TRIGGER AS $$
DECLARE
    new_rating DECIMAL(3,1);
    new_votes BIGINT;
BEGIN
    SELECT AVG(rating_value), COUNT(*) INTO new_rating, new_votes
    FROM Rating WHERE media_id = COALESCE(NEW.media_id, OLD.media_id);
    
    UPDATE Media SET rating = COALESCE(new_rating, 0), num_votes = COALESCE(new_votes, 0)
    WHERE media_id = COALESCE(NEW.media_id, OLD.media_id);
    
    RETURN NEW;
END;

-- The trigger
CREATE TRIGGER trg_update_media_rating
    AFTER INSERT OR UPDATE OR DELETE ON Rating
    FOR EACH ROW EXECUTE PROCEDURE update_media_rating();
```

**Say**: 
> "Watch the data flow:
> 1. When a user clicks the rating button on the frontend, an API call goes to `/api/media/:id/ratings`
> 2. The backend executes: `INSERT INTO Rating ... ON CONFLICT DO UPDATE`  
> 3. PostgreSQL sees a change on the Rating table and AUTOMATICALLY fires `trg_update_media_rating`
> 4. The trigger function recalculates `AVG()` of ALL ratings for that movie
> 5. Updates the `rating` and `num_votes` on the Media table
> 
> The application code **never** calculates averages — the database does it. This prevents any inconsistency."

#### Trigger 3: Review vote counter
**Say**: "Same pattern. When a user likes or dislikes a review, the trigger automatically increments or decrements the counter. It even handles the case where a user CHANGES their vote — decrementing one counter and incrementing the other in a single operation."

---

### Slide 7: Stored Procedure (2 min)
**Show**: `schema.sql` lines 254–289.

**Say**: 
> "A stored procedure encapsulates multiple operations and validations. `create_user_review` does:
> 1. Check if user already reviewed this movie → RAISE EXCEPTION if yes
> 2. Validate rating range → RAISE EXCEPTION if invalid
> 3. Insert the review
> 
> The key difference from a function: procedures don't return values and CAN control transactions internally."

---

### Slide 8: ⭐ Transactions (3 min)

**Show**: `User.js` — the `create()` method and `addToWatchlist()` method.

**Say**:
> "Every write operation in our backend uses transactions.
>
> ```
> BEGIN → execute queries → COMMIT (on success) or ROLLBACK (on failure)
> ```
>
> Why? Consider profile update: we update username, email, and password in 3 separate queries. Without a transaction, if the email update fails but the username already changed, the data is inconsistent. With transactions, ALL changes succeed or NONE do — this is **Atomicity**.
> 
> Another example: watchlist add. We first CHECK if the movie is already in the watchlist, then INSERT. Without a transaction, two simultaneous requests could both pass the check and both insert — creating duplicates. The transaction prevents this race condition."

---

### Slide 9: Authentication Flow (3 min)
**Show**: Sequence diagram from the main guide.

**Key points**:
1. "Password is hashed with **bcrypt** before storage — we NEVER store plain text passwords"
2. "JWT token is stored in an **httpOnly cookie** — JavaScript cannot access it, preventing XSS attacks"
3. "Email verification uses **OTP (One-Time Password)** with expiry — sent via Gmail SMTP"
4. "Every protected API endpoint goes through `protectRoute` middleware that verifies the JWT"

---

### Slide 10: Indexes (1 min)
**Show**: Index definitions from schema.sql.

**Say**: "Indexes are B-tree structures that speed up lookups. Without `idx_media_title`, a title search scans every row. With it, the lookup is O(log n). We index columns frequently used in WHERE clauses and JOINs."

---

### Slide 11: Connection Pool Pattern (1 min)
**Show**: `db.js`

```javascript
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
```

**Say**: "Instead of opening a new database connection for every request (expensive — each connection costs ~3MB RAM), we use a **connection pool**. It maintains a pool of reusable connections. For regular queries, we just do `pool.query()` — it borrows a connection, uses it, and returns it. For transactions, we use `pool.connect()` to get a **dedicated client** that we release in the `finally` block."

---

### Slide 12: Security Summary (1 min)
**List**:
- ✅ Parameterized queries (`$1, $2`) — SQL injection prevention
- ✅ bcrypt password hashing — no plain text passwords
- ✅ httpOnly JWT cookies — XSS protection
- ✅ Role-based access control — admin vs user
- ✅ Log sanitization — credentials never appear in logs
- ✅ Input validation at BOTH application AND database level

---

## Part B: Advanced Topics — Deep Dives

### B.1: COALESCE — Why It's Used Everywhere

```sql
COALESCE(NEW.media_id, OLD.media_id)
```

| Operation | `NEW` | `OLD` | `COALESCE` picks |
|-----------|-------|-------|------------------|
| INSERT | ✅ Has value | ❌ NULL | `NEW.media_id` |
| UPDATE | ✅ Has value | ✅ Has value | `NEW.media_id` |
| DELETE | ❌ NULL | ✅ Has value | `OLD.media_id` |

**Say**: "COALESCE returns the first non-NULL argument. Since DELETE operations don't have a NEW row (only OLD), and INSERT operations don't have an OLD row, COALESCE handles all three trigger events with a single expression."

---

### B.2: JSONB — Storing Semi-Structured Data

Your project uses JSONB in two places:

#### 1. `tmdb_data JSONB` on Media table
```javascript
// When a user adds a movie to watchlist, we save the entire TMDB response as JSONB
await Media.create({
    title: movie.title,
    tmdbData: movie,  // This is the entire TMDB API response — a complex JSON object
    ...
});
```

**Say**: "JSONB stores binary JSON data. We store the entire TMDB API response so we can display movie details without re-fetching from TMDB. PostgreSQL can index inside JSONB and query nested fields."

#### 2. `admin_metadata JSONB` on Media table
```sql
-- Merging new metadata with existing metadata
UPDATE Media SET admin_metadata = COALESCE(admin_metadata, '{}'::jsonb) || $1::jsonb
WHERE media_id = $2
```

**Say**: "The `||` operator MERGES two JSONB objects. `COALESCE(admin_metadata, '{}'::jsonb)` ensures we start with an empty object if the column is NULL. This allows admins to append fields like `awards` and `secondary_info` without overwriting existing metadata."

---

### B.3: ON CONFLICT (UPSERT) — Pattern Used in Ratings & Votes

```sql
-- Rating: insert if new, update if exists
INSERT INTO Rating (user_id, media_id, rating_value) VALUES ($1, $2, $3)
ON CONFLICT (user_id, media_id) DO UPDATE SET rating_value = EXCLUDED.rating_value

-- ReviewVote: insert if new, update if vote type changed
INSERT INTO ReviewVote (user_id, review_id, vote_type) VALUES ($1, $2, $3)
ON CONFLICT (user_id, review_id) DO UPDATE SET vote_type = EXCLUDED.vote_type
```

**What to explain**:
- `ON CONFLICT` detects a UNIQUE constraint violation
- Instead of failing, it performs `DO UPDATE`
- `EXCLUDED` refers to the row that was *attempted* to be inserted
- This is **atomic** — no race condition between checking and inserting
- This is called an **idempotent** operation — calling it multiple times has the same effect as calling it once

---

### B.4: Dynamic Schema Migrations

**File**: [dynamicColumns.js](file:///e:/C%20and%20C++/Buet/SQL/Project/Netflix-DBMS/backend/database/migrations/dynamicColumns.js)

```javascript
export async function ensureDynamicColumns() {
    await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE Media ADD COLUMN IF NOT EXISTS tmdb_id VARCHAR(50) UNIQUE`);
    await pool.query(`ALTER TABLE Media ADD COLUMN IF NOT EXISTS tmdb_data JSONB`);
    // ... more columns
}
```

**Say**: 
> "As we added features (banning, email verification, TMDB integration), we needed new columns. Instead of recreating the database (which loses data), we use `ALTER TABLE ADD COLUMN IF NOT EXISTS`. This is a **non-destructive migration** — it adds the column if missing and does nothing if it already exists. This function runs at app startup and before certain operations."

---

### B.5: The "Media Stub" Pattern — Bridging External API with Relational DB

```javascript
// server.js:439-455
const ensureMediaStub = async (movie) => {
    let media = await Media.findByTmdbId(String(movie.id));
    if (!media) {
        return await Media.create({
            title: movie.title || movie.name,
            tmdbId: String(movie.id),
            tmdbData: movie,      // Store entire TMDB response
            mediaType: 'movie'
        });
    }
    return media.media_id;
};
```

**Say**: 
> "Our movies come from TMDB API, but our database requires FOREIGN KEY references to a `Media` row for ratings, reviews, and watchlists. So when a user first interacts with a movie (rates, reviews, or adds to watchlist), we create a 'stub' row in our Media table. This bridges the external API data with our relational database, maintaining referential integrity. Subsequent interactions reuse the same stub."

---

### B.6: Connection Pool vs Dedicated Client — When to Use Which

```javascript
// SIMPLE QUERY — uses pool directly (auto-borrows and returns connection)
static async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
    return rows[0];
}

// TRANSACTION — needs dedicated client (manual lifecycle management)
static async create(userData) {
    const client = await pool.connect();    // Borrow a DEDICATED connection
    try {
        await client.query('BEGIN');        // Start transaction ON THIS connection
        await client.query('INSERT ...');   // All queries go through SAME connection
        await client.query('COMMIT');       // Commit ON THIS connection
    } catch (error) {
        await client.query('ROLLBACK');     // Rollback ON THIS connection
    } finally {
        client.release();                   // ALWAYS return to pool
    }
}
```

**Say**: "Pool queries borrow a random available connection and return it immediately. Transactions need all their queries on the SAME connection — otherwise BEGIN, INSERT, and COMMIT might execute on different connections. That's why we use `pool.connect()` for transactions."

---

### B.7: The Full Chain — What Happens When a User Rates a Movie

This traces a SINGLE action through every layer:

```
1. USER clicks "8" on the rating buttons
   ↓
2. FRONTEND: Moviepage.jsx calls submitRating(8)
   → axios.post('/api/media/123/ratings', { movie, rating: 8 })
   ↓
3. BACKEND: protectRoute MIDDLEWARE
   → Reads JWT from httpOnly cookie
   → jwt.verify(token, JWT_SECRET) → decoded = { id: "user-uuid" }
   → User.findById(decoded.id) → Loads user from DB
   → Attaches req.user
   ↓
4. BACKEND: POST /api/media/:tmdbId/ratings handler
   → ensureMediaStub(req.body.movie)
     → Media.findByTmdbId("123")
     → If not found: INSERT INTO Media ... (in transaction) → returns media_id
   → Rating.rateMedia(req.user._id, mediaId, 8)
   ↓
5. BACKEND MODEL: Rating.rateMedia()
   → pool.connect() → get dedicated client
   → client.query('BEGIN')
   → client.query('INSERT INTO Rating ... ON CONFLICT DO UPDATE ...')
   → client.query('COMMIT')
   → client.release()
   ↓
6. DATABASE: PostgreSQL executes INSERT/UPDATE on Rating table
   ↓
7. DATABASE TRIGGER: trg_update_media_rating FIRES (AFTER INSERT/UPDATE)
   → Calls update_media_rating() function
   → SELECT AVG(rating_value), COUNT(*) FROM Rating WHERE media_id = '...'
   → UPDATE Media SET rating = 7.5, num_votes = 42 WHERE media_id = '...'
   ↓
8. BACKEND: Returns { message: "Rating saved" }
   ↓
9. FRONTEND: toast.success("Rating submitted"), highlights button
```

---

## Part C: Common Mistakes to Avoid During Presentation

> [!CAUTION]
> **DON'Ts during your presentation:**

| ❌ Don't say | ✅ Say instead |
|-------------|---------------|
| "We used PostgreSQL because it's good" | "We chose PostgreSQL for referential integrity, triggers, and ACID transactions which MongoDB lacks" |
| "The trigger updates the rating" | "The trigger fires AFTER any INSERT, UPDATE, or DELETE on the Rating table, recalculates the average using AVG(), and writes it back to the Media table" |
| "We hash passwords" | "We use bcrypt with 10 salt rounds — it generates a random salt and iteratively hashes 1024 times, making brute-force attacks infeasible" |
| "Transactions make it safe" | "Transactions ensure Atomicity — either all queries in the group succeed, or all are rolled back. This prevents partial updates that would leave data inconsistent" |
| "We use JWTs for login" | "After successful login, we sign a JWT containing only the user_id, set it as an httpOnly cookie (invisible to JavaScript, preventing XSS), and verify it on every subsequent request via middleware" |

---

## Part D: Quick Glossary for Viva

| Term | Definition | Your Project Example |
|------|-----------|---------------------|
| **DDL** | Data Definition Language (CREATE, ALTER, DROP) | `CREATE TABLE Media (...)` |
| **DML** | Data Manipulation Language (SELECT, INSERT, UPDATE, DELETE) | `INSERT INTO Rating ...` |
| **DCL** | Data Control Language (GRANT, REVOKE) | Not directly used (app handles auth) |
| **TCL** | Transaction Control Language (BEGIN, COMMIT, ROLLBACK) | Used in every model's write operations |
| **Normalization** | Eliminating redundancy by splitting into related tables | Genre is a separate table with a junction table MediaGenre |
| **Junction Table** | Table connecting M:N relationships | MediaGenre, Credit, ReviewVote |
| **Referential Integrity** | FK ensures referenced row exists | `REFERENCES Media(media_id)` |
| **CASCADE** | Auto-delete children when parent is deleted | `ON DELETE CASCADE` |
| **Idempotent** | Same result regardless of how many times you call it | `ON CONFLICT DO UPDATE` (UPSERT) |
| **Salt** | Random data added before hashing | bcrypt generates a unique salt per password |
| **Middleware** | Code that runs between request and response | `protectRoute`, `adminRoute` |
| **Connection Pool** | Reusable database connections | `pg.Pool` with `pool.query()` |
| **RETURNING** | Get inserted/updated row back | `INSERT INTO "User" ... RETURNING user_id` |
| **PL/pgSQL** | PostgreSQL's procedural language | All trigger functions and stored procedures |
| **`$$`** | Dollar-quoting — alternative to single quotes for function bodies | `$$ BEGIN ... END; $$` |
| **`TG_OP`** | Special variable: tells trigger which operation fired it | `IF (TG_OP = 'INSERT')` |
| **`NEW` / `OLD`** | Special variables: the row being inserted/updated (NEW) or deleted/updated (OLD) | `NEW.updated_at = NOW()` |
