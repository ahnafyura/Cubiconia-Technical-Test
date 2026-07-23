import { z } from 'zod';

/** Divalidasi saat boot. Aplikasi menolak start kalau ada yang salah —
 *  bukan gagal saat request pertama masuk. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('12h'),
  APPROVAL_THRESHOLD_IDR: z.coerce.bigint().default(5000000n),
  MAX_DISTRIBUTION_LAYERS: z.coerce.number().default(10),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(2000),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Konfigurasi environment tidak valid:\n${issues}`);
  }
  return parsed.data;
}
