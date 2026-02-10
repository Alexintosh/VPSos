import { z } from 'zod';

const configSchema = z.object({
  REQUIRE_AUTH: z.coerce.boolean().default(true),
  USER_PASSWORD: z.string().optional(),
  AUTH_TOKEN: z.string().optional(),
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
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000)
}).superRefine((val, ctx) => {
  if (val.REQUIRE_AUTH && !val.USER_PASSWORD && !val.AUTH_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'REQUIRE_AUTH is true but no USER_PASSWORD or AUTH_TOKEN was provided'
    });
  }
});

export const config = configSchema.parse(process.env);
export type AppConfig = typeof config;
