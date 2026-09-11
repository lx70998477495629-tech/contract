import pg from 'pg'; import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { encrypt } from './crypto.js'; import type { Config } from './config.js';
const { Pool } = pg;
function passwordHash(password: string, salt = randomUUID()) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function matches(password: string, stored: string) { const [salt, hash] = stored.split(':'); return timingSafeEqual(Buffer.from(hash,'hex'), scryptSync(password,salt,64)); }
export class Store {
  pool: pg.Pool; constructor(private config: Config) { this.pool = new Pool({ connectionString: config.DATABASE_URL }); }
  async close(){ await this.pool.end(); }
  async ensureAdmin() { if (!this.config.INITIAL_ADMIN_PASSWORD) return; const found=await this.pool.query('SELECT 1 FROM app_user LIMIT 1'); if (!found.rowCount) await this.pool.query('INSERT INTO app_user(id,username,password_hash) VALUES($1,$2,$3)',[randomUUID(),'admin',passwordHash(this.config.INITIAL_ADMIN_PASSWORD)]); }
  async login(username:string,password:string){ const r=await this.pool.query('SELECT id,password_hash FROM app_user WHERE username=$1',[username]); return r.rowCount && matches(password,r.rows[0].password_hash) ? r.rows[0].id as string : null; }
  async connection(environment:'testnet'|'live') { const r=await this.pool.query('SELECT api_key,encrypted_secret,verified_at FROM exchange_connection WHERE environment=$1',[environment]); return r.rowCount ? r.rows[0] as {api_key:string; encrypted_secret:string;verified_at:string|null}:null; }
  async saveConnection(environment:'testnet'|'live',apiKey:string,secret:string) { await this.pool.query(`INSERT INTO exchange_connection(id,environment,api_key,encrypted_secret,verified_at) VALUES($1,$2,$3,$4,NULL) ON CONFLICT(environment) DO UPDATE SET api_key=excluded.api_key,encrypted_secret=excluded.encrypted_secret,verified_at=NULL,updated_at=now()`,[randomUUID(),environment,apiKey,encrypt(secret,this.config.APP_MASTER_KEY_BASE64)]); }
  async markConnectionVerified(environment:'testnet'|'live'){await this.pool.query('UPDATE exchange_connection SET verified_at=now(),updated_at=now() WHERE environment=$1',[environment]);}
  async getStop(){ const r=await this.pool.query("SELECT value FROM app_setting WHERE key='emergency_stop'"); return !!r.rows[0]?.value?.enabled; }
  async setStop(enabled:boolean){ await this.pool.query("INSERT INTO app_setting(key,value) VALUES('emergency_stop',$1) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()",[JSON.stringify({enabled})]); }
  async audit(type:string, payload:unknown, environment?:string, clientOrderId?:string){ await this.pool.query('INSERT INTO audit_event(id,event_type,environment,client_order_id,payload) VALUES($1,$2,$3,$4,$5)',[randomUUID(),type,environment??null,clientOrderId??null,JSON.stringify(payload)]); }
  async replaceCandidates(userId:string, environment:'testnet'|'live', ruleHash:string, rows:{symbol:string;direction:string;closedAt:string}[]){await this.pool.query('DELETE FROM candidate_pool WHERE user_id=$1 AND environment=$2',[userId,environment]);for(const row of rows)await this.pool.query('INSERT INTO candidate_pool(user_id,environment,symbol,direction,rule_hash,closed_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval \'15 minutes\')',[userId,environment,row.symbol,row.direction,ruleHash,row.closedAt]);}
  async candidate(userId:string,environment:'testnet'|'live',symbol:string,side:'BUY'|'SELL'){const r=await this.pool.query('SELECT 1 FROM candidate_pool WHERE user_id=$1 AND environment=$2 AND symbol=$3 AND direction=$4 AND expires_at>now()',[userId,environment,symbol,side==='BUY'?'LONG':'SHORT']);return !!r.rowCount;}
  async auditByClientOrderId(environment:'testnet'|'live',clientOrderId:string){const r=await this.pool.query('SELECT event_type,payload,created_at FROM audit_event WHERE environment=$1 AND client_order_id=$2 ORDER BY created_at DESC',[environment,clientOrderId]);return r.rows;}
}
