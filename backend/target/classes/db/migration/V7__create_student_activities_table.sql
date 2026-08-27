CREATE TABLE student_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    activity_type VARCHAR(50),
    role VARCHAR(100),
    event_date DATE,
    achievement VARCHAR(300),
    certificate_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_student_activities_profile_id ON student_activities(profile_id);
