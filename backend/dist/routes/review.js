"use strict";
// backend/src/routes/review.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reviewController_1 = require("../controllers/reviewController");
const router = (0, express_1.Router)();
// Calm, optional review suggestions (no gamification)
router.post("/suggest", reviewController_1.suggestReview);
router.get("/suggested", reviewController_1.suggestReview);
router.get("/debug", reviewController_1.debugReview);
exports.default = router;
