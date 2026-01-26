"use strict";
//backend/src/routes/practice.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const practiceController_1 = require("../controllers/practiceController");
const practiceSubmitController_1 = require("../controllers/practiceSubmitController");
const router = (0, express_1.Router)();
router.post("/generate", practiceController_1.generatePractice);
router.post("/submit", practiceSubmitController_1.submitPractice);
exports.default = router;
