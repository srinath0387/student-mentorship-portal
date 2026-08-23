export {};
const { Pool } = require('pg');

const DB_HOST    = process.env.DB_HOST     || 'advitiyans-db.chu8eggw0kny.ap-south-1.rds.amazonaws.com';
const DB_PORT    = parseInt(process.env.DB_PORT || '5432');
const DB_USER    = process.env.DB_USER     || 'postgres';
const DB_NAME    = process.env.DB_NAME     || 'advitiyans';
const DB_SSL     = process.env.DB_SSL !== 'false';
const SECRET_ARN = process.env.DB_SECRET_ARN || 'arn:aws:secretsmanager:ap-south-1:071340280897:secret:advitiyans-db-credentials-s51wBK';

async function getPassword() {
  if (process.env.DB_PASSWORD) return process.env.DB_PASSWORD;
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: 'ap-south-1' });
    const resp = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
    if (resp.SecretString) {
      const s = JSON.parse(resp.SecretString);
      return s.password || s.DB_PASSWORD;
    }
  } catch (e: any) {
    console.error('Could not fetch secret from AWS:', e.message);
  }
  return 'postgres';
}

async function auditDepartments() {
  try {
    const password = await getPassword();
    const pool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password,
      database: DB_NAME,
      ssl: DB_SSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 15000,
    });

    console.log('================================================================');
    console.log('       DEPARTMENT AUDIT ACROSS ALL TABLES IN ADVITIYANS DB     ');
    console.log('================================================================\n');

    // 1. Faculty Department Summary
    const facDepts = await pool.query(`
      SELECT department, COUNT(*)::int AS count, 
             COUNT(CASE WHEN email IS NOT NULL AND LOWER(email) NOT LIKE 'pending_%' THEN 1 END)::int AS registered_count
      FROM faculty
      GROUP BY department
      ORDER BY count DESC
    `);
    console.log('📌 FACULTY TABLE DEPARTMENTS:');
    console.table(facDepts.rows);

    // 2. Students Department Summary
    const stuDepts = await pool.query(`
      SELECT department, COUNT(*)::int AS count,
             COUNT(CASE WHEN faculty_mentor_id IS NOT NULL THEN 1 END)::int AS with_mentor_count
      FROM students
      GROUP BY department
      ORDER BY count DESC
    `);
    console.log('\n📌 STUDENTS TABLE DEPARTMENTS:');
    console.table(stuDepts.rows);

    // 3. HOD Credentials Departments
    const hodDepts = await pool.query(`
      SELECT email, department, role FROM hod_credentials ORDER BY department
    `);
    console.log('\n📌 HOD CREDENTIALS TABLE DEPARTMENTS:');
    console.table(hodDepts.rows);

    // 4. Admin Accounts Departments
    const adminDepts = await pool.query(`
      SELECT email, department, role FROM admin_accounts ORDER BY department
    `);
    console.log('\n📌 ADMIN ACCOUNTS TABLE DEPARTMENTS:');
    console.table(adminDepts.rows);

    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error('Error auditing departments:', err.message);
    process.exit(1);
  }
}

auditDepartments();
