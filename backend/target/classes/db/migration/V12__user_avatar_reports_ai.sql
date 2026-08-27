ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1000);

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    category VARCHAR(100) NOT NULL, -- SKILL_GAP, COURSE, CODING_TARGET, CAREER_PATH
    description TEXT NOT NULL,
    action_url VARCHAR(500),
    priority VARCHAR(50) DEFAULT 'MEDIUM', -- HIGH, MEDIUM, LOW
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_recommendations_student ON ai_recommendations(student_id);
