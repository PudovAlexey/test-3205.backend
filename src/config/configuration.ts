export interface AppConfig {
  port: number;
  maxConcurrency: number;
  delayMaxMs: number;
  headTimeoutMs: number;
  corsOrigin: string;
  logLevel: string;
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const configuration = (): AppConfig => ({
  port: toInt(process.env.PORT, 3000),
  maxConcurrency: toInt(process.env.MAX_CONCURRENCY, 5),
  delayMaxMs: toInt(process.env.DELAY_MAX_MS, 10000),
  headTimeoutMs: toInt(process.env.HEAD_TIMEOUT_MS, 10000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  logLevel: process.env.LOG_LEVEL ?? 'info',
});

export default configuration;
