/**
 * tests/setup.ts
 * Global Jest test setup — runs before every test file.
 * Sets safe environment variable defaults so tests never hit real AWS.
 */

// Mock environment — tests MUST NOT touch real AWS or real DB
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres_test';
process.env.DB_NAME = 'advitiyans_test';
process.env.FACULTY_SECRET_KEY = 'TEST_SECRET_KEY';
process.env.AWS_REGION = 'ap-south-1';
process.env.COGNITO_USER_POOL_ID = 'ap-south-1_TEST12345';
process.env.COGNITO_CLIENT_ID = 'testclientid1234567890';

// Suppress console output during tests unless TEST_VERBOSE=true
if (!process.env.TEST_VERBOSE) {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Keep console.error visible so test failures surface clearly
}
