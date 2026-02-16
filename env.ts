import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
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
