

import express from "express";
import lessonRoutes from "./routes/lesson"


const app = express();
app.use(express.json());


// Mount all lesson related rouutes under /lesson
const PORT = 3000;

app.use("/lesson", lessonRoutes)
app.listen(PORT, () =>{
    console.log(`Backend running on http://localhost:${PORT}`);
});
