// src/index.ts
// this is also known as the backend entry file

import { connectMongo } from "./db/mongo";
import "dotenv/config";
import express from "express";
import lessonRoutes from "./routes/lesson";
import progressRoutes from "./routes/progress";
import cors from "cors";

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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
