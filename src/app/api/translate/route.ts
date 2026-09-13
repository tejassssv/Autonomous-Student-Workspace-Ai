import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SUPPORTED_LANGUAGES: Record<string, string> = {
  hindi: "Hindi (हिन्दी)",
  marathi: "Marathi (मराठी)",
  tamil: "Tamil (தமிழ்)",
  telugu: "Telugu (తెలుగు)",
  bengali: "Bengali (বাংলা)",
  gujarati: "Gujarati (ગુજરાતી)",
  kannada: "Kannada (ಕನ್ನಡ)",
  french: "French (Français)",
  spanish: "Spanish (Español)",
  german: "German (Deutsch)",
  arabic: "Arabic (العربية)",
  japanese: "Japanese (日本語)",
  chinese: "Chinese (中文)",
  portuguese: "Portuguese (Português)",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { content, targetLanguage, type } = body;

    if (!content || !targetLanguage) {
      return NextResponse.json({ error: "Missing content or targetLanguage" }, { status: 400 });
    }

    const langName = SUPPORTED_LANGUAGES[targetLanguage] || targetLanguage;

    let prompt = "";
    if (type === "notes") {
      prompt = `Translate the following study notes into ${langName}. 
Preserve ALL markdown formatting exactly (headings with #, **bold**, *italic*, bullet points, etc.). 
Only translate the text content, not the markdown symbols.
Return ONLY the translated markdown text, no preamble.

NOTES TO TRANSLATE:
${content}`;
    } else if (type === "quiz") {
      // content is a JSON string of quiz array
      prompt = `Translate the following quiz questions, options, and explanations into ${langName}.
Return a valid JSON array with the same structure. Translate ONLY the text values (question, options array items, explanation). 
Do NOT change the "correctAnswer" numbers.
Return ONLY the JSON array, no markdown fences.

QUIZ JSON:
${content}`;
    } else {
      prompt = `Translate the following text into ${langName}. Return only the translated text.

TEXT:
${content}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt
    });

    const translated = response.text || "";

    if (type === "quiz") {
      let jsonStr = translated.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      const parsedQuiz = JSON.parse(sanitizeJsonString(jsonStr));
      return NextResponse.json({ translated: parsedQuiz });
    }

    return NextResponse.json({ translated: translated.trim() });

  } catch (error: any) {
    console.error("Translation Error:", error);
    return NextResponse.json({ error: error.message || "Translation failed" }, { status: 500 });
  }
}

/** Robustly sanitizes AI JSON responses with unescaped control characters */
function sanitizeJsonString(str: string): string {
  str = str.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  // Handle both array [] and object {} responses
  const startObj = str.indexOf("{");
  const startArr = str.indexOf("[");
  const start = startObj !== -1 && startArr !== -1
    ? Math.min(startObj, startArr)
    : startObj !== -1 ? startObj : startArr;
  const endObj = str.lastIndexOf("}");
  const endArr = str.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  if (start !== -1 && end > start) str = str.slice(start, end + 1);
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === "\\") { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) {
      if      (c === "\n") { result += "\\n"; continue; }
      else if (c === "\r") { continue; }
      else if (c === "\t") { result += "\\t"; continue; }
      else if (c.charCodeAt(0) < 32) { result += "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"); continue; }
    }
    result += c;
  }
  return result;
}
