export type Token={userId:string;environment:'testnet'|'live';hash:string;expires:number;scanId?:string;ruleHash?:string};
export type Candidate={userId:string;environment:'testnet'|'live';symbol:string;direction:'LONG'|'SHORT';expires:number;scanId?:string;ruleHash?:string};
export class TradingGuard {
  private tokens=new Map<string,Token>(); constructor(private now=()=>Date.now()){}
  issue(id:string,token:Token){this.tokens.set(id,token)}
  consume(id:string,userId:string,environment:'testnet'|'live',hash:string,candidate?:Candidate){const token=this.tokens.get(id);this.tokens.delete(id);return !!token&&token.userId===userId&&token.environment===environment&&token.hash===hash&&token.expires>this.now()&&(!token.scanId||token.scanId===candidate?.scanId)&&(!token.ruleHash||token.ruleHash===candidate?.ruleHash)}
  candidate(rows:Candidate[],userId:string,environment:'testnet'|'live',symbol:string,side:'BUY'|'SELL'){return rows.some(x=>x.userId===userId&&x.environment===environment&&x.symbol===symbol&&x.direction===(side==='BUY'?'LONG':'SHORT')&&x.expires>this.now())}
  canPreview(args:{verified:boolean;stopped:boolean;candidate:boolean;reduceOnly:boolean}){return args.verified&&args.candidate&&(args.reduceOnly||!args.stopped)}
}
