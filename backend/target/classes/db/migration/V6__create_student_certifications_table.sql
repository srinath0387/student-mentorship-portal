CREATE TABLE student_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    name VARCHAR(300) NOT NULL,
    issuing_organization VARCHAR(200),
    platform VARCHAR(100),
    credential_id VARCHAR(200),
    credential_url VARCHAR(500),
    issue_date DATE,
    expiry_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_student_certifications_profile_id ON student_certifications(profile_id);
