// Phase 1 原型补充交互：组合模式、空状态和实盘提示均为本地演示。
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  D.p.DOGEUSDT = 0.1638;
  D.p.ADAUSDT = 0.4119;
  function syncTradeSymbols() {
    const select = $('#symbol');
    const matches = candidates();
    const previous = select.value;
    select.innerHTML = matches.map(x => `<option value="${x[0]}">${x[0]} 永续 · ${x[1] === 'long' ? '做多候选' : '做空候选'}</option>`).join('');
    if (matches.some(x => x[0] === previous)) select.value = previous;
    const empty = matches.length === 0;
    select.disabled = empty;
    $('#no-symbols').classList.toggle('hidden', !empty);
    $('#preview-order').disabled = empty;
    const symbol = select.value;
    const price = D.p[symbol];
    $('#terminal-symbol').textContent = symbol || '暂无候选合约';
    $('#terminal-price').textContent = price ? price.toLocaleString() + ' USDT' : '--';
    $('#book-price').textContent = price ? price.toLocaleString() : '--';
    if (empty) $('#risk-preview').innerHTML = '<div><dt>订单状态</dt><dd>当前无符合筛选条件的合约</dd></div>';
    else risk();
  }
  const refresh = (message) => {
    const list = candidates();
    screenState(list.length ? 'table' : 'empty');
    pick();
    syncTradeSymbols();
    $('#candidate-note').textContent = combo === 'any'
      ? `任一周期命中 · 多 ${list.filter(x => x[1] === 'long').length} · 空 ${list.filter(x => x[1] === 'short').length}`
      : `全部周期命中 · 多 ${list.filter(x => x[1] === 'long').length} · 空 ${list.filter(x => x[1] === 'short').length}`;
    $('#empty-copy').textContent = combo === 'any'
      ? '当前阈值下，周线和日线都没有命中任一方向的候选。'
      : '当前阈值下，没有合约同时命中周线和日线的同方向条件。';
    if (message) note(message);
  };

  $$('[data-combination]').forEach(button => {
    button.onclick = () => {
      combo = button.dataset.combination;
      $$('[data-combination]').forEach(x => x.classList.toggle('selected', x === button));
      $('#combination-help').textContent = combo === 'any'
        ? '周线或日线达到对应方向阈值，即进入候选池。'
        : '周线和日线必须同时达到同方向对应阈值，才进入候选池。';
      refresh(`已切换为${button.textContent}（演示）`);
    };
  });

  $$('[data-filter]').forEach(button => {
    button.onclick = () => {
      f = button.dataset.filter;
      $$('[data-filter]').forEach(x => x.classList.toggle('selected', x === button));
      refresh();
    };
  });

  $('#apply-threshold').onclick = () => refresh('已应用阈值（演示）');
  $('#restore-data').onclick = () => {
    $('#empty-demo').checked = false;
    refresh();
  };

  function environmentChanged() {
    env = $('#environment').value;
    const live = env === 'live';
    $('#mode-pill').textContent = live ? '实盘流程演示' : '测试网演示';
    $('#trade-mode-pill').textContent = live ? '实盘流程演示' : '不会真实成交';
    $('#trade-description').textContent = live
      ? '实盘手动下单流程演示：必须风险预览与二次确认；原型不会真实成交。'
      : '模拟 USDⓈ-M 测试网下单；提交前会展示风险预览与二次确认。';
    $('#real-warning').classList.toggle('hidden', !live);
    $('#risk-note').textContent = live
      ? '实盘交易只能手动提交，必须查看风险预览并完成不可跳过的二次确认；紧急停止开仓会阻止新订单。'
      : '开仓前必须填写止损。正式版本会校验余额、精度和账户设置。';
    risk();
    note(live ? '已进入实盘流程演示：不会真实下单。' : '已切换为测试网演示。');
  }
  $('#environment').onchange = environmentChanged;
  $('#symbol').onchange = () => { syncTradeSymbols(); risk(); };
  refresh();
})();
