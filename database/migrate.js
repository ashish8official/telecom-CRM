const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';
const defaultDbString = process.env.DEFAULT_DATABASE_URL || 'postgres://postgres:admin@localhost:5433/postgres';

async function createDbIfNotExists() {
    const client = new Client({ connectionString: defaultDbString });
    try {
        await client.connect();
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'crm_db'`);
        if (res.rowCount === 0) {
            console.log("Creating database crm_db...");
            await client.query(`CREATE DATABASE crm_db`);
        }
    } catch (err) {
        console.error("Failed to ensure database exists:", err.message);
        throw err;
    } finally {
        await client.end();
    }
}

async function migrate() {
    await createDbIfNotExists();

    const client = new Client({ connectionString });
    try {
        await client.connect();
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations_history (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        for (const file of files) {
            const { rowCount } = await client.query('SELECT 1 FROM migrations_history WHERE migration_name = $1', [file]);
            if (rowCount === 0) {
                console.log(`Executing migration: ${file}`);
                const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                try {
                    await client.query('BEGIN');
                    await client.query(sql);
                    await client.query('INSERT INTO migrations_history (migration_name) VALUES ($1)', [file]);
                    await client.query('COMMIT');
                    console.log(`Successfully applied ${file}`);
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`Error executing ${file}:`, err.message);
                    throw err; // Stop execution on first failure
                }
            }
        }
        console.log("All migrations applied successfully.");
    } catch (err) {
        console.error("Migration process failed:", err.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    migrate().catch(err => {
        console.error("Unhandled error during migration:", err);
        process.exitCode = 1;
    });
}

module.exports = { migrate };
