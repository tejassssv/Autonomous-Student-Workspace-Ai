import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SUGGESTED_TOPICS: Record<string, string[]> = {
  programming: ["Binary Search Trees", "React Hooks", "Dynamic Programming", "REST APIs", "Big O Notation"],
  science: ["Photosynthesis", "Newton's Laws", "DNA Replication", "Thermodynamics", "Quantum Physics"],
  math: ["Calculus Derivatives", "Linear Algebra", "Probability Theory", "Fourier Transform", "Number Theory"],
  history: ["World War II", "Industrial Revolution", "Cold War", "Renaissance Period", "French Revolution"],
  economics: ["Supply and Demand", "GDP and Inflation", "Keynesian Economics", "Game Theory", "Market Structures"],
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, noteType = "precise" } = body;

    if (!topic?.trim()) {
      return NextResponse.json({ error: "No topic provided" }, { status: 400 });
    }

    // 1. Fetch image from Wikipedia REST API
    let imageUrl = null;
    try {
      const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.trim())}`);
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        if (wikiData.originalimage && wikiData.originalimage.source) {
          imageUrl = wikiData.originalimage.source;
        } else if (wikiData.thumbnail && wikiData.thumbnail.source) {
          imageUrl = wikiData.thumbnail.source;
        }
      }
    } catch (e) {
      console.log("Failed to fetch wikipedia image", e);
    }

    // 2. Generate content with Gemini
    let styleGuide = "Balanced, well-structured notes with key concepts clearly highlighted";
    if (noteType === "short") {
      styleGuide = "Extremely concise bullet-point summaries of the most critical concepts only. Maximize brevity.";
    } else if (noteType === "long") {
      styleGuide = "A comprehensive, detailed study guide with real-world examples, deep explanations, and every sub-topic covered.";
    }

    const prompt = `
You are an expert AI tutor and curriculum designer. Generate accurate, comprehensive study material about: "${topic}"

Generate the following in a valid JSON object:

1. "notes": ${styleGuide}. Use excellent markdown formatting: ## headings, **bold** for key terms, bullet points, numbered lists, blockquotes for key definitions, and inline \`code\` where relevant.
2. "hasProject": false
3. "projectSummary": null
4. "projectDeadline": null
5. "tips": An array of 4-5 specific, actionable study tips, memory tricks, or mnemonics tailored to this exact topic.
6. "quiz": A 5-question multiple-choice quiz covering different aspects of the topic. Each must have:
   - "question": clear, exam-style question text
   - "options": exactly 4 answer choices
   - "correctAnswer": 0-based index of the correct option
   - "explanation": 2-3 sentence explanation of WHY the answer is correct, addressing common misconceptions.
7. "flowcharts": An array of 1-2 relevant process/algorithm/concept flowcharts for this topic. Each must have:
   - "title": a short descriptive title
   - "mermaid": valid Mermaid.js flowchart syntax using ONLY 'flowchart TD' format. Keep each node label under 25 characters. Use only [] and {} for nodes. NO parentheses () inside node labels.

Respond ONLY with valid JSON, no markdown code fences or backticks:
{
  "notes": "# Topic\\n## Section\\n**Key term**: definition...",
  "hasProject": false,
  "projectSummary": null,
  "projectDeadline": null,
  "tips": ["tip 1", "tip 2", "tip 3"],
  "quiz": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "The answer is A because..."
    }
  ],
  "flowcharts": [
    {
      "title": "Process Name",
      "mermaid": "flowchart TD\\n  A[Start] --> B{Decision}\\n  B -->|Yes| C[Action]\\n  B -->|No| D[End]"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });

    const aiText = response.text || "";
    let jsonStr = aiText.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const result = JSON.parse(sanitizeJsonString(jsonStr));
    return NextResponse.json({ ...result, sourceTopic: topic, imageUrl });

  } catch (error: any) {
    console.error("AI Search Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

/** Robustly sanitizes AI JSON responses with unescaped control characters */
function sanitizeJsonString(str: string): string {
  // Strip markdown fences
  str = str.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Extract from first { to last }
  const start = str.indexOf("{");
  const end   = str.lastIndexOf("}");
  if (start !== -1 && end > start) str = str.slice(start, end + 1);

  // Character-by-character scan: fix unescaped control chars inside strings
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

export { SUGGESTED_TOPICS };
