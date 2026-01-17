"use strict";
// src/controllers/lessonController.ts
// Day 2 MVP backend lesson loop and retry logic
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionHandler = exports.submitAnswer = exports.startLesson = void 0;
const sessionState_1 = require("../state/sessionState");
const promptBuilder_1 = require("../ai/promptBuilder");
const openaiClient_1 = require("../ai/openaiClient");
const basic_1_1 = require("../lessons/basic-1");
const sessionStore_1 = require("../storage/sessionStore");
//----------------------
// Helper: map state ->tutor intent
//----------------------
function getTutorIntent(state, isCorrect) {
    if (state === "COMPLETE")
        return "END_LESSON";
    if (state === "ADVANCE")
        return "ADVANCE_LESSON";
    if (isCorrect === false)
        return "ENCOURAGE_RETRY";
    return "ASK_QUESTION";
}
//----------------------
// Start lesson
//----------------------
const startLesson = async (req, res) => {
    const { userId } = req.body;
    //check for presence of userId
    if (!userId) {
        return res.status(400).json({ error: "UserId is required" });
    }
    //Prevent overwriting existing session
    if (await (0, sessionStore_1.getSession)(userId)) {
        return res.status(409).json({ error: "Session already exists", });
    }
    const session = {
        userId,
        lessonId: "basic-1",
        state: "USER_INPUT",
        attempts: 0,
        maxAttempts: 3,
        currentQuestionIndex: 0,
        messages: []
    };
    await (0, sessionStore_1.createSession)({
        ...session,
        lessonId: "basic-1"
    });
    const intent = "ASK_QUESTION";
    const questionText = basic_1_1.basicLesson1[session.currentQuestionIndex || 0]?.question || "";
    const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText) + `\nQuestion: ${questionText}`;
    // Call openAI to get actual message
    let tutorMessage;
    try {
        tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent);
    }
    catch {
        tutorMessage = "I'm having trouble responding right now. Please try again.";
    }
    // Convert to ChatMessage
    const initialMessage = {
        role: "assistant",
        content: tutorMessage
    };
    // Save new session on MongoDB
    const newSessionDoc = await sessionState_1.LessonSessionModel.create({
        userId: "string",
        lessonId: "basic-1",
        state: "USER_INPUT",
        attempts: 0,
        maxAttempts: 3,
        currentQuestionIndex: 0,
        messages: [initialMessage]
    });
    return res.status(201).json({ session: newSessionDoc, tutorMessage });
};
exports.startLesson = startLesson;
//----------------------
// Submit answer
//----------------------
const submitAnswer = async (req, res) => {
    const { userId, answer } = req.body;
    if (!userId || typeof answer !== "string") {
        return res.status(400).json({ error: "Invalid Payload (userId and answer are required)" });
    }
    // Fetch Mongo session
    const session = await sessionState_1.LessonSessionModel.findOne({ userId });
    if (!session) {
        return res.status(404).json({ error: "No active sessions" });
    }
    const userMessage = { role: "user", content: answer };
    session.messages.push(userMessage);
    const currentIndex = session.currentQuestionIndex || 0;
    const currentQuestion = basic_1_1.basicLesson1[currentIndex];
    const normalizedAnswer = answer.trim().toLowerCase();
    const isCorrect = normalizedAnswer === currentQuestion.answer.toLowerCase();
    //----------------------
    // Lesson progress Logic
    //----------------------
    if (isCorrect) {
        //Reset prompts
        session.attempts = 0;
        //Move forward
        if (currentIndex + 1 >= basic_1_1.basicLesson1.length) {
            session.state = "COMPLETE";
        }
        else {
            session.currentQuestionIndex = currentIndex + 1;
            session.state = "ADVANCE";
        }
    }
    else {
        //Wrong answer
        session.attempts++;
        //still retries left, stay on the same question
        if (session.attempts < session.maxAttempts) {
            session.state = "USER_INPUT";
        }
        else {
            session.attempts = 0;
            if (currentIndex + 1 >= basic_1_1.basicLesson1.length) {
                session.state = "COMPLETE";
            }
            else {
                session.currentQuestionIndex = currentIndex + 1;
                session.state = "ADVANCE";
            }
        }
    }
    // save session
    await (0, sessionStore_1.updateSession)(session);
    // --------------------
    // Build next tutor prompt
    // --------------------
    const intent = getTutorIntent(session.state, isCorrect);
    let questionText = "";
    if (session.state !== "COMPLETE") {
        questionText = basic_1_1.basicLesson1[session.currentQuestionIndex || 0].question;
    }
    const tutorPrompt = (0, promptBuilder_1.buildTutorPrompt)(session, intent, questionText);
    // --------------------
    // Call AI
    // --------------------
    let tutorMessage;
    try {
        tutorMessage = await (0, openaiClient_1.generateTutorResponse)(tutorPrompt, intent);
    }
    catch {
        tutorMessage = "I'm having trouble responding right now. please try again.";
    }
    // Save tutor message to MongoDB
    const tutorMessageObj = { role: "assistant", content: tutorMessage };
    session.messages.push(tutorMessageObj);
    await session.save();
    return res.status(200).json({ session, tutorMessage });
};
exports.submitAnswer = submitAnswer;
//----------------------
// Get session (debug)
//----------------------
const getSessionHandler = async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: "UserId is required" });
    }
    try {
        const session = await sessionState_1.LessonSessionModel.findOne({ userId });
        if (!session) {
            return res.status(404).json({ error: "No active sessions found" });
        }
        // Return full session including chart history
        return res.status(200).json({ session, messages: session.messages });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch session" });
    }
};
exports.getSessionHandler = getSessionHandler;
