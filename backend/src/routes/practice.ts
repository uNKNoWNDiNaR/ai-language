//backend/src/routes/practice.ts

import { Router } from "express";
import { generatePractice } from "../controllers/practiceController";
import { submitPractice } from "../controllers/practiceSubmitController";

const router = Router();

router.post("/generate", generatePractice);

router.post("/submit", submitPractice);

export default router;

