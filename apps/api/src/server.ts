import 'dotenv/config';
import { getConfig } from './config.js';
import { Store } from './store.js';
import { BinanceGateway } from './binance.js';
import { createApp, recoverPendingOrders } from './app.js';

const config = getConfig();
const store = new Store(config);
await store.ensureAdmin();
const gateway = new BinanceGateway(config);
await recoverPendingOrders(store,gateway);
const app = await createApp({ config, store, gateway, closeStoreOnClose: true });
await app.listen({ port: config.PORT, host: config.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1' });
