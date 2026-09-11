// Phase 1 双栏手动下单演示，不连接交易所。
(() => {
  const orderTypes = ['限价','市价','止损限价','止损市价','止盈限价','止盈市价','跟踪委托'];
  const $ = s => document.querySelector(s);
  const oldSymbol = $('#symbol');
  const container = document.querySelector('.terminal-order');
  container.innerHTML = `<div class="terminal-head"><span>手动下单</span><span class="pill demo">演示，不真实提交</span></div><label class="symbol-bar">候选合约<select id="symbol">${oldSymbol.innerHTML}</select></label><div id="no-symbols" class="terminal-empty hidden">当前筛选没有候选合约。请返回筛选页调整条件。</div><div class="dual-panels">${['long','short'].map(kind => `<section class="order-panel ${kind}"><h3>${kind==='long'?'买入 / 做多':'卖出 / 做空'}</h3><p>${kind==='long'?'看涨方向的手动开仓演示':'看跌方向的手动开仓演示'}</p><label>订单类型<select data-field="type">${orderTypes.map((x,i)=>`<option value="${x==='市价'?'MARKET':x==='限价'?'LIMIT':x}" ${i===0?'selected':''}>${x}</option>`).join('')}</select></label><div class="condition-fields"></div><label>杠杆<select data-field="leverage"><option>3x</option><option selected>5x</option><option>10x</option><option>20x</option></select></label><label>保证金（USDT）<input data-field="margin" type="number" min="1" value="100" /></label><div class="panel-row"><label>止损价（必填）<input data-field="stop" type="number" placeholder="必填" /></label><label>止盈价（可选）<input data-field="take" type="number" placeholder="可选" /></label></div><div class="panel-error hidden"></div><div class="mini-preview">填写参数后显示本侧预览</div><button class="button ${kind==='long'?'buy-submit':'sell-submit'} wide panel-submit" data-side="${kind==='long'?'BUY':'SELL'}">${kind==='long'?'预览买入 / 做多':'预览卖出 / 做空'}</button></section>`).join('')}</div><div class="hidden legacy-fields"><select id="order-type"><option value="LIMIT">限价</option></select><select id="leverage"><option selected>5x</option></select><input id="margin" value="100" /><input id="limit-price" /><input id="stop-loss" /><input id="take-profit" /><label id="limit-price-row"></label><button id="preview-order"></button></div><p class="terminal-disclaimer">这是可点击演示原型。不会连接交易所、读取真实盘口或发送订单。</p>`;
  const fieldsFor = type => {
    if(type==='MARKET') return '<small>按示例参考价格成交。无需填写委托价格。</small>';
    if(type==='LIMIT') return '<label>委托价格（必填）<input data-field="limit" type="number" placeholder="输入价格" /></label>';
    if(type==='止损限价'||type==='止盈限价') return '<div class="panel-row"><label>触发价（必填）<input data-field="trigger" type="number" /></label><label>委托价格（必填）<input data-field="limit" type="number" /></label></div>';
    if(type==='止损市价'||type==='止盈市价') return '<label>触发价（必填）<input data-field="trigger" type="number" /></label>';
    return '<div class="panel-row"><label>激活价（可选）<input data-field="activation" type="number" /></label><label>回调比例 %（必填）<input data-field="callback" type="number" min="0.1" step="0.1" placeholder="例如 1" /></label></div><small>跟踪委托会随示例价格变化触发，原型不跟踪真实市场。</small>';
  };
  function panelData(panel){ const get=n=>panel.querySelector(`[data-field="${n}"]`)?.value||''; return {type:get('type'),lev:get('leverage'),margin:get('margin'),stop:get('stop'),take:get('take'),limit:get('limit'),trigger:get('trigger'),callback:get('callback')}; }
  function update(panel){ const d=panelData(panel), sym=$('#symbol').value, price=D.p[sym]; const isLong=panel.classList.contains('long'), n=(+d.margin||0)*(+d.lev.replace('x','')||0), q=price?(n/price).toFixed(sym==='BTCUSDT'?4:2):'--'; panel.querySelector('.mini-preview').innerHTML=`<span>${isLong?'买入 / 做多':'卖出 / 做空'} · ${d.type||'未选类型'}</span><b>名义金额 ${n||0} USDT</b><span>预估数量 ${q} ${sym.replace('USDT','')}</span>`; }
  function renderFields(panel){ const type=panel.querySelector('[data-field="type"]').value; panel.querySelector('.condition-fields').innerHTML=fieldsFor(type); panel.querySelectorAll('input').forEach(x=>x.oninput=()=>update(panel)); update(panel); }
  document.querySelectorAll('.order-panel').forEach(panel=>{ panel.querySelector('[data-field="type"]').onchange=()=>renderFields(panel); panel.querySelector('[data-field="leverage"]').onchange=()=>update(panel); panel.querySelector('[data-field="margin"]').oninput=()=>update(panel); renderFields(panel); });
  $('#symbol').onchange=()=>document.querySelectorAll('.order-panel').forEach(update);
  document.querySelectorAll('.panel-submit').forEach(button=>button.onclick=()=>{
    const panel=button.closest('.order-panel'), d=panelData(panel), isLong=button.dataset.side==='BUY', price=D.p[$('#symbol').value], error=panel.querySelector('.panel-error');
    let msg=!d.margin?'请输入保证金。':!d.stop?'必须填写止损价。':(d.type!=='MARKET'&&d.type!=='止损市价'&&d.type!=='止盈市价'&&d.type!=='跟踪委托'&&!d.limit?'请填写委托价格。':((d.type.includes('止损')||d.type.includes('止盈'))&&!d.trigger?'请填写触发价。':(d.type==='跟踪委托'&&!d.callback?'请填写回调比例。':'')));
    if(!msg && isLong && +d.stop>=price) msg='做多止损价应低于示例参考价。';
    if(!msg && !isLong && +d.stop<=price) msg='做空止损价应高于示例参考价。';
    error.textContent=msg; error.classList.toggle('hidden',!msg); if(msg)return;
    side=button.dataset.side; $('#order-type').innerHTML=`<option value="${d.type==='市价'?'MARKET':d.type==='限价'?'LIMIT':d.type}" selected>${d.type}</option>`; $('#leverage').innerHTML=`<option selected>${d.lev}</option>`; $('#margin').value=d.margin; $('#limit-price').value=d.limit||d.trigger||''; $('#stop-loss').value=d.stop; $('#take-profit').value=d.take;
    const n=(+d.margin)*(+d.lev.replace('x','')), direction=isLong?'买入 / 做多':'卖出 / 做空';
    $('#confirm-summary').innerHTML=`<div><span>合约与方向</span><b>${$('#symbol').value} · ${direction}</b></div><div><span>订单类型</span><b>${d.type}</b></div><div><span>名义金额</span><b>${n} USDT · ${d.lev}</b></div><div><span>止损 / 止盈</span><b>${d.stop} / ${d.take||'未设置'}</b></div>`;
    const live=env==='live'; $('#modal-title').textContent=live?'确认提交实盘订单？':'确认提交模拟订单？'; $('#modal-risk').textContent=live?'实盘流程演示：请核对方向、订单类型、触发条件和风险参数。':'演示操作：只会更新本页面模拟记录。'; $('#live-confirm-wrap').classList.toggle('hidden',!live); $('#live-confirm').checked=false; $('#confirm-order').textContent=live?'确认手动实盘下单（演示）':'确认模拟下单'; $('#modal').classList.remove('hidden');
  });
})();
