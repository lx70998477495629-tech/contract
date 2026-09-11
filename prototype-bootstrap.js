// 防止原型首次绘制时无合约可选；加载后会由筛选结果同步覆盖。
document.querySelector('#symbol').innerHTML = '<option value="BTCUSDT">BTCUSDT 永续</option>';
