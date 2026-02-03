// src/index.ts
// this is also known as the backend entry file

import { connectMongo } from "./db/mongo";
import "dotenv/config";
import express from "express";
import lessonRoutes from "./routes/lesson";
import progressRoutes from "./routes/progress";
import cors from "cors";
import practiceRoutes from "./routes/practice";
import feedbackRoutes from "./routes/feedback";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { sendError } from "./http/sendError";

const PORT = process.env.PORT || 3000;

connectMongo();

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

//body size limit
app.use(express.json({limit: "1mb"}));

//basic rate limit (no PII)
app.use(rateLimitMiddleware);

// health BEFORE Auth
app.get("/health", (_req, res) => res.status(200).json({status: "ok"}));

app.use(authMiddleware);

app.use("/lesson", lessonRoutes);
app.use("/progress", progressRoutes);
app.use("/practice", practiceRoutes);
app.use("/feedback", feedbackRoutes)

//404
app.use((_req, res) => sendError(res, 404, "Not Found", "NOT_FOUND"));

//error handler
app.use((err: unknown, _req: any, res: any, next:any) => {
  const requestId = typeof res?.locals?.requestId === "string" ? res.locals.requestId: undefined;
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled_error",
      requestId,
      error: err instanceof Error ? err.message : String(err),
    })
  );
  if(res.headersSent) return next(err);
  return sendError(res, 500, "Server error");
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

