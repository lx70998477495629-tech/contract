import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(), APP_MASTER_KEY_BASE64: z.string().min(40),
  SESSION_SECRET: z.string().min(24), APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(3001), INITIAL_ADMIN_PASSWORD: z.string().min(12).optional()
});
export type Config = z.infer<typeof schema>;
export function getConfig(env = process.env): Config { return schema.parse(env); }
