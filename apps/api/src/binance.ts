import { createHmac } from 'node:crypto'; import { decrypt } from './crypto.js'; import type { Config } from './config.js';
export type Environment = 'testnet'|'live';
const urls={ testnet:'https://testnet.binancefuture.com', live:'https://fapi.binance.com' } as const;
export class BinanceGateway {
  private offset=0; constructor(private config:Config){}
  base(env:Environment){ return urls[env]; }
  async request(env:Environment,path:string, params:Record<string,string|number|boolean>={}, init:RequestInit={}, retries=2) { for(let i=0;;i++){ const res=await fetch(`${this.base(env)}${path}?${new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]))}`,init); if((res.status===429||res.status>=500)&&i<retries){ await new Promise(r=>setTimeout(r,300*(i+1))); continue; } if(!res.ok) throw new Error(`币安接口错误 ${res.status}`); return res.json(); } }
  async exchangeInfo(env:Environment='live'){ return this.request(env,'/fapi/v1/exchangeInfo'); }
  async klines(env:Environment,symbol:string, interval:'1d'|'1w', limit:number){ return this.request(env,'/fapi/v1/klines',{symbol,interval,limit}); }
  async markPrice(env:Environment,symbol:string){return this.request(env,'/fapi/v1/premiumIndex',{symbol}) as Promise<{markPrice:string}>;}
  async syncTime(env:Environment){ const res=await fetch(`${this.base(env)}/fapi/v1/time`); if(!res.ok) throw new Error('无法同步币安时间'); const data=await res.json() as {serverTime:number}; this.offset=data.serverTime-Date.now(); return data.serverTime; }
  async signed(env:Environment, path:string, method:'GET'|'POST'|'DELETE', apiKey:string, encryptedSecret:string, params:Record<string,string|number|boolean>) { const secret=decrypt(encryptedSecret,this.config.APP_MASTER_KEY_BASE64); const all={...params,timestamp:Date.now()+this.offset,recvWindow:5000}; const query=new URLSearchParams(Object.entries(all).map(([k,v])=>[k,String(v)])); query.set('signature',createHmac('sha256',secret).update(query.toString()).digest('hex')); const response=await fetch(`${this.base(env)}${path}?${query}`,{method,headers:{'X-MBX-APIKEY':apiKey}}); if(!response.ok) throw new Error(`币安私有接口错误 ${response.status}`); return response.json(); }
}
