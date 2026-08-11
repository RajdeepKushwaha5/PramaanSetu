import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { healthRouter } from "./routes/health.js";
import { riskRouter } from "./routes/risk.js";
import { issuersRouter } from "./routes/issuers.js";
import { signRouter } from "./routes/sign.js";
import { verifyRouter } from "./routes/verify.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { seedRouter } from "./routes/seed.js";
import { revokeRouter } from "./routes/revoke.js";
import { detectionRouter } from "./routes/detection.js";
import { startTelegramBot } from "./bot/telegram.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
  }),
);
// 40mb JSON body: base64 inflates bytes ~1.37x, so this comfortably clears the
// frontend's 20 MB file cap (~27 MB encoded) with headroom for short video/audio.
app.use(express.json({ limit: "40mb" }));

// Basic rate limiting to make abuse harder.
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120, // 120 requests/min/IP
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get("/", (_req, res) => {
  res.json({
    service: "pramaansetu-backend",
    endpoints: [
      "GET  /api/health",
      "GET  /api/issuers",
      "POST /api/issuers (admin)",
      "POST /api/sign",
      "POST /api/verify",
      "POST /api/risk",
      "GET  /api/campaigns",
      "GET  /api/dashboard",
      "GET  /api/evidence",
      "GET  /api/evidence/:campaignId",
      "GET  /api/log",
      "GET  /api/detection/metrics",
      "POST /api/seed",
    ],
  });
});

app.use("/api/health", healthRouter);
app.use("/api/risk", riskRouter);
app.use("/api/issuers", issuersRouter);
app.use("/api/sign", signRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/seed", seedRouter);
app.use("/api/revoke", revokeRouter);
app.use("/api/detection", detectionRouter);
app.use("/api", campaignsRouter);

// Production config sanity checks (warn loudly rather than allow-all silently).
if ((process.env.NODE_ENV ?? "development") === "production") {
  if (!process.env.CORS_ORIGIN) {
    console.warn("[config] NODE_ENV=production but CORS_ORIGIN is unset - CORS is permissive. Set CORS_ORIGIN to your frontend origin(s).");
  }
  if ((process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true")) {
    console.warn("[config] DEMO_MODE is ON in production - demo issuers can sign without a key. Intended only for a public demo.");
  }
}

app.listen(PORT, () => {
  console.log(`PramaanSetu backend listening on http://localhost:${PORT}`);
  // Optional messaging-app channel (activates only if TELEGRAM_BOT_TOKEN is set).
  if (!startTelegramBot()) {
    console.log("Telegram bot inactive (set TELEGRAM_BOT_TOKEN to enable).");
  }
});
