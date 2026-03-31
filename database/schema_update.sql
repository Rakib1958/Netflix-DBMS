-- ============================================
-- AWARDS TABLE
-- ============================================

CREATE TABLE Award (
    award_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_id UUID REFERENCES Media(media_id) ON DELETE CASCADE,
    person_id UUID REFERENCES Person(person_id) ON DELETE CASCADE, -- Optional, if award is for a person
    name VARCHAR(255) NOT NULL, -- e.g., "Academy Award"
    year INT,
    category VARCHAR(255), -- e.g., "Best Picture"
    is_winner BOOLEAN DEFAULT TRUE
);

-- Index for faster lookup
CREATE INDEX idx_award_media ON Award(media_id);
