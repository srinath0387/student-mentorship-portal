INSERT INTO users (email, password, first_name, last_name, role, enabled)
VALUES ('admin@portal.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Admin', 'User', 'ADMIN', true)
ON CONFLICT (email) DO NOTHING;
