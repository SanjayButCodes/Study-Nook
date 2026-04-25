import { GoogleGenAI, Type, FunctionDeclaration, Modality, FunctionCallingConfigMode } from "@google/genai";

const updateChapterStatus: FunctionDeclaration = {
  name: "updateChapterStatus",
  description: "Update the completion status of a specific chapter's task (e.g., Studied, Tested).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, enum: ["physics", "chemistry", "mathematics"], description: "The subject key." },
      chapterName: { type: Type.STRING, description: "The exact name of the chapter (e.g., 'Kinematics')." },
      columnId: { type: Type.STRING, description: "The ID of the column (e.g., 'study', 'test')." },
      completed: { type: Type.BOOLEAN, description: "Whether the task is completed or not." }
    },
    required: ["subject", "chapterName", "columnId", "completed"]
  }
};

const addChapterNote: FunctionDeclaration = {
  name: "addChapterNote",
  description: "Add or append a note to a specific chapter. Can include text (Markdown/LaTeX/Tables supported).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, enum: ["physics", "chemistry", "mathematics"], description: "The subject key." },
      chapterName: { type: Type.STRING, description: "The exact name of the chapter." },
      note: { type: Type.STRING, description: "The note text to add. Use markdown for tables and formatting." },
      attachCurrentContextImage: { type: Type.BOOLEAN, description: "Set to true if the user wants to save the image they just uploaded into this note." }
    },
    required: ["subject", "chapterName", "note"]
  }
};

const addExam: FunctionDeclaration = {
  name: "addExam",
  description: "Add a new major exam countdown (e.g., JEE Main, JEE Advanced).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The name of the exam." },
      date: { type: Type.STRING, description: "The date of the exam (YYYY-MM-DD)." }
    },
    required: ["name", "date"]
  }
};

const addTest: FunctionDeclaration = {
  name: "addTest",
  description: "Add a new upcoming test (e.g., weekly mock test, chapter test).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The name of the test." },
      date: { type: Type.STRING, description: "The date of the test (YYYY-MM-DD)." }
    },
    required: ["name", "date"]
  }
};

const addChapter: FunctionDeclaration = {
  name: "addChapter",
  description: "Add a new chapter to a subject and group.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, enum: ["physics", "chemistry", "mathematics"], description: "The subject key." },
      groupId: { type: Type.STRING, description: "The ID of the group to add the chapter to." },
      name: { type: Type.STRING, description: "The name of the new chapter." }
    },
    required: ["subject", "groupId", "name"]
  }
};

const updateTodoList: FunctionDeclaration = {
  name: "updateTodoList",
  description: "Add or remove items from the daily to-do list.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["add", "remove", "toggle"], description: "The action to perform." },
      item: { type: Type.STRING, description: "The to-do item text." },
      date: { type: Type.STRING, description: "The date for the task (YYYY-MM-DD). If the user doesn't specify a date, ALWAYS use today's date." },
      index: { type: Type.NUMBER, description: "The index of the item to remove or toggle (optional)." }
    },
    required: ["action"]
  }
};



const updateGroupColumns: FunctionDeclaration = {
  name: "updateGroupColumns",
  description: "Update the completion columns (tick boxes) for a specific group within a subject.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      subject: { type: Type.STRING, enum: ["physics", "chemistry", "mathematics"], description: "The subject key." },
      groupId: { type: Type.STRING, description: "The ID of the group to update columns for." },
      columns: { 
        type: Type.ARRAY, 
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "Unique ID for the column." },
            name: { type: Type.STRING, description: "Display name for the column." },
            countsForPct: { type: Type.BOOLEAN, description: "Whether this column counts towards progress percentage." }
          },
          required: ["id", "name"]
        }
      }
    },
    required: ["subject", "groupId", "columns"]
  }
};

export async function callGemini(prompt: string, imageBase64?: string, imageMimeType?: string, context?: any, history: { role: "user" | "model"; parts: { text: string }[] }[] = [], model: string = "gemini-2.5-flash", userName?: string) {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("API Key is not set. AI features will not work.");
    return { text: "System error: API Key is missing from the environment." };
  }
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: prompt }];
  
  if (imageBase64 && imageMimeType) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: imageMimeType,
      },
    });
  }

  const systemInstruction = `You are an expert IIT JEE tutor named Nova, trained by Sanjay. Be concise, accurate, and highly encouraging. 
The student you are tutoring is named ${userName || "the student"}. Address them by name when appropriate.
Today's date is ${new Date().toISOString().split('T')[0]}.
Use markdown for formatting. You can draw tables using Markdown. Use LaTeX for all mathematical formulas (e.g., $E=mc^2$ or $$E=mc^2$$). 

CRITICAL: When calling tools that take text/notes as arguments, you MUST double-escape all backslashes in LaTeX because your output is JSON.
For example, output \\\\frac instead of \\frac, \\\\sum instead of \\sum, \\\\( instead of \\(. If you do not double-escape, the JSON parser will fail or corrupt the formulas (e.g., \\f becomes a form feed).

CRITICAL: DO NOT use markdown image syntax like ![image](url). To attach the user's current image to a note, you MUST set attachCurrentContextImage to true when calling addChapterNote.

If the user asks to "make a table as a note", format the note content as a clear Markdown table and use addChapterNote.
You have access to the user's study tracker state. You can update chapter statuses, add notes, add major exams, add upcoming tests, add chapters, manage a to-do list, and update settings.
When adding tasks to the to-do list, ALWAYS use today's date unless the user explicitly specifies another date.
Current Tracker Context: ${JSON.stringify(context || "No context provided")}`;

  try {
    const contents = [...history, { role: "user", parts }];
    const response = await ai.models.generateContent({
      model: model,
      contents,
      config: {
        systemInstruction,
        tools: [
          { functionDeclarations: [updateChapterStatus, addChapterNote, addExam, addTest, addChapter, updateTodoList, updateGroupColumns] }
        ],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO }
        }
      },
    });
    
    return {
      text: response.text,
      functionCalls: response.functionCalls
    };
  } catch (error: any) {
    const isQuotaError = 
      error?.status === 429 || 
      error?.error?.code === 429 || 
      error?.message?.includes("429") || 
      error?.message?.includes("RESOURCE_EXHAUSTED") ||
      error?.error?.status === "RESOURCE_EXHAUSTED";

    if (isQuotaError) {
      console.warn("Gemini API Quota Exceeded:", JSON.stringify(error));
      return { text: "I'm currently receiving too many requests (API Quota Exceeded). Please wait a minute and try again! 🌿" };
    }
    
    console.error("Gemini API Error:", JSON.stringify(error));
    return { text: "Failed to reach AI tutor. Please try again later." };
  }
}

export async function callGeminiTTS(text: string) {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error: any) {
    const isQuotaError = 
      error?.status === 429 || 
      error?.error?.code === 429 || 
      error?.message?.includes("429") || 
      error?.message?.includes("RESOURCE_EXHAUSTED") ||
      error?.error?.status === "RESOURCE_EXHAUSTED";

    if (isQuotaError) {
      console.warn("TTS Quota exceeded:", JSON.stringify(error));
    } else {
      console.error("TTS Error:", JSON.stringify(error));
    }
  }
  return null;
}
