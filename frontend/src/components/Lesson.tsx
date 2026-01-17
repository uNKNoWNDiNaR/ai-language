// src/components/Lesson.tsx

import React, { useState, useEffect, useRef } from "react";
import { AxiosError } from "axios";
import { startLesson, submitAnswer, getSession } from "../api/lessonAPI";
import type { BackendSession } from "../api/lessonAPI";


type Message = {
    sender: "tutor" | "student";
    text: string;
};


const Lesson: React.FC = () => {
    const [userId, setUserId] = useState("");
    const [tutorNameInput, setTutorNameInput] = useState("");
    const [tutorName, setTutorName] = useState("Tutor");
    const [language, setLanguage] = useState("en");
    const [lessonId, setLessonId] = useState("basic-1"); 
    const [sessionStarted, setSessionStarted] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [answer, setAnswer] = useState ("");
    const chatEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages]);



    // --------------------
    // Start Lesson
    // --------------------
    const handleStartLesson = async() => {
        if (!userId.trim()) { 
            alert("Please enter your User ID");
            return;
        }
        setTutorName(tutorNameInput.trim() || "Tutor");

        try{
            //Attenmpt to start a new lesson
            const res = await startLesson(userId, language, lessonId);

            // Restore stored message from DB
            const restoredMessages: Message[] = res.session.messages.map(m => ({
                sender: m.role === "assistant" ? "tutor" : "student",
                text: m.content
            }));

            //If new user and no stored messages, show first tutor message
            if(restoredMessages.length === 0 && res.tutorMessage) {
                restoredMessages.push({
                    sender: "tutor",
                    text: res.tutorMessage
                });
            }
            setMessages(restoredMessages);
            setSessionStarted(true);
            return;

        } catch(err: unknown) {
            const error = err as AxiosError;

            //Resume existing session
            if(error.response?.status === 409) {
                const existing: BackendSession | null = await getSession(userId);
                if (!existing) return;

                const restoredMessages: Message[] = existing.messages.map((m) => ({
                    sender: m.role === "assistant" ? "tutor": "student",
                    text: m.content
                }));

                setMessages(restoredMessages);
                setSessionStarted(true);
            } else {
                alert("Could not start lesson. Check backend");
            }
        }
    };

    // --------------------
    // Submit Answer
    // --------------------
    const handleSubmitAnswer = async () => {
        if(!answer.trim()) return;

        //Show student message immediately
        const studentMessage: Message = {
            sender: "student",
            text: answer
        };

        //Add student message imediately
        setMessages(prev => [...prev, studentMessage]);
        setAnswer("")

        
        try {
            const res = await submitAnswer(userId, answer);

            //Append only tutor message to avoid duplicating
            const tutorReply: Message = {
                sender: "tutor" ,
                text: res.tutorMessage
            };

            setMessages(prev => [...prev, tutorReply]);

        } catch(err) {
            console.error(err);
            alert("Could not submit answer. Check backend");
        }
    };


    // --------------------
    // Detect Lesson end
    // --------------------
    const lessonComplete = messages.some(msg =>
        msg.sender === "tutor" &&
        msg.text.toLowerCase().includes("completed this lesson")
    );


    // --------------------
    // Render
    // --------------------
    return(
        <div style={{maxWidth: 600, margin: "0 auto", padding: 20}}>

            {!sessionStarted ? (
                <>
                    <h2>Start Lesson</h2>

                    <input
                        type="text"
                        placeholder="Enter your user ID"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        style={{padding: 8, width: "100%", marginBottom: 10}}
                    />

                    <input
                        type="text"
                        placeholder="Enter tutor's name (optional)"
                        value={tutorNameInput}
                        onChange={(e) => setTutorNameInput(e.target.value)}
                        style={{padding: 8, width: "100%", marginBottom: 10}}
                    />

                    {/* *Language selector */}
                    <select 
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        style={{padding: 8, width: "100%", marginBottom: 10}}
                    >
                        <option value="en">English</option>
                        <option value="de">German</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                    </select>

                    {/* *Lesson selector */}
                    <select 
                        value={lessonId}
                        onChange={(e) => setLessonId(e.target.value)}
                        style={{padding: 8, width: "100%", marginBottom: 10}}
                    >
                        <option value="basic-1">Basic Lesson 1</option>
                        <option value="basic-2">Basic Lesson 2</option>
                    </select>

                    <button onClick={handleStartLesson} style={{padding: 10}}>
                        Start Lesson
                    </button>
                </>
            ) : (
                <>
                <h2>Lesson Chat</h2>

                {/*Chat Window*/}
                <div
                    style={{
                        border: "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        height: 350,
                        marginBottom: 15,
                        background: "#ffffff",
                        overflowY: "auto"
                    }}
                >
                    {messages.map((msg, index) => ( 
                        <div
                            key={index}
                            style={{
                                textAlign: msg.sender === "tutor" ? "left" : "right",
                                marginBottom: 10,
                                //color: "#222"
                            }}
                        >

                        <div
                            style={{
                                display: "inline-block",
                                padding: "8px 12px",
                                borderRadius: 12,
                                background:
                                    msg.sender === "tutor" ? "#e8f0fe" : "#dcfce7",
                                maxWidth: "80%"
                            }}
                        >

                            <strong style={{fontSize: "0.85em"}}>
                                {msg.sender === "tutor" ? tutorName : userId }
                            </strong>
                            <div>{msg.text}</div>
                        </div>
                    </div>
                    ))}
                </div>
                    <div ref={chatEndRef} />

                {/* Feedback Button */}
                <div style={{ marginTop: 10, textAlign:"center" }}>
                    <a 
                        href="https://forms.gle/TUTGu4z68fUcECfu8"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            textDecoration: "none",
                            color: "#2563eb",
                            fontWeight: "bold"
                        }}
                    >
                        💬 Give Feedback
                    </a>
                </div>

                {/*End state*/}
                {lessonComplete ? (
                    <div>
                        <p>🎉 Lesson finished! Great work!</p>
                        <button
                            onClick= {() => {
                                setSessionStarted(false);
                                setMessages([]);
                                setAnswer("");
                                setUserId("");
                            }}
                            style={{padding: 10}}
                        >
                            Start New Lesson
                        </button>
                    </div>
                ) : (
                    <>
                        <input
                            type="text"
                            placeholder="Type your answer..."
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            style={{padding: 8, width: "100%", marginBottom: 10}}
                        />
                        <button onClick={handleSubmitAnswer} style={{padding: 10}}>
                            send
                        </button>
                    </>
                )}
                </>
            )}
        </div>
    );
};

export default Lesson;