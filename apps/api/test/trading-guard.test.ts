import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp,recoverPendingOrders } from '../src/app.js';
import type { Candidate } from '../src/trading-guard.js';
import { BinanceApiError } from '../src/binance.js';
import { PendingOrderConflict } from '../src/store.js';

const symbol={symbol:'BTCUSDT',contractType:'PERPETUAL',quoteAsset:'USDT',status:'TRADING',filters:[{filterType:'LOT_SIZE',stepSize:'0.001',minQty:'0.001'},{filterType:'PRICE_FILTER',tickSize:'0.1'},{filterType:'MIN_NOTIONAL',minNotional:'5'}]};
const order={environment:'testnet' as const,symbol:'BTCUSDT',side:'BUY' as const,type:'LIMIT' as const,quantity:'0.002',price:'50000',reduceOnly:false};
const connection={api_key:'fake-key',encrypted_secret:'fake-secret',verified_at:'2026-01-01'};

class FakeStore{
  stop=false;
  connections:{testnet:typeof connection|null;live:typeof connection|null}={testnet:connection,live:connection};
  candidates:Candidate[]=[];
  audits:{type:string;clientOrderId?:string}[]=[];
  sessions=new Map<string,{userId:string;expires:number}>();
  intents:any[]=[];
  pending=false;
  replaced:any;
  auditFails=false;
  async close(){}
  async login(username:string,password:string){return password==='password'?`user-${username}`:null}
  async createSession(hash:string,userId:string,expires:number){this.sessions.set(hash,{userId,expires})}
  async session(hash:string){return this.sessions.get(hash)??null}
  async deleteSession(hash:string){this.sessions.delete(hash)}
  async connection(environment:'testnet'|'live'){return this.connections[environment]}
  async saveConnection(){}
  async markConnectionVerified(){}
  async getStop(){return this.stop}
  async setStop(enabled:boolean){this.stop=enabled}
  async audit(type:string,_payload:unknown,_environment?:string,clientOrderId?:string){if(this.auditFails)throw new Error('audit down');this.audits.push({type,clientOrderId})}
  async replaceCandidates(...args:any[]){this.replaced=args}
  // 故意不按查询参数过滤：用于证明正式路由自身仍会校验候选绑定关系。
  async candidateRows(){return this.candidates}
  async hasPendingOpen(){return this.pending||this.intents.some(x=>['SUBMITTING','UNKNOWN'].includes(x.status))}
  async beginOrderSubmission(value:any){if(this.pending||this.intents.some(x=>x.userId===value.userId&&x.environment===value.environment&&x.symbol===value.symbol&&x.direction===value.direction&&['SUBMITTING','UNKNOWN'].includes(x.status)))throw new PendingOrderConflict('同向未决订单冲突');this.intents.push({...value,status:'SUBMITTING'});this.audits.push({type:'ORDER_SUBMITTING',clientOrderId:value.clientOrderId})}
  async updateOrderStatus(id:string,status:string){const row=this.intents.find(x=>x.id===id);if(row)row.status=status}
  async pendingOrders(){return this.intents.filter(x=>['SUBMITTING','UNKNOWN'].includes(x.status))}
  async orderByClientOrderId(_environment:string,id:string){return this.intents.find(x=>x.clientOrderId===id)??null}
  async recordRecoveryAttempt(id:string,at:number,notFound:boolean){const row=this.intents.find(x=>x.id===id);row.recoveryAttempts=(row.recoveryAttempts??0)+1;row.firstUnknownAt=row.firstUnknownAt??at;row.nextRecoveryAt=at+Math.min(60,2**row.recoveryAttempts)*1000;row.status=notFound&&row.recoveryAttempts>=3&&at-row.firstUnknownAt>=30_000?'NOT_FOUND':'UNKNOWN';return{status:row.status,recoveryAttempts:row.recoveryAttempts,firstUnknownAt:row.firstUnknownAt,nextRecoveryAt:row.nextRecoveryAt}}
  async auditByClientOrderId(){return[{event_type:'ORDER_UNKNOWN'}]}
}

class FakeGateway{
  exchangeInfoCalls=0;
  signedCalls:{path:string;method:string;params:Record<string,string|number|boolean>}[]=[];
  failExchangeInfo=false;
  failRecover=false;
  positionAmt='0.010';
  dualSidePosition=false;
  postError?:Error;
  queryError?:Error;
  postBlock?:Promise<void>;
  onPost?:()=>void;
  async exchangeInfo(){this.exchangeInfoCalls++;if(this.failExchangeInfo)throw new Error('fault: guard was bypassed');return{symbols:[symbol]}}
  async klines(){return[]}
  async markPrice(){return{markPrice:'50000'}}
  async syncTime(){return 1_000_000}
  async signed(_environment:string,path:string,method:string,_key:string,_secret:string,params:Record<string,string|number|boolean>){this.signedCalls.push({path,method,params});if(path==='/fapi/v1/positionSide/dual')return{dualSidePosition:this.dualSidePosition};if(path==='/fapi/v2/positionRisk')return[{symbol:'BTCUSDT',positionAmt:this.positionAmt}];if(path==='/fapi/v1/openOrders')return[];if(path==='/fapi/v1/openAlgoOrders')return[{symbol:'BTCUSDT',orderType:'STOP_MARKET',clientAlgoId:'ALGO-X'}];if(method==='POST'){this.onPost?.();if(this.postBlock)await this.postBlock;if(this.postError)throw this.postError}if(method==='GET'&&(path==='/fapi/v1/order'||path==='/fapi/v1/algoOrder')&&this.queryError)throw this.queryError;if(method==='GET'&&path==='/fapi/v1/order'&&this.failRecover)throw new Error('unknown');return{status:'NEW'}}
}

async function harness(){
 let now=1_000_000,id=0,session=0;
 const store=new FakeStore(),gateway=new FakeGateway();
 const app=await createApp({config:{APP_ORIGIN:'http://localhost:5173',SESSION_SECRET:'test-session-secret-at-least-24',COOKIE_SECURE:false},store,gateway,newId:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`,newSessionToken:()=>`session-${++session}`,now:()=>now,logger:false});
 const login=async(username='alice')=>{const response=await app.inject({method:'POST',url:'/api/auth/login',payload:{username,password:'password'}});assert.equal(response.statusCode,200);return response.headers['set-cookie']!.split(';')[0]};
 return{app,store,gateway,login,setNow:(value:number)=>{now=value}};
}

const candidate=(overrides:Partial<Candidate>={}):Candidate=>({userId:'user-alice',environment:'testnet',symbol:'BTCUSDT',direction:'LONG',expires:2_000_000,...overrides});
const confirmPayload=(preview:any,changedOrder=preview.order)=>({order:changedOrder,confirmationToken:preview.confirmationToken,confirmationText:'我确认按以上参数手动下单'});

test('正式敏感路由未登录统一返回 401',async()=>{const{app}=await harness();const requests=[
 {method:'POST',url:'/api/orders/preview',payload:order},
 {method:'POST',url:'/api/orders/confirm',payload:{}},
 {method:'POST',url:'/api/positions/testnet/BTCUSDT/close-preview',payload:{quantity:'0.001'}},
 {method:'POST',url:'/api/positions/close-confirm',payload:{}},
 {method:'PUT',url:'/api/settings/emergency-stop',payload:{enabled:true}},
 {method:'GET',url:'/api/orders/testnet/recover/HEYUE-X'}
 ] as const;for(const request of requests)assert.equal((await app.inject(request as any)).statusCode,401,request.url);await app.close()});

test('正式预览路由拒绝未验证连接，并在交易所调用前终止',async()=>{const{app,store,gateway,login}=await harness();const cookie=await login();store.connections.testnet={...connection,verified_at:null};store.candidates=[candidate()];gateway.failExchangeInfo=true;const response=await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order});assert.equal(response.statusCode,400);assert.match(response.json().message,/没有已验证/);assert.equal((await app.inject({method:'POST',url:'/api/positions/testnet/BTCUSDT/close-preview',headers:{cookie},payload:{quantity:'0.001'}})).statusCode,400);assert.equal(gateway.exchangeInfoCalls,0);assert.equal(gateway.signedCalls.length,0);await app.close()});

test('故障注入：正式预览路由强制候选用户、环境、合约、方向和有效期',async()=>{const{app,store,gateway,login}=await harness();const cookie=await login();gateway.failExchangeInfo=true;for(const row of[candidate({userId:'user-bob'}),candidate({environment:'live'}),candidate({symbol:'ETHUSDT'}),candidate({direction:'SHORT'}),candidate({expires:1_000_000})]){store.candidates=[row];const response=await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order});assert.equal(response.statusCode,400);assert.match(response.json().message,/候选池/)}assert.equal(gateway.exchangeInfoCalls,0,'若生产候选安全检查缺失，故障 exchangeInfo 会被调用并令用例失败');await app.close()});

test('正式确认路由绑定令牌用户、环境、参数哈希和过期时间',async()=>{const{app,store,login,setNow}=await harness();store.candidates=[candidate(),candidate({userId:'user-bob'}),candidate({environment:'live'})];const alice=await login(),bob=await login('bob');
 const preview=async()=> (await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie:alice},payload:order})).json();
 let value=await preview();assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie:bob},payload:confirmPayload(value)})).statusCode,400);
 value=await preview();assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie:alice},payload:confirmPayload(value,{...value.order,environment:'live'})})).statusCode,400);
 value=await preview();assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie:alice},payload:confirmPayload(value,{...value.order,quantity:'0.003'})})).statusCode,400);
 value=await preview();setNow(1_060_001);const expired=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie:alice},payload:confirmPayload(value)});assert.equal(expired.statusCode,400);assert.match(expired.json().message,/令牌无效|已过期/);await app.close()});

test('市价单正式确认哈希稳定，且令牌只能成功使用一次',async()=>{const{app,store,gateway,login}=await harness();store.candidates=[candidate()];const cookie=await login(),marketOrder={...order,type:'MARKET' as const,price:undefined},preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:marketOrder})).json(),payload=confirmPayload(preview);assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload})).statusCode,200);assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload})).statusCode,400);assert.equal(gateway.signedCalls.filter(x=>x.method==='POST').length,1);await app.close()});

test('kill switch 正式路由阻止开仓预览和已预览后的确认',async()=>{const{app,store,gateway,login}=await harness();store.candidates=[candidate()];const cookie=await login();assert.equal((await app.inject({method:'PUT',url:'/api/settings/emergency-stop',headers:{cookie},payload:{enabled:true}})).statusCode,200);assert.equal((await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).statusCode,403);await app.inject({method:'PUT',url:'/api/settings/emergency-stop',headers:{cookie},payload:{enabled:false}});const preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json();await app.inject({method:'PUT',url:'/api/settings/emergency-stop',headers:{cookie},payload:{enabled:true}});assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(preview)})).statusCode,403);assert.equal(gateway.signedCalls.filter(x=>x.method==='POST').length,0);await app.close()});

test('正式平仓预览和确认复用一次性令牌并提交 reduceOnly',async()=>{const{app,store,gateway,login}=await harness();store.stop=true;const cookie=await login(),previewResponse=await app.inject({method:'POST',url:'/api/positions/testnet/BTCUSDT/close-preview',headers:{cookie},payload:{quantity:'0.005'}});assert.equal(previewResponse.statusCode,200);const preview=previewResponse.json();assert.equal(preview.order.reduceOnly,true);const payload={order:preview.order,confirmationToken:preview.confirmationToken,confirmationText:'我确认按以上参数手动平仓'};assert.equal((await app.inject({method:'POST',url:'/api/positions/close-confirm',headers:{cookie},payload})).statusCode,200);assert.equal((await app.inject({method:'POST',url:'/api/positions/close-confirm',headers:{cookie},payload})).statusCode,400);const placed=gateway.signedCalls.find(x=>x.method==='POST');assert.equal(placed?.params.reduceOnly,'true');await app.close()});

test('未知订单正式恢复路由只查询，绝不调用 placeOrder',async()=>{const{app,store,gateway,login}=await harness();store.intents=[{id:'i1',status:'UNKNOWN',environment:'testnet',kind:'REGULAR',clientOrderId:'HEYUE-UNKNOWN'}];gateway.failRecover=true;const cookie=await login(),response=await app.inject({method:'GET',url:'/api/orders/testnet/recover/HEYUE-UNKNOWN',headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.json().status,'unknown');assert.deepEqual(gateway.signedCalls.map(x=>[x.path,x.method]),[['/fapi/v1/order','GET']]);assert.equal(gateway.signedCalls.some(x=>x.method==='POST'),false);await app.close()});

test('状态机原子进入 SUBMITTING/ACCEPTED，并阻止未决同向开仓',async()=>{const{app,store,login}=await harness();store.candidates=[candidate()];const cookie=await login(),preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json();store.pending=true;assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(preview)})).statusCode,409);assert.equal(store.intents.length,0,'唯一冲突事务不得留下 INTENT 脏记录');store.pending=false;const next=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json();assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(next)})).statusCode,200);assert.equal(store.intents.at(-1).status,'ACCEPTED');await app.close()});

test('两个正式确认并发时仅一个原子进入提交，冲突返回 409 且无脏意图',async()=>{const{app,store,gateway,login}=await harness();store.candidates=[candidate()];const cookie=await login(),first=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json(),second=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json();let release!:()=>void,entered!:()=>void;gateway.postBlock=new Promise<void>(resolve=>{release=resolve});const posting=new Promise<void>(resolve=>{entered=resolve});gateway.onPost=entered;const accepted=app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(first)});await posting;const conflict=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(second)});release();const success=await accepted;assert.deepEqual([success.statusCode,conflict.statusCode].sort(),[200,409]);assert.equal(store.intents.length,1);assert.equal(store.intents.some(x=>x.status==='INTENT'),false);assert.equal(gateway.signedCalls.filter(x=>x.method==='POST').length,1);await app.close()});

test('交易所确定 4xx 记为 REJECTED，网络异常记为 UNKNOWN 且都返回订单号',async()=>{for(const [error,expected,code]of[[new BinanceApiError('rejected',400,-1,false),'REJECTED',400],[new Error('socket reset'),'UNKNOWN',502]]as const){const{app,store,gateway,login}=await harness();store.candidates=[candidate()];gateway.postError=error;const cookie=await login(),preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json(),response=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(preview)});assert.equal(response.statusCode,code);assert.match(response.json().message,/HEYUE-/);assert.equal(store.intents.at(-1).status,expected);await app.close()}});

test('条件单走正式 Algo API 和当前参数名',async()=>{const{app,store,gateway,login}=await harness();store.candidates=[candidate()];const cookie=await login(),draft={...order,type:'STOP' as const,stopPrice:'49000'},preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:draft})).json(),response=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(preview)});assert.equal(response.statusCode,200);assert.equal(response.json().orderKind,'ALGO');const call=gateway.signedCalls.find(x=>x.method==='POST')!;assert.equal(call.path,'/fapi/v1/algoOrder');assert.equal(call.params.algoType,'CONDITIONAL');assert.equal(call.params.triggerPrice,'49000');assert.match(String(call.params.clientAlgoId),/^HEYUE-/);await app.close()});

test('下单持续复核单向持仓模式，双向模式明确拒绝',async()=>{const{app,store,gateway,login}=await harness();store.candidates=[candidate()];gateway.dualSidePosition=true;const cookie=await login(),preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json(),response=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(preview)});assert.equal(response.statusCode,400);assert.match(response.json().message,/双向持仓/);assert.equal(gateway.signedCalls.some(x=>x.method==='POST'),false);await app.close()});

test('any 扫描可为同一合约原子生成多空两个候选',async()=>{const{app,store,gateway,login}=await harness(),cookie=await login();(gateway as any).klines=async(_e:string,_s:string,interval:string)=>interval==='1w'?[[0,'1','0','0','2','0',1],[0,'2','0','0','3','0',2]]:[[0,'3','0','0','2','0',1],[0,'2','0','0','1','0',2]];const response=await app.inject({method:'POST',url:'/api/screen',headers:{cookie},payload:{environment:'testnet',weeklyUp:1,weeklyDown:3,dailyUp:3,dailyDown:1,mode:'any'}});assert.equal(response.statusCode,200);assert.deepEqual(response.json().candidates.map((x:any)=>x.direction).sort(),['LONG','SHORT']);assert.ok(store.replaced);await app.close()});

test('扫描失败超过阈值时保留原候选池并返回失败明细',async()=>{const{app,store,gateway,login}=await harness(),cookie=await login();(gateway as any).exchangeInfo=async()=>({symbols:[symbol,{...symbol,symbol:'ETHUSDT'}]});(gateway as any).klines=async(_e:string,s:string)=>{if(s==='ETHUSDT')throw new Error('timeout');return[[0,'1','0','0','2','0',1],[0,'2','0','0','3','0',2]]};const response=await app.inject({method:'POST',url:'/api/screen',headers:{cookie},payload:{environment:'testnet',weeklyUp:1,weeklyDown:1,dailyUp:1,dailyDown:1,mode:'any'}});assert.equal(response.statusCode,502);assert.equal(response.json().successCount,1);assert.deepEqual(response.json().failedSymbols,['ETHUSDT']);assert.equal(response.json().preserved,true);assert.equal(store.replaced,undefined);await app.close()});

test('生产 Cookie 可强制 Secure，登录失败有专用限频',async()=>{const store=new FakeStore(),gateway=new FakeGateway(),app=await createApp({config:{APP_ORIGIN:'https://example.test',SESSION_SECRET:'test-session-secret-at-least-24',COOKIE_SECURE:true},store,gateway,logger:false});const ok=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'alice',password:'password'}});assert.match(ok.headers['set-cookie']!,/Secure/);for(let i=0;i<4;i++)await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'alice',password:'bad'}});assert.equal((await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'alice',password:'bad'}})).statusCode,429);assert.ok(store.audits.some(x=>x.type==='LOGIN_FAILED'));await app.close()});

test('启动恢复仅查询未决订单且不重发',async()=>{const store=new FakeStore(),gateway=new FakeGateway();store.intents=[{id:'i1',status:'SUBMITTING',environment:'testnet',kind:'ALGO',clientOrderId:'HEYUE-A'}];await recoverPendingOrders(store as any,gateway as any);assert.equal(store.intents[0].status,'RECOVERED');assert.deepEqual(gateway.signedCalls.map(x=>[x.path,x.method]),[['/fapi/v1/algoOrder','GET']])});

test('Algo 当前委托、撤单和恢复均使用 Algo 路由',async()=>{const{app,store,gateway,login}=await harness(),cookie=await login();let response=await app.inject({method:'GET',url:'/api/account/testnet/orders',headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.json()[0].orderKind,'ALGO');response=await app.inject({method:'DELETE',url:'/api/orders/testnet/BTCUSDT/ALGO-X?kind=ALGO',headers:{cookie}});assert.equal(response.statusCode,200);store.intents=[{id:'i1',status:'UNKNOWN',environment:'testnet',kind:'ALGO',clientOrderId:'ALGO-X'}];response=await app.inject({method:'GET',url:'/api/orders/testnet/recover/ALGO-X',headers:{cookie}});assert.equal(response.statusCode,200);assert.ok(gateway.signedCalls.some(x=>x.path==='/fapi/v1/algoOrder'&&x.method==='DELETE'));assert.ok(gateway.signedCalls.some(x=>x.path==='/fapi/v1/algoOrder'&&x.method==='GET'));await app.close()});

test('Binance 成功后审计失败不会改写交易结果',async()=>{const{app,store,login}=await harness();store.candidates=[candidate()];const cookie=await login(),preview=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json();store.auditFails=true;const response=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(preview)});assert.equal(response.statusCode,200);assert.equal(response.json().status,'accepted');assert.equal(store.intents.at(-1).status,'ACCEPTED');await app.close()});

test('4xx -1007 仍记 UNKNOWN，并同时锁住新预览和已发令牌提交',async()=>{const{app,store,gateway,login}=await harness();store.candidates=[candidate()];const cookie=await login(),first=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json(),second=(await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).json();gateway.postError=new BinanceApiError('TIMEOUT',400,-1007,false);const unknown=await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(first)});assert.equal(unknown.statusCode,502);assert.equal(store.intents.at(-1).status,'UNKNOWN');gateway.postError=undefined;assert.equal((await app.inject({method:'POST',url:'/api/orders/preview',headers:{cookie},payload:order})).statusCode,409);assert.equal((await app.inject({method:'POST',url:'/api/orders/confirm',headers:{cookie},payload:confirmPayload(second)})).statusCode,409);assert.equal(gateway.signedCalls.filter(x=>x.method==='POST').length,1);await app.close()});

test('-2013 经可见性延迟、三次查询和退避后才终态 NOT_FOUND',async()=>{const{app,store,gateway,login,setNow}=await harness();store.intents=[{id:'i1',status:'UNKNOWN',environment:'testnet',kind:'REGULAR',clientOrderId:'HEYUE-MISSING'}];gateway.queryError=new BinanceApiError('NO_SUCH_ORDER',400,-2013,false);const cookie=await login();let response=await app.inject({method:'GET',url:'/api/orders/testnet/recover/HEYUE-MISSING',headers:{cookie}});assert.equal(response.json().status,'unknown');const calls=gateway.signedCalls.length;response=await app.inject({method:'GET',url:'/api/orders/testnet/recover/HEYUE-MISSING',headers:{cookie}});assert.equal(response.json().status,'retry-pending');assert.equal(gateway.signedCalls.length,calls);setNow(1_003_000);response=await app.inject({method:'GET',url:'/api/orders/testnet/recover/HEYUE-MISSING',headers:{cookie}});assert.equal(response.json().status,'unknown');setNow(1_031_000);response=await app.inject({method:'GET',url:'/api/orders/testnet/recover/HEYUE-MISSING',headers:{cookie}});assert.equal(response.json().status,'not-found');assert.equal(store.intents[0].status,'NOT_FOUND');assert.equal(await store.hasPendingOpen(),false);await app.close()});

test('服务崩溃在 SUBMITTING 后、POST 前时，启动只查且首次 -2013 保持 UNKNOWN',async()=>{const store=new FakeStore(),gateway=new FakeGateway();store.intents=[{id:'i1',status:'SUBMITTING',environment:'testnet',kind:'REGULAR',clientOrderId:'HEYUE-CRASH'}];gateway.queryError=new BinanceApiError('NO_SUCH_ORDER',400,-2013,false);await recoverPendingOrders(store as any,gateway as any,()=>1_000_000);assert.equal(store.intents[0].status,'UNKNOWN');assert.equal(store.intents[0].recoveryAttempts,1);assert.deepEqual(gateway.signedCalls.map(x=>x.method),['GET']);});

test('终态恢复只返回本地状态，不查询上游也不改写状态',async()=>{for(const status of['ACCEPTED','REJECTED','RECOVERED','NOT_FOUND']){const{app,store,gateway,login}=await harness();store.intents=[{id:'i1',status,environment:'testnet',kind:'REGULAR',clientOrderId:`HEYUE-${status}`}];const cookie=await login(),response=await app.inject({method:'GET',url:`/api/orders/testnet/recover/HEYUE-${status}`,headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.json().status,'local-terminal');assert.equal(response.json().localStatus,status);assert.equal(store.intents[0].status,status);assert.equal(gateway.signedCalls.length,0);await app.close()}});

test('API 返回基础安全响应头',async()=>{const{app}=await harness(),response=await app.inject({method:'GET',url:'/health'});assert.equal(response.headers['x-content-type-options'],'nosniff');assert.equal(response.headers['x-frame-options'],'DENY');assert.equal(response.headers['referrer-policy'],'no-referrer');await app.close()});
