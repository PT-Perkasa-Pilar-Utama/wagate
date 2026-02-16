import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WA1_NUMBER: z.string().min(10, "WA1_NUMBER is required (e.g. 628xxx)"),
  WA2_NUMBER: z.string().min(10, "WA2_NUMBER is required (e.g. 628xxx)"),
  DISPLAY_NAME_1: z.string().optional(),
  DISPLAY_NAME_2: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
const parsedEnv = EnvSchema.safeParse(Bun.env);

if (!parsedEnv.success) {
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsedEnv.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env: Env = parsedEnv.data;
export default env;
