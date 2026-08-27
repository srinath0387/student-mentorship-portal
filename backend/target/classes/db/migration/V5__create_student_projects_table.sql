CREATE TABLE student_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    project_type VARCHAR(50),
    technologies TEXT,
    role VARCHAR(100),
    github_url VARCHAR(500),
    live_url VARCHAR(500),
    video_url VARCHAR(500),
    team_size INTEGER,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_student_projects_profile_id ON student_projects(profile_id);
