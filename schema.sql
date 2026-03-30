-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE MEDIA TABLES
-- ============================================

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
    backdrop_url VARCHAR(500), -- Added backdrop support
    trailer_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Movie table (inherits from Media)
CREATE TABLE Movie (
    movie_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_id UUID NOT NULL UNIQUE REFERENCES Media(media_id) ON DELETE CASCADE,
    box_office_worldwide DECIMAL(15,2),
    production_budget DECIMAL(15,2),
    aspect_ratio VARCHAR(20),
    tagline TEXT
);

-- TVSeries table (inherits from Media)
CREATE TABLE TVSeries (
    series_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_id UUID NOT NULL UNIQUE REFERENCES Media(media_id) ON DELETE CASCADE,
    total_seasons INT DEFAULT 0,
    total_episodes INT DEFAULT 0,
    series_start DATE,
    series_end DATE,
    status VARCHAR(20) CHECK (status IN ('ongoing', 'ended', 'canceled'))
);

-- Season table
CREATE TABLE Season (
    season_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    series_id UUID NOT NULL REFERENCES TVSeries(series_id) ON DELETE CASCADE,
    season_number INT NOT NULL,
    episode_count INT DEFAULT 0,
    air_date DATE,
    overview TEXT,
    poster_url VARCHAR(500),
    UNIQUE(series_id, season_number)
);

-- Episode table
CREATE TABLE Episode (
    episode_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID NOT NULL REFERENCES Season(season_id) ON DELETE CASCADE,
    episode_number INT NOT NULL,
    title VARCHAR(500),
    air_date DATE,
    runtime_minutes INT,
    rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10) DEFAULT 0,
    num_votes BIGINT DEFAULT 0,
    plot_summary TEXT,
    still_url VARCHAR(500),
    UNIQUE(season_id, episode_number)
);

-- ============================================
-- PEOPLE & TALENT
-- ============================================

CREATE TABLE Person (
    person_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    stage_name VARCHAR(255),
    birth_date DATE,
    death_date DATE,
    birth_place VARCHAR(255),
    biography TEXT,
    profile_image VARCHAR(500),
    height_cm DECIMAL(5,2),
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'undisclosed'))
);

CREATE TABLE Credit (
    credit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_id UUID NOT NULL REFERENCES Media(media_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES Person(person_id) ON DELETE CASCADE,
    role_type VARCHAR(50) CHECK (role_type IN ('actor', 'director', 'writer', 'producer', 'crew')),
    character_name VARCHAR(255),
    billing_order INT,
    job_title VARCHAR(100),
    department VARCHAR(100),
    role_description TEXT
);

-- ============================================
-- CLASSIFICATION & METADATA
-- ============================================

CREATE TABLE Genre (
    genre_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE MediaGenre (
    media_id UUID NOT NULL REFERENCES Media(media_id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES Genre(genre_id) ON DELETE CASCADE,
    PRIMARY KEY (media_id, genre_id)
);

-- ============================================
-- USER ENGAGEMENT
-- ============================================

CREATE TABLE "User" (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')), -- Added Role
    birth_date DATE,
    country_code CHAR(2),
    profile_picture VARCHAR(500),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE Rating (
    rating_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES Media(media_id) ON DELETE CASCADE,
    rating_value INT CHECK (rating_value >= 1 AND rating_value <= 10),
    rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, media_id)
);

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

CREATE TABLE ReviewVote (
    vote_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES Review(review_id) ON DELETE CASCADE,
    vote_type VARCHAR(10) CHECK (vote_type IN ('like', 'dislike')),
    UNIQUE(user_id, review_id)
);

CREATE TABLE Watchlist (
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES Media(media_id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, media_id)
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
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

-- Function to recalculate Media Rating
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

-- Function to update Review votes
CREATE OR REPLACE FUNCTION update_review_votes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.vote_type = 'like') THEN
            UPDATE Review SET likes = likes + 1 WHERE review_id = NEW.review_id;
        ELSIF (NEW.vote_type = 'dislike') THEN
            UPDATE Review SET dislikes = dislikes + 1 WHERE review_id = NEW.review_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.vote_type = 'like') THEN
            UPDATE Review SET likes = likes - 1 WHERE review_id = OLD.review_id;
        ELSIF (OLD.vote_type = 'dislike') THEN
            UPDATE Review SET dislikes = dislikes - 1 WHERE review_id = OLD.review_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.vote_type != NEW.vote_type) THEN
            IF (NEW.vote_type = 'like') THEN
                UPDATE Review SET likes = likes + 1, dislikes = dislikes - 1 WHERE review_id = NEW.review_id;
            ELSIF (NEW.vote_type = 'dislike') THEN
                UPDATE Review SET dislikes = dislikes + 1, likes = likes - 1 WHERE review_id = NEW.review_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_update_review_votes
    AFTER INSERT OR UPDATE OR DELETE ON ReviewVote
    FOR EACH ROW
    EXECUTE PROCEDURE update_review_votes();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_media_type ON Media(media_type);
CREATE INDEX idx_media_rating ON Media(rating);
CREATE INDEX idx_media_title ON Media(title);
CREATE INDEX idx_rating_media ON Rating(media_id);
CREATE INDEX idx_review_media ON Review(media_id);

-- ============================================
-- SEED DATA (Minimal)
-- ============================================

INSERT INTO Genre (name, description) VALUES
    ('Action', 'High-energy films'),
    ('Drama', 'Serious, plot-driven stories'),
    ('Comedy', 'Humorous content'),
    ('Sci-Fi', 'Futuristic themes'),
    ('Thriller', 'Suspense and excitement');
