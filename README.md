# 合约助手

正式 Web MVP：React/Vite 前端、Fastify 后端、PostgreSQL。根目录旧 HTML/JS 是已确认的 Phase 1 原型参考，不是程序入口。

## 已实现

- 币安 USDⓈ-M USDT 永续筛选：仅已收盘周线/日线，四项连续根数和任一/全部组合；扫描全部合规合约，6 路受控并发。
- 候选池持久化为“用户 + 环境 + 合约 + 方向”，15 分钟失效；预览和确认都在后端复核，不能只靠前端下拉框绕过。
- 测试网与实盘独立连接。保存新密钥会取消已验证状态；只有已保存且测试成功的当前环境可交易。
- API Secret 仅在后端，以 AES-256-GCM 加密持久化；不会由接口返回或写入日志。
- 市价、限价、止损/止盈限价和市价、跟踪委托；预览校验字段、正数、合约 tickSize/stepSize、最小数量和名义价值。
- 人工下单和手动平仓：短期一次性确认令牌、参数哈希绑定、确认文字；平仓为正确反向 `reduceOnly` 市价单。
- 账户持仓/当前委托、撤单、未知订单按 clientOrderId 恢复查询；未知状态绝不自动重发。

## 本地运行

需要 Node.js 22+ 和 Docker Desktop。

```powershell
Copy-Item .env.example .env
# 设置随机 APP_MASTER_KEY_BASE64、SESSION_SECRET、INITIAL_ADMIN_PASSWORD
docker compose up -d postgres
npm install
npm run migrate -w @heyue/api
npm run dev
```

打开 `http://localhost:5173`，首次账号为 `admin`，密码为 `.env` 的 `INITIAL_ADMIN_PASSWORD`。请勿在聊天或前端中发送 API Secret。

## 自动验证

```powershell
npm run lint
npm run build
npm test
```

已覆盖已收盘 K 线/组合规则、订单字段和精度校验。尚未在本机验证 Docker 数据库、实际测试网 Key、真实账户订单、撤单和平仓：这些必须由测试人员使用测试网环境完成。未配置连接时，应用安全报错，不会伪造交易成功。

安全测试不需要数据库：`npm test` 包含候选池用户/环境/方向/过期限制、未验证连接、紧急停止、确认令牌用户/环境/哈希/过期/单次消费，以及未知订单查询不重发的 Fastify 路由级测试。数据库持久层和真实路由与 PostgreSQL 的集成回归需在 Docker Desktop 可用后执行以上“本地运行”步骤；本机尚未执行该套测试。

## 生产前置条件

本轮不部署云端。生产前必须配置 HTTPS、反向代理、`Secure` Cookie、持久会话存储、受限来源和备份策略，并完成测试网回归。
