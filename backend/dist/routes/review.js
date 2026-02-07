"use strict";
// backend/src/routes/review.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reviewController_1 = require("../controllers/reviewController");
const router = (0, express_1.Router)();
// Existing suggested review (lesson review items)
router.post("/suggest", reviewController_1.suggestReview);
// New review queue endpoints
router.get("/suggested", reviewController_1.getReviewSuggested);
router.post("/submit", reviewController_1.submitReview);
router.post("/generate", reviewController_1.generateReview);
router.get("/debug", reviewController_1.debugReview);
exports.default = router;
