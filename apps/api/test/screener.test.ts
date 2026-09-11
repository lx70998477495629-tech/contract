import test from 'node:test'; import assert from 'node:assert/strict'; import { closedCandles, passes, streak } from '../src/screener.js';
const now=1_000_000;
const candle=(open:string,close:string,closeTime:number)=>[0,open,'0','0',close,'0',closeTime] as [number,string,string,string,string,string,number];
test('只使用已收盘 K 线，且连续根数从最近一根向前计算',()=>{const rows=[candle('1','2',now-3),candle('2','3',now-2),candle('4','3',now-1),candle('3','4',now+1)];const closed=closedCandles(rows,now);assert.equal(closed.length,3);assert.equal(streak(closed,'SHORT'),1);assert.equal(streak(closed,'LONG'),0);});
test('任一和全部周期组合正确',()=>{assert.equal(passes(3,1,3,2,'any'),true);assert.equal(passes(3,1,3,2,'all'),false);assert.equal(passes(3,2,3,2,'all'),true);});
