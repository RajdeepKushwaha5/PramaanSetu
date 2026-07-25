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

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
  }),
);
app.use(express.json({ limit: "30mb" })); // room for base64 image/short video

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
app.use("/api", campaignsRouter);

app.listen(PORT, () => {
  console.log(`PramaanSetu backend listening on http://localhost:${PORT}`);
});
