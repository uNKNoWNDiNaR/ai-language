// src/index.ts
// this is also known as the backend entry file

import { connectMongo } from "./db/mongo";
import "dotenv/config";
import express from "express";
import lessonRoutes from "./routes/lesson"
import cors from "cors"

//this uses theexpress backend
const app = express();
app.use(express.json());


// Mount all lesson related rouutes under /lesson
const PORT = process.env.PORT || 3000;


app.use(cors({
    origin: "*",  //    Vite frontend
    methods: ["GET", "POST"],
}));

connectMongo();

app.use("/lesson", lessonRoutes)
app.listen(PORT, () =>{
    console.log(`Backend running on http://localhost:${PORT}`);
});


// http://localhost:5173.  CORS launch site

