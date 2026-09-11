import 'dotenv/config'; import { readFile } from 'node:fs/promises'; import pg from 'pg'; import { getConfig } from './config.js';
const pool=new pg.Pool({connectionString:getConfig().DATABASE_URL}); await pool.query(await readFile(new URL('../../../infra/postgres/001_init.sql',import.meta.url),'utf8')); await pool.end(); console.log('迁移完成');
