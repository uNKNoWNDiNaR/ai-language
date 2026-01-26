// src/index.ts
// this is also known as the backend entry file

import { connectMongo } from "./db/mongo";
import "dotenv/config";
import express from "express";
import lessonRoutes from "./routes/lesson";
import progressRoutes from "./routes/progress";
import cors from "cors";
import practiceRoutes from "./routes/practice"

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

connectMongo();

app.use("/lesson", lessonRoutes);
app.use("/progress", progressRoutes);
app.use("/practice", practiceRoutes);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

