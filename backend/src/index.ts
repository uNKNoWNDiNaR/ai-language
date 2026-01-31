// src/index.ts
// this is also known as the backend entry file

import { connectMongo } from "./db/mongo";
import "dotenv/config";
import express from "express";
import lessonRoutes from "./routes/lesson";
import progressRoutes from "./routes/progress";
import cors from "cors";
import practiceRoutes from "./routes/practice"
import { authMiddleware } from "./middleware/auth";

const PORT = process.env.PORT || 3000;

connectMongo();

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

app.use(express.json());
app.use(authMiddleware);

app.use("/lesson", lessonRoutes);
app.use("/progress", progressRoutes);
app.use("/practice", practiceRoutes);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

