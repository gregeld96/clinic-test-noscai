import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/noscai_clinic';

const pool = new Pool({
    connectionString,
});

export const db = drizzle(pool, { schema });
export { pool };
