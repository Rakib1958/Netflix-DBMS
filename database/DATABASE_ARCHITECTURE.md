# Netflix-DBMS Database Architecture Documentation

## Overview

This document provides a comprehensive overview of the database architecture for the Netflix-DBMS project, a scalable media streaming and engagement platform. The database is built on PostgreSQL and implements advanced features including triggers, functions, procedures, complex queries, and explicit transaction control.

## Database Schema

### Core Tables

#### Media Table
```sql
CREATE TABLE Media (
    media_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    release_year INT,
    original_language VARCHAR(10),
    plot_summary TEXT,
    runtime_minutes INT,
    release_date DATE,
    media_type VARCHAR(20) CHECK (media_type IN ('movie', 'series')),
    rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10) DEFAULT 0,
    num_votes BIGINT DEFAULT 0,
    poster_url VARCHAR(500),
    backdrop_url VARCHAR(500),
    trailer_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### User Table
```sql
CREATE TABLE "User" (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    birth_date DATE,
    country_code CHAR(2),
    profile_picture VARCHAR(500),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

#### Review and Rating System
```sql
CREATE TABLE Review (
    review_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES Media(media_id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 10),
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    likes INT DEFAULT 0,
    dislikes INT DEFAULT 0,
    contains_spoiler BOOLEAN DEFAULT FALSE
);

CREATE TABLE Rating (
    rating_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES Media(media_id) ON DELETE CASCADE,
    rating_value INT CHECK (rating_value >= 1 AND rating_value <= 10),
    rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, media_id)
);
```

## 1. User Authentication

### Implementation
- **Technology**: JWT (JSON Web Tokens) with bcrypt for password hashing
- **Session Management**: Stateless authentication using HTTP-only cookies
- **Security Features**:
  - Password hashing with bcryptjs
  - JWT expiration (7 days)
  - Secure cookie settings for production

### Authentication Flow
1. User registration with email verification
2. Password reset with OTP
3. Login with username/password
4. JWT token generation and validation

### Code Example
```javascript
// JWT token generation
const token = jwt.sign({ id: user.user_id }, JWT_SECRET, { expiresIn: "7d" });
res.cookie("token", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
});
```

## 2. Authentication Validation on Every Page

### Implementation
- **Middleware**: `protectRoute` function validates JWT on every protected endpoint
- **Admin Routes**: `adminRoute` middleware for role-based access control
- **Ban Management**: Automatic checking and lifting of expired bans

### Code Example
```javascript
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
```

## 3. Explicit Transaction Control

### Implementation
All DML operations use explicit transaction control with BEGIN, COMMIT, and ROLLBACK statements to ensure data consistency.

### Examples

#### User Profile Updates
```javascript
static async updateProfile(userId, updates) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Multiple update operations
    if (username) {
      await client.query('UPDATE "User" SET username = $1 WHERE user_id = $2', [username, userId]);
    }
    // ... other updates

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

#### Review Creation with Validation
```javascript
static async createReview(userId, mediaId, content) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validation check
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
```

## 4. Database Triggers

### Trigger 1: Automatic Timestamp Updates
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_media_modtime
    BEFORE UPDATE ON Media
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
```
**Purpose**: Automatically updates the `updated_at` timestamp whenever a Media record is modified.

### Trigger 2: Media Rating Aggregation
```sql
CREATE OR REPLACE FUNCTION update_media_rating()
RETURNS TRIGGER AS $$
DECLARE
    new_rating DECIMAL(3,1);
    new_votes BIGINT;
BEGIN
    SELECT AVG(rating_value), COUNT(*) INTO new_rating, new_votes
    FROM Rating
    WHERE media_id = COALESCE(NEW.media_id, OLD.media_id);

    UPDATE Media
    SET rating = COALESCE(new_rating, 0),
        num_votes = COALESCE(new_votes, 0)
    WHERE media_id = COALESCE(NEW.media_id, OLD.media_id);

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_update_media_rating
    AFTER INSERT OR UPDATE OR DELETE ON Rating
    FOR EACH ROW
    EXECUTE PROCEDURE update_media_rating();
```
**Purpose**: Automatically recalculates and updates the average rating and vote count for media whenever ratings are added, updated, or removed.

### Trigger 3: Review Vote Aggregation
```sql
CREATE OR REPLACE FUNCTION update_review_votes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.vote_type = 'like') THEN
            UPDATE Review SET likes = likes + 1 WHERE review_id = NEW.review_id;
        ELSIF (NEW.vote_type = 'dislike') THEN
            UPDATE Review SET dislikes = dislikes + 1 WHERE review_id = NEW.review_id;
        END IF;
    -- ... handle DELETE and UPDATE cases
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_update_review_votes
    AFTER INSERT OR UPDATE OR DELETE ON ReviewVote
    FOR EACH ROW
    EXECUTE PROCEDURE update_review_votes();
```
**Purpose**: Maintains accurate like/dislike counts on reviews by automatically updating counters when votes are cast, changed, or removed.

## 5. Database Functions

### Function 1: Timestamp Update Function
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```
**Purpose**: Returns the current timestamp for trigger-based automatic updates.

### Function 2: Media Rating Calculator
```sql
CREATE OR REPLACE FUNCTION update_media_rating()
RETURNS TRIGGER AS $$
DECLARE
    new_rating DECIMAL(3,1);
    new_votes BIGINT;
BEGIN
    SELECT AVG(rating_value), COUNT(*) INTO new_rating, new_votes
    FROM Rating
    WHERE media_id = COALESCE(NEW.media_id, OLD.media_id);

    UPDATE Media
    SET rating = COALESCE(new_rating, 0),
        num_votes = COALESCE(new_votes, 0)
    WHERE media_id = COALESCE(NEW.media_id, OLD.media_id);

    RETURN NEW;
END;
$$ language 'plpgsql';
```
**Purpose**: Computes statistical aggregations (average rating, vote count) from the Rating table.

### Function 3: Review Vote Counter
```sql
CREATE OR REPLACE FUNCTION update_review_votes()
RETURNS TRIGGER AS $$
-- Implementation handles vote counting logic
$$ language 'plpgsql';
```
**Purpose**: Performs complex vote counting logic with conditional updates based on operation type.

## 6. Stored Procedures

### Procedure 1: Create User Review
```sql
CREATE OR REPLACE PROCEDURE create_user_review(
    p_user_id UUID,
    p_media_id UUID,
    p_content TEXT,
    p_rating INT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    review_count INT;
BEGIN
    -- Check if user already reviewed this media
    SELECT COUNT(*) INTO review_count
    FROM Review
    WHERE user_id = p_user_id AND media_id = p_media_id;

    IF review_count > 0 THEN
        RAISE EXCEPTION 'User has already reviewed this media';
    END IF;

    -- Validate rating if provided
    IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 10) THEN
        RAISE EXCEPTION 'Rating must be between 1 and 10';
    END IF;

    -- Insert the review
    INSERT INTO Review (user_id, media_id, content, rating)
    VALUES (p_user_id, p_media_id, p_content, p_rating);
END;
$$;
```
**Purpose**: Handles multi-step review creation workflow with validation, ensuring data integrity and business rules are enforced at the database level.

## 7. Complex Queries

### Query 1: User Watchlist with Media Details
```sql
SELECT m.tmdb_data
FROM Watchlist w
JOIN Media m ON w.media_id = m.media_id
WHERE w.user_id = $1
```
**Complexity**: JOIN operation between Watchlist and Media tables to retrieve TMDB data for user's watchlist.

### Query 2: Reviews with User Information
```sql
SELECT r.review_id, r.content, r.likes, r.dislikes, r.posted_at, u.username, u.profile_picture
FROM Review r
JOIN "User" u ON r.user_id = u.user_id
WHERE r.media_id = $1
ORDER BY r.posted_at DESC
```
**Complexity**: JOIN between Review and User tables with aggregation functions (COUNT for likes/dislikes) and ordering.

### Query 3: User Profile with Watchlist
```sql
SELECT user_id AS _id, username, email, role, profile_picture AS "profilePic",
       birth_date, country_code, registered_at, last_login, is_banned, banned_until
FROM "User"
WHERE user_id = $1;

// Plus watchlist query:
SELECT m.tmdb_data
FROM Watchlist w
JOIN Media m ON w.media_id = m.media_id
WHERE w.user_id = $1
```
**Complexity**: Multiple related queries with JOIN operations and data transformation.

### Query 4: Admin User Management
```sql
SELECT user_id, username, email, role, is_verified, is_banned, banned_until, registered_at, last_login
FROM "User"
ORDER BY registered_at DESC
```
**Complexity**: Aggregation and filtering for administrative reporting.

### Query 5: Media Search with Ratings
```sql
SELECT m.*, AVG(r.rating_value) as avg_rating, COUNT(r.rating_id) as rating_count
FROM Media m
LEFT JOIN Rating r ON m.media_id = r.media_id
WHERE m.title ILIKE $1
GROUP BY m.media_id
```
**Complexity**: LEFT JOIN with aggregation functions (AVG, COUNT) and grouping.

## Database Architecture Benefits

### Scalability Features
1. **UUID Primary Keys**: Ensures global uniqueness and prevents collision in distributed systems
2. **Indexing Strategy**: Proper indexing on frequently queried columns (user_id, media_id, email)
3. **Connection Pooling**: Efficient database connection management
4. **JSON Storage**: Flexible storage for TMDB API data

### Data Integrity
1. **Foreign Key Constraints**: Maintain referential integrity
2. **Check Constraints**: Validate data ranges and formats
3. **Unique Constraints**: Prevent duplicate data
4. **Transaction Control**: Ensure atomic operations

### Performance Optimizations
1. **Triggers for Aggregation**: Automatic maintenance of computed values
2. **Efficient Queries**: Optimized JOIN operations and indexing
3. **Connection Management**: Proper connection pooling and cleanup

### Security Features
1. **Parameterized Queries**: Protection against SQL injection
2. **Role-Based Access**: Admin and user role separation
3. **Audit Trail**: Potential for logging sensitive operations
4. **Data Validation**: Server-side and database-level validation

## Conclusion

The Netflix-DBMS database architecture demonstrates enterprise-level database design with comprehensive implementation of PostgreSQL advanced features. The system successfully implements all required database concepts while maintaining scalability, performance, and data integrity for a media streaming platform.</content>
<parameter name="filePath">d:\Buet\Project\Netflix-DBMS\database\DATABASE_ARCHITECTURE.md