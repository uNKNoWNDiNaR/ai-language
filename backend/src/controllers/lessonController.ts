// src/controllers/lessonController.ts
// Day 2 MVP backend lesson loop and retry logic

import { LessonSessionModel } from "../state/sessionState";
import { Request, Response } from "express";
import { LessonSession, LessonState } from "../state/lessonState";
import { buildTutorPrompt } from "../ai/promptBuilder";
import { generateTutorResponse } from "../ai/openaiClient";
import { TutorIntent } from "../ai/tutorIntent";
import { updateSession, } from "../storage/sessionStore";
import { Lesson, loadLesson } from "../state/lessonLoader";



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
    const { userId, language, lessonId} = req.body;

    //check for presence of userId
    if(!userId) {
        return res.status(400).json({error: "UserId is required"});
    }

    //require language + lessonId
    if(!language || !lessonId) {
        return res.status(400).json({error: "Language and lessonId are required"});
    }

    try {
        //Check exisiting session
        let session = await LessonSessionModel.findOne({userId});

        //-----------------------
        //If session alraedy exists 
        //Reuse only if it matches the requested lesson + language
        // otherwise reset it so that we dont accidentally default to old english 
        //-----------------------
        if(session) {
            const sameLesson = session.lessonId === lessonId && session.language === language;

            if(sameLesson) {
                return res.status(200).json({ session });
            }

            //Reset session if user picked a different language/lesson
            await LessonSessionModel.deleteOne({ userId });
            session = null;
        }

        //------------------------
        //load lesson Dynamically using lessonLoader.ts
        //------------------------
        const lesson: Lesson | null = loadLesson(language, lessonId);
        if(!lesson) return res.status(404).json({error: "Lesson not found"});

        //create new session
        const newSession: LessonSession = {
            userId,
            lessonId,
            state: "USER_INPUT",
            attempts: 0,
            maxAttempts: 3,
            currentQuestionIndex: 0,
            messages: [],
            language,
        };

        //Build First tutor question)
        const firstQuestion = lesson.questions[0];
        const intent: TutorIntent = "ASK_QUESTION";
        const tutorPrompt = 
            buildTutorPrompt(newSession, intent, firstQuestion.question) + 
            `\nQuestion: ${firstQuestion.question}`;

        let tutorMessage: string;
        try {
            tutorMessage = await generateTutorResponse(tutorPrompt, intent);
        } catch {
            tutorMessage = "I'm having trouble responding right now. Please try again later.";
        }

        //Save tutor message to session
        const intitialMessage = {role: "assistant", content: tutorMessage};
        session = await LessonSessionModel.create({...newSession,messages: [intitialMessage]});

        return res.status(201).json({ session, tutorMessage })
    } catch(err) {
        console.error("Start  lesson error", err);
        return res.status(500).json({ error: "Server error"});
    }
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
        return res.status(404).json({error: "No active session found"});
    }

    //Load lesson dynamically via lessonLoader
    const lesson: Lesson | null = loadLesson(session.language, session.lessonId);
    if(!lesson){
        return res.status(404).json({error: "Lesson not found"});
    }

    //Push user message
    const userMessage = {role: "user", content: answer};
    session.messages.push(userMessage);

    const currentIndex = session.currentQuestionIndex || 0;
    const currentQuestion = lesson.questions[currentIndex];

    const normalizedAnswer = answer.trim().toLowerCase();
    const isCorrect = normalizedAnswer === currentQuestion.answer.toLowerCase();


//----------------------
// Lesson progress Logic
//----------------------

    if(isCorrect) {
        session.attempts = 0;
        if(currentIndex + 1 >= lesson.questions.length) {
            session.state = "COMPLETE";
        } else{
            session.currentQuestionIndex = currentIndex + 1;
            session.state = "ADVANCE";
        }
    } else {
        session.attempts++;
        if(session.attempts < session.maxAttempts) {
            session.state = "USER_INPUT";
        }
        else {
            session.attempts = 0;
            if(currentIndex + 1 >= lesson.questions.length){
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
    let questionText = 
        session.state !== "COMPLETE" ? lesson.questions[session.currentQuestionIndex].question : ""; 
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
