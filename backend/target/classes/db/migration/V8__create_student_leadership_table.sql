CREATE TABLE student_leadership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    position VARCHAR(200) NOT NULL,
    organization VARCHAR(200),
    description TEXT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_student_leadership_profile_id ON student_leadership(profile_id);
