import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { getConfig } from './config.js';
const pool=new pg.Pool({connectionString:getConfig().DATABASE_URL});
await pool.query('CREATE TABLE IF NOT EXISTS schema_migration(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
const directory=new URL('../../../infra/postgres/',import.meta.url);
for(const name of(await readdir(directory)).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
 if((await pool.query('SELECT 1 FROM schema_migration WHERE name=$1',[name])).rowCount)continue;
 const client=await pool.connect();try{await client.query('BEGIN');await client.query(await readFile(new URL(name,directory),'utf8'));await client.query('INSERT INTO schema_migration(name) VALUES($1)',[name]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
await pool.end();console.log('迁移完成');
