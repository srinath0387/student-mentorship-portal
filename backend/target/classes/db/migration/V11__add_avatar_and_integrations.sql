ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1000);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_github_sync TIMESTAMP;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_leetcode_sync TIMESTAMP;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_codechef_sync TIMESTAMP;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_hackerrank_sync TIMESTAMP;

CREATE TABLE IF NOT EXISTS platform_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details TEXT,
    synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_platform_sync_logs_profile ON platform_sync_logs(profile_id);
