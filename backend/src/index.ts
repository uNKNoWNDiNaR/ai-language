// backend/src/index.ts

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import lessonRoutes from "./routes/lesson";
import progressRoutes from "./routes/progress";
import practiceRoutes from "./routes/practice";
import feedbackRoutes from "./routes/feedback";
import reviewRoutes from "./routes/review";

import { authMiddleware } from "./middleware/auth";
import { requestContextMiddleware } from "./middleware/requestContext";
import { errorEnvelopeMiddleware } from "./middleware/errorEnvelope";
import { rateLimitMiddleware } from "./middleware/rateLimit";

// Keep body limit without adding complexity.
// (If you already created jsonSizeLimit.ts, you can swap this back later.)
dotenv.config();

const app = express();

app.use(cors());
app.use(requestContextMiddleware);
app.use(rateLimitMiddleware);

app.get("/health", (_req, res) => res.status(200).send("ok"));

// Apply JSON parsing with a sane size limit.
// This replaces the broken jsonSizeLimit usage + avoids double-parsing.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "64kb" }));

app.use(authMiddleware);

app.use("/lesson", lessonRoutes);
app.use("/progress", progressRoutes);
app.use("/practice", practiceRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/review", reviewRoutes);

app.use(errorEnvelopeMiddleware);

const PORT = Number(process.env.PORT || 3000);

// Backward-compatible env support (keeps old working setups)
const MONGO_URL =
  process.env.MONGO_URL || process.env.MONGO_URI || process.env.MONGODB_URI || "";

mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => console.error("MongoDB connection error:", error));
