import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { context, message, history = [] } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    let historyText = "";
    if (history.length > 0) {
      historyText = "\n\nPrevious Conversation:\n";
      history.forEach((msg: { role: string, content: string }) => {
        historyText += `${msg.role === "user" ? "Student" : "Tutor"}: ${msg.content}\n`;
      });
    }

    const prompt = `
You are a friendly, encouraging, and expert AI Tutor in a 1-on-1 tutoring session. 
Your student is studying the following context/topic:
"${context}"
${historyText}

The student just asked: "${message}"

Respond directly to the student's question in a conversational, supportive, and easy-to-understand manner.
Keep your response concise (2-4 sentences ideally) as it will be spoken aloud via text-to-speech.
Use natural language without complex markdown (no bold or italics asterisks if possible, to sound natural).
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });

    const aiText = response.text || "I'm sorry, I didn't quite catch that. Could you ask again?";
    
    return NextResponse.json({ reply: aiText.trim() });

  } catch (error: any) {
    console.error("AI Tutor Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
