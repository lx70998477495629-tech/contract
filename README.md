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
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
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

安全路由测试不需要数据库：生产入口和测试都使用 `createApp` 创建同一组正式路由；测试只注入 fake Store、fake BinanceGateway、时间和令牌生成器，不创建平行测试路由。`npm test` 会通过 `Fastify.inject` 调用正式接口，覆盖持久订单状态机、未决同向锁、启动只查询不重发、普通/Algo 分流、单向持仓、MARKET_LOT_SIZE、双向候选、扫描部分失败、Secure Cookie、登录限频及原有安全边界。SQL 测试会检查兼容迁移的关键约束；数据库持久层与 PostgreSQL 的真实执行仍需在 Docker Desktop 可用后完成，本机尚未执行。

## 生产 Compose 模板

生产模板不会把 PostgreSQL 端口暴露到宿主机，API、Web、Nginx 均配置健康检查或启动自恢复。先在环境中设置强随机的 `POSTGRES_PASSWORD`、`APP_MASTER_KEY_BASE64`、`SESSION_SECRET`、`INITIAL_ADMIN_PASSWORD`、HTTPS `APP_ORIGIN`、`TLS_CERT_PATH` 和 `TLS_KEY_PATH`，再运行：

```powershell
docker compose --profile production up -d --build
```

API 容器启动时先按 `schema_migration` 执行增量迁移，再扫描 `SUBMITTING/UNKNOWN` 订单并且只查询、不重发。`-1000/-1001/-1006/-1007`、HTTP 5xx 和传输异常都按执行状态未知处理，即使 HTTP 是 4xx 也不会释放同向开仓锁。恢复查询带指数退避；`-2013` 至少观察 3 次且从首次未知起超过 30 秒，才进入 `NOT_FOUND` 终态。不存在手工直接解锁接口。

条件单按 Binance 当前 Algo API 使用 `clientAlgoId`、`triggerPrice` 等字段；普通限价/市价单仍使用普通订单 API。API 返回基础安全响应头，API 与 Web 容器使用非 root 用户运行。

## 生产前置条件

本轮不部署云端。模板已包含 HTTPS 反向代理、生产 `Secure` Cookie、持久会话和不公开的 PostgreSQL；正式上线前仍需配置证书、数据库备份、密钥托管与测试网回归。当前公共 API 限流采用每环境保守请求间隔和 429/5xx/Retry-After 退避，尚未根据 Binance 返回的实时权重响应头动态调整；需在测试网压测中校准。当前环境没有 Docker，因此 PostgreSQL 增量迁移、Compose 镜像、健康检查和非 root 容器均只有静态检查，尚未真实运行验收。

当前密文仍为单主密钥格式；轮换时应先停写、备份数据库、用旧密钥逐条解密并以新密钥重加密，验证连接后再切换服务，不能直接替换环境变量。
