import "dotenv/config";
import { z } from "zod";

// Single source of truth for configuration shape and defaults — validated
// once at process startup so a missing/malformed env var fails loudly here,
// not as a confusing error three layers deep in an adapter.
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().min(1).default("8h"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive().default(10),

  CORS_ALLOWED_ORIGINS: z.string().optional().default(""),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  DATABASE_URL: z.string().min(1),
  // Integration tests truncate tables between cases (see
  // tests/integration/repositories.test.js's beforeEach) — pointed at
  // DATABASE_URL, that wipes whatever `npm run ingest` populated out from
  // under local dev (issue #35). Only consulted when NODE_ENV=test; CI
  // (which sets neither NODE_ENV nor this var, only DATABASE_URL) falls
  // through to DATABASE_URL unchanged, since its Postgres is ephemeral
  // per run anyway and has nothing to lose.
  TEST_DATABASE_URL: z.string().optional().default(""),

  OLLAMA_HOST: z.string().min(1).default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
  OLLAMA_EMBED_MODEL: z.string().min(1).default("nomic-embed-text"),

  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().min(1).default("gemini-1.5-flash"),

  LLM_PROVIDER_CHAIN: z.string().min(1).default("ollama,gemini"),

  RETRIEVAL_TOP_K: z.coerce.number().int().positive().default(8),
  RETRIEVAL_REFUSAL_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),

  OCR_LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(100).default(70),
  OCR_UNUSABLE_THRESHOLD: z.coerce.number().min(0).max(100).default(40),

  // 20MB — generous for a CV/policy-doc PDF (the corpus's largest real
  // document is a fraction of this) while still bounding worst-case memory/
  // OCR/embedding cost per upload (OWASP Web Top 10: unrestricted upload).
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
});

function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration — ${issues}`);
  }

  const data = parsed.data;
  return Object.freeze({
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    jwtSecret: data.JWT_SECRET,
    jwtExpiresIn: data.JWT_EXPIRES_IN,
    bcryptSaltRounds: data.BCRYPT_SALT_ROUNDS,
    corsAllowedOrigins: Object.freeze(
      data.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    ),
    rateLimit: Object.freeze({ max: data.RATE_LIMIT_MAX, windowMs: data.RATE_LIMIT_WINDOW_MS }),
    databaseUrl: data.NODE_ENV === "test" && data.TEST_DATABASE_URL ? data.TEST_DATABASE_URL : data.DATABASE_URL,
    ollama: Object.freeze({ host: data.OLLAMA_HOST, model: data.OLLAMA_MODEL, embedModel: data.OLLAMA_EMBED_MODEL }),
    gemini: Object.freeze({ apiKey: data.GEMINI_API_KEY, model: data.GEMINI_MODEL }),
    llmProviderChain: Object.freeze(data.LLM_PROVIDER_CHAIN.split(",").map((s) => s.trim())),
    retrieval: Object.freeze({ topK: data.RETRIEVAL_TOP_K, refusalThreshold: data.RETRIEVAL_REFUSAL_THRESHOLD }),
    ocr: Object.freeze({ lowConfidenceThreshold: data.OCR_LOW_CONFIDENCE_THRESHOLD, unusableThreshold: data.OCR_UNUSABLE_THRESHOLD }),
    maxUploadSizeBytes: data.MAX_UPLOAD_SIZE_BYTES,
  });
}

export { loadConfig, EnvSchema };
