// src/controllers/lessonController.ts
// Day 2 MVP backend lesson loop and retry logic

import { LessonSessionModel } from "../state/sessionState";
import { Request, Response } from "express";
import { LessonSession, LessonState } from "../state/lessonState";
import { buildTutorPrompt } from "../ai/promptBuilder";
import { generateTutorResponse } from "../ai/openaiClient";
import { TutorIntent } from "../ai/tutorIntent";
import { basicLesson1 } from "../lessons/basic-1";
import { 
    getSession, 
    createSession, 
    updateSession, 
 } from "../storage/sessionStore";



//----------------------
// Helper: map state ->tutor intent
//----------------------
function getTutorIntent(state: LessonState, isCorrect?: boolean): TutorIntent{
    if(state === "COMPLETE") return "END_LESSON";
    if(state === "ADVANCE") return "ADVANCE_LESSON" 
    if(isCorrect === false) return "ENCOURAGE_RETRY"
        return "ASK_QUESTION";
    }


//----------------------
// Start lesson
//----------------------
export const startLesson = async (req: Request, res: Response) => {
    const { userId } = req.body;

    //check for presence of userId
    if(!userId) {
        return res.status(400).json({error: "UserId is required"});
    }

    //Prevent overwriting existing session
    if( await getSession(userId)) {
        return res.status(409).json({error: "Session already exists", });
    }

    const session: LessonSession = {
        userId,
        lessonId: "basic-1",
        state: "USER_INPUT",  
        attempts: 0,
        maxAttempts: 3,
        currentQuestionIndex: 0,
        messages: []
    };

    await createSession({
        ...session,
        lessonId: "basic-1"});

    const intent: TutorIntent = "ASK_QUESTION";
    const questionText = basicLesson1[session.currentQuestionIndex || 0]?.question || "";
    const tutorPrompt = buildTutorPrompt(session, intent, questionText) + `\nQuestion: ${questionText}`;

    // Call openAI to get actual message
    let tutorMessage: string;
    try{
        tutorMessage = await generateTutorResponse(tutorPrompt, intent);
    } catch{
        tutorMessage = "I'm having trouble responding right now. Please try again.";
    }

    // Convert to ChatMessage
    const initialMessage = {
        role: "assistant",
        content: tutorMessage
    }; 

    // Save new session on MongoDB
    const newSessionDoc = await LessonSessionModel.create({
        userId: "string",
        lessonId: "basic-1",
        state: "USER_INPUT",
        attempts: 0,
        maxAttempts: 3,
        currentQuestionIndex: 0,
        messages: [initialMessage]
    });

    return res.status(201).json({session: newSessionDoc, tutorMessage});
};


//----------------------
// Submit answer
//----------------------
export const submitAnswer = async (req: Request, res: Response) => { 

    const {userId, answer} = req.body;

    if (!userId || typeof answer !== "string") {
        return res.status(400).json({error: "Invalid Payload (userId and answer are required)"});
    }
    
    // Fetch Mongo session
    const session = await LessonSessionModel.findOne({ userId});

    if(!session) {
        return res.status(404).json({error: "No active sessions"});
    }

    const userMessage = {role: "user",content: answer};
    session.messages.push(userMessage);

    const currentIndex = session.currentQuestionIndex || 0;
    const currentQuestion = basicLesson1[currentIndex];

    const normalizedAnswer = answer.trim().toLowerCase();
    const isCorrect = normalizedAnswer === currentQuestion.answer.toLowerCase();


//----------------------
// Lesson progress Logic
//----------------------

    if(isCorrect) {
        //Reset prompts
        session.attempts = 0;

        //Move forward
        if(currentIndex + 1 >= basicLesson1.length) {
            session.state = "COMPLETE";
        } else{
            session.currentQuestionIndex = currentIndex + 1;
            session.state = "ADVANCE";
        }
    } else {
        //Wrong answer
        session.attempts++;

        //still retries left, stay on the same question
        if(session.attempts < session.maxAttempts) {
            session.state = "USER_INPUT";
        }
        else {
            session.attempts = 0;
    
            if(currentIndex + 1 >= basicLesson1.length){
                session.state = "COMPLETE";
            } else {
                session.currentQuestionIndex = currentIndex + 1;
                session.state = "ADVANCE";
            }
        } 
    }

    // save session
    await updateSession(session);


    // --------------------
    // Build next tutor prompt
    // --------------------

    const intent = getTutorIntent(session.state, isCorrect);

    let questionText = "";
    if(session.state !== "COMPLETE") {
        questionText = basicLesson1[session.currentQuestionIndex || 0].question;
    }

    const tutorPrompt = buildTutorPrompt(session, intent, questionText);


    // --------------------
    // Call AI
    // --------------------

    let tutorMessage: string;
    try{
        tutorMessage = await generateTutorResponse(tutorPrompt, intent);
    } catch{
        tutorMessage = "I'm having trouble responding right now. please try again.";
    }

    // Save tutor message to MongoDB
    const tutorMessageObj = { role: "assistant", content: tutorMessage};
    session.messages.push(tutorMessageObj);
    await session.save();


    return res.status(200).json({ session, tutorMessage });    
};

//----------------------
// Get session (debug)
//----------------------
export const getSessionHandler = async (req: Request, res:Response) => {
    const { userId} = req.params;

    if(!userId){
        return res.status(400).json({error: "UserId is required"});
    }

    try {
        const session = await LessonSessionModel.findOne({ userId });

        if(!session) {
            return res.status(404).json({error: "No active sessions found"});
        }
        // Return full session including chart history
        return res.status(200).json({ session, messages: session.messages});
    } catch(err) {
        console.error(err);
        return res.status(500).json({error: "Failed to fetch session"})
    }

};
