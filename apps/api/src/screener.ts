type Candle=[number,string,string,string,string,string,number]; export type Direction='LONG'|'SHORT';
export function closedCandles(rows:Candle[], now=Date.now()){ return rows.filter(x=>x[6]<now); }
export function streak(rows:Candle[], direction:Direction){ let n=0; for(const c of [...rows].reverse()){ const open=Number(c[1]),close=Number(c[4]); if((direction==='LONG'&&close>open)||(direction==='SHORT'&&close<open))n++; else break; } return n; }
export function passes(w:number,d:number, wt:number,dt:number,mode:'any'|'all'){ return mode==='all'?w>=wt&&d>=dt:w>=wt||d>=dt; }
