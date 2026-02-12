//backend/src/types/practice.ts


export type SupportedLanguage = "en" | "de" | "es" | "fr";

export type PracticeMetaType = "variation" | "dialogue_turn" | "cloze"

export type PracticeItemMeta = {
    type: PracticeMetaType;
    conceptTag: string;
    reviewRef?: {
        lessonId: string;
        questionId: string;
    };
};

export type PracticeItem = {
    practiceId: string;
    lessonId: string;
    language: SupportedLanguage;
    prompt:string;     //Tutor question(What the tutor asks)
    expectedAnswerRaw: string;            //deterministic evaluator with allowed place holders
    acceptedAnswers?: string[];
    expectedInput?: "sentence" | "blank";
    blankAnswers?: string[];
    examples?: string[];
    hint?:string;
    hints?: string[];
    meta: PracticeItemMeta;
}; 

export type MicroPracticeItem = {
    id: string;
    conceptTag: string;
    kind: "blank" | "word_bank" | "short_answer";
    prompt: string;
    expectedInput: "blank" | "sentence";
    answer: string;
    acceptedAnswers?: string[];
    blankAnswers?: string[];
};

export type PracticeGenerateRequest = {
    userId: string;
    lessonId: string;
    language: SupportedLanguage;
    sourceQuestionId?: number;
    type?: PracticeMetaType;
    conceptTag?: string;
};
