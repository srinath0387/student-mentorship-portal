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

async function listFaculty() {
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

    const res = await pool.query(`
      SELECT 
        f.faculty_id,
        f.name,
        f.email,
        f.department,
        f.role,
        f.created_at,
        CASE 
          WHEN f.email IS NOT NULL AND LOWER(f.email) NOT LIKE 'pending_%' THEN 'REGISTERED / LOGGED IN'
          ELSE 'NOT REGISTERED (CSV Placeholder)'
        END AS registration_status,
        COUNT(DISTINCT combined.roll_number)::int AS mentee_count
      FROM faculty f
      LEFT JOIN (
        SELECT roll_number, faculty_id FROM mentor_assignments
        UNION
        SELECT roll_number, faculty_mentor_id AS faculty_id FROM students WHERE faculty_mentor_id IS NOT NULL
      ) combined ON UPPER(combined.faculty_id) = UPPER(f.faculty_id)
      GROUP BY f.faculty_id, f.name, f.email, f.department, f.role, f.created_at
      ORDER BY 
        CASE WHEN f.email IS NOT NULL AND LOWER(f.email) NOT LIKE 'pending_%' THEN 0 ELSE 1 END,
        f.department,
        f.name
    `);

    const registered = res.rows.filter((r: any) => r.registration_status === 'REGISTERED / LOGGED IN');
    const placeholders = res.rows.filter((r: any) => r.registration_status !== 'REGISTERED / LOGGED IN');

    console.log('\n===============================================================');
    console.log('         REGISTERED & LOGGED IN FACULTY DETAILS IN AWS DB       ');
    console.log('===============================================================\n');

    console.log(`TOTAL FACULTY RECORDS IN DB: ${res.rows.length}`);
    console.log(`✅ REGISTERED / LOGGED-IN FACULTY COUNT: ${registered.length}\n`);

    if (registered.length === 0) {
      console.log('No faculty members have registered with a real email yet.');
    } else {
      console.table(registered.map((r: any) => ({
        'Faculty ID': r.faculty_id,
        'Name': r.name,
        'Email': r.email,
        'Department': r.department,
        'Role': r.role,
        'Assigned Mentees': r.mentee_count,
        'Registered On': r.created_at ? new Date(r.created_at).toLocaleString() : 'N/A',
      })));
    }

    console.log('\n===============================================================');
    console.log(`📋 SAMPLE CSV PLACEHOLDERS / UNLINKED FACULTY (${placeholders.length} total):`);
    console.log('===============================================================\n');

    console.table(placeholders.slice(0, 15).map((r: any) => ({
      'Faculty ID': r.faculty_id,
      'Placeholder Name': r.name,
      'Department': r.department,
      'Assigned Mentees': r.mentee_count,
      'Email Status': r.email || 'None (pending_)',
    })));

    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error('Error fetching faculty details:', err.message);
    process.exit(1);
  }
}

listFaculty();
