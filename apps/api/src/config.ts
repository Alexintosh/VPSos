import { z } from 'zod';

const configSchema = z.object({
  AUTH_TOKEN: z.string().min(1),
  AUTH_MODE: z.enum(['token']).default('token'),
  FS_SANDBOX: z.enum(['on', 'off']).default('on'),
  FS_ROOT: z.string().default('/'),
  ALLOW_RUN_AS_ROOT: z.coerce.boolean().default(false),
  DEFAULT_SHELL: z.string().default('/bin/bash'),
  DEFAULT_CWD: z.string().default('/'),
  MAX_PROCS: z.coerce.number().int().positive().default(32),
  MAX_PTY: z.coerce.number().int().positive().default(8),
  MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(500_000),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
  GIT_PULL_REBASE: z.coerce.boolean().default(true),
  GIT_DEFAULT_REMOTE: z.string().default('origin'),
  PORT: z.coerce.number().int().positive().default(3000)
});

export const config = configSchema.parse(process.env);
export type AppConfig = typeof config;
