const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:admin@localhost:5433/crm_db';

async function rollback(steps = 1) {
    const client = new Client({ connectionString });
    await client.connect();
    
    const { rows } = await client.query(`
        SELECT migration_name FROM migrations_history 
        ORDER BY id DESC LIMIT $1
    `, [steps]);

    if (rows.length === 0) {
        console.log("No migrations to rollback.");
        await client.end();
        return;
    }

    const rollbacksDir = path.join(__dirname, 'rollbacks');

    for (const row of rows) {
        const migrationName = row.migration_name;
        const rollbackFile = migrationName.replace('.sql', '_down.sql');
        const rollbackPath = path.join(rollbacksDir, rollbackFile);

        if (fs.existsSync(rollbackPath)) {
            console.log(`Rolling back: ${migrationName} using ${rollbackFile}`);
            const sql = fs.readFileSync(rollbackPath, 'utf8');
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('DELETE FROM migrations_history WHERE migration_name = $1', [migrationName]);
                await client.query('COMMIT');
                console.log(`Successfully rolled back ${migrationName}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`Error rolling back ${migrationName}:`, err);
                process.exit(1);
            }
        } else {
            console.warn(`Rollback file ${rollbackFile} not found for ${migrationName}! Cannot safely rollback.`);
            process.exit(1);
        }
    }
    
    console.log("Rollback completed.");
    await client.end();
}

if (require.main === module) {
    const steps = process.argv[2] ? parseInt(process.argv[2]) : 1;
    rollback(steps).catch(console.error);
}

module.exports = { rollback };
