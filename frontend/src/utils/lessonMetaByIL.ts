import type { LessonCatalogItem, SupportedLanguage } from "../api/lessonAPI";

type LessonMeta = {
  title: string;
  description: string;
};

type LessonMetaByLessonId = Record<string, LessonMeta>;
type LessonMetaByTarget = Partial<Record<SupportedLanguage, LessonMetaByLessonId>>;

const LESSON_META_BY_IL: Partial<Record<SupportedLanguage, LessonMetaByTarget>> = {
  en: {
    en: {
      "basic-1": {
        title: "Greetings and Introductions",
        description: "Greet people, ask simple questions, and introduce yourself.",
      },
      "basic-2": {
        title: "Pronouns and 'to be'",
        description: "Short sentences with I am, you are, he is, and she is.",
      },
      "basic-3": {
        title: "Simple present: like, have, want",
        description: "Say short present simple sentences with common verbs.",
      },
      "basic-4": {
        title: "Present simple: he/she/it + does",
        description: "Use -s with he/she/it, and use does in questions and negatives.",
      },
      "basic-5": {
        title: "Questions with do/does",
        description: "Ask simple yes/no and W-questions in the present simple.",
      },
      "basic-6": {
        title: "There is/are and articles",
        description: "Say what is in a place using there is/are and a/an/the.",
      },
      "basic-7": {
        title: "Possessives and family",
        description: "Use my/your/his/her and talk about family.",
      },
      "basic-8": {
        title: "Time and routines",
        description: "Talk about your day with simple time phrases.",
      },
      "basic-9": {
        title: "Can and can't",
        description: "Talk about ability and make simple requests.",
      },
      "basic-10": {
        title: "Imperatives and directions",
        description: "Use simple commands and directions.",
      },
      "basic-11": {
        title: "Food and drink",
        description: "Order food and speak politely.",
      },
      "basic-12": {
        title: "A1 review",
        description: "Review key A1 patterns from the course.",
      },
    },
    de: {
      "basic-1": {
        title: "Greetings and Introductions",
        description:
          "Greet people, introduce yourself, and use simple polite phrases in German.",
      },
      "basic-2": {
        title: "Pronouns and \"sein\"",
        description:
          "Use ich/du/er/sie/wir/ihr and the verb \"sein\" (bin/bist/ist/sind/seid). Ask simple questions.",
      },
      "basic-3": {
        title: "Personal info: origin, living, languages",
        description:
          "Share where you are from, where you live, and which languages you speak.",
      },
      "basic-4": {
        title: "Polite requests and ordering",
        description: "Make polite requests and ask for common items in German.",
      },
      "basic-5": {
        title: "Numbers and time basics",
        description: "Use simple numbers, ask the time, and talk about prices.",
      },
      "basic-6": {
        title: "Daily routine and simple verbs",
        description: "Talk about daily routines using simple present-tense verbs.",
      },
    },
  },
  de: {
    en: {
      "basic-1": {
        title: "Begrüßungen und Vorstellungen",
        description:
          "Menschen begrüßen, einfache Fragen stellen und sich vorstellen.",
      },
      "basic-2": {
        title: "Pronomen und \"sein\"",
        description:
          "Kurze Sätze mit ich bin, du bist, er ist und sie ist.",
      },
      "basic-3": {
        title: "Präsens: mögen, haben, wollen",
        description: "Kurze Sätze im Präsens mit häufigen Verben.",
      },
      "basic-4": {
        title: "Präsens: he/she/it + does",
        description:
          "Verwende -s bei he/she/it und benutze does in Fragen und Verneinungen.",
      },
      "basic-5": {
        title: "Fragen mit do/does",
        description: "Einfache Ja/Nein- und W-Fragen im Präsens stellen.",
      },
      "basic-6": {
        title: "There is/are und Artikel",
        description:
          "Sagen, was es an einem Ort gibt, mit there is/are und a/an/the.",
      },
      "basic-7": {
        title: "Possessivpronomen und Familie",
        description: "my/your/his/her verwenden und über Familie sprechen.",
      },
      "basic-8": {
        title: "Zeit und Routinen",
        description: "Über den Tag mit einfachen Zeitangaben sprechen.",
      },
      "basic-9": {
        title: "Can und can't",
        description: "Über Fähigkeiten sprechen und einfache Bitten äußern.",
      },
      "basic-10": {
        title: "Imperative und Richtungen",
        description: "Einfache Befehle und Wegbeschreibungen verwenden.",
      },
      "basic-11": {
        title: "Essen und Trinken",
        description: "Essen bestellen und höflich sprechen.",
      },
      "basic-12": {
        title: "A1-Wiederholung",
        description: "Wichtige A1-Strukturen aus dem Kurs wiederholen.",
      },
    },
    de: {
      "basic-1": {
        title: "Begrüßungen und Vorstellungen",
        description:
          "Menschen begrüßen, sich vorstellen und einfache höfliche Wendungen auf Deutsch verwenden.",
      },
      "basic-2": {
        title: "Pronomen und \"sein\"",
        description:
          "ich/du/er/sie/wir/ihr und das Verb \"sein\" (bin/bist/ist/sind/seid) verwenden. Einfache Fragen stellen.",
      },
      "basic-3": {
        title: "Persönliche Angaben: Herkunft, Wohnort, Sprachen",
        description:
          "Sagen, woher du kommst, wo du wohnst und welche Sprachen du sprichst.",
      },
      "basic-4": {
        title: "Höfliche Bitten und Bestellen",
        description:
          "Höflich bitten und nach gängigen Dingen auf Deutsch fragen.",
      },
      "basic-5": {
        title: "Zahlen und Uhrzeit",
        description:
          "Einfache Zahlen verwenden, nach der Uhrzeit fragen und über Preise sprechen.",
      },
      "basic-6": {
        title: "Tagesablauf und einfache Verben",
        description: "Mit einfachen Verben über den Tagesablauf sprechen.",
      },
    },
  },
};

export function applyInstructionLanguageMeta(
  lessons: LessonCatalogItem[],
  instructionLanguage: SupportedLanguage,
  targetLanguage: SupportedLanguage
): LessonCatalogItem[] {
  const metaByTarget = LESSON_META_BY_IL[instructionLanguage];
  const meta = metaByTarget?.[targetLanguage] ?? {};

  return lessons.map((lesson) => {
    const override = meta[lesson.lessonId];
    if (!override) return lesson;
    return {
      ...lesson,
      title: override.title || lesson.title,
      description: override.description || lesson.description,
    };
  });
}
