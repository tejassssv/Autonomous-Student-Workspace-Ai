import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import officeParser from "officeparser";

// Initialize Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const noteType = formData.get("noteType") as string || "precise";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine note style guidance
    let styleGuide = "Highly condensed, easy-to-read revision notes. Use markdown formatting.";
    if (noteType === "short") {
      styleGuide = "Extremely brief, bullet-point only summaries of the absolute most critical concepts. Maximize brevity.";
    } else if (noteType === "long") {
      styleGuide = "A detailed, comprehensive study guide exploring every topic in depth with clear sub-headings and extensive explanations.";
    }

    const promptText = `
You are an expert AI tutor and educational content creator.
Based on this document, generate the following in a valid JSON object:

1. "notes": ${styleGuide} Use markdown formatting with headings, bold key terms, and bullet points.
2. "hasProject": A boolean indicating if the document explicitly mentions a project assignment.
3. "projectSummary": A brief summary of the project if one exists (or null if not).
4. "projectDeadline": The deadline for the project if one is mentioned (or null if not).
5. "tips": An array of 3-4 specific study tips or mnemonics to help remember the key concepts in this document.
6. "quiz": A 5-question multiple-choice practice quiz. Each question MUST include:
   - "question": the question text
   - "options": array of 4 answer choices
   - "correctAnswer": 0-based index of the correct option
   - "explanation": A detailed 2-3 sentence explanation of WHY the correct answer is right. If someone picked a wrong answer, this should clarify the misconception and reinforce the correct concept clearly.
7. "flowcharts": An array of 1-3 relevant algorithm/process flowcharts from the document. Each item must have:
   - "title": a short descriptive title for the flowchart
   - "mermaid": valid Mermaid.js flowchart syntax (using 'flowchart TD' format). Keep node labels short (under 30 chars). Do NOT use parentheses inside node labels — use square brackets [] or curly braces {} only.

Respond ONLY with a valid JSON object, without any markdown code fences or backticks:
{
  "notes": "markdown string",
  "hasProject": true_or_false,
  "projectSummary": "string or null",
  "projectDeadline": "string or null",
  "tips": ["tip 1", "tip 2", "tip 3"],
  "quiz": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "The correct answer is A because... A common misconception is..."
    }
  ],
  "flowcharts": [
    {
      "title": "Process Title",
      "mermaid": "flowchart TD\\n  A[Start] --> B{Decision}\\n  B -->|Yes| C[Action]\\n  B -->|No| D[End]"
    }
  ]
}
Note: correctAnswer should be the 0-based index of the correct option.
`;

    let response;
    const filename = file.name.toLowerCase();

    if (filename.endsWith(".pdf")) {
      const base64Data = buffer.toString("base64");
      response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: "application/pdf"
                }
              },
              { text: promptText }
            ]
          }
        ]
      });
    } else if (filename.endsWith(".docx") || filename.endsWith(".pptx") || filename.endsWith(".doc") || filename.endsWith(".ppt")) {
      try {
        const ast = await officeParser.parseOffice(buffer);
        const text = ast.toText();
        response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `Here is the extracted document text:\n\n${text.substring(0, 50000)}\n\n${promptText}`
        });
      } catch (e) {
        console.error("Office parsing error:", e);
        return NextResponse.json({ error: "Failed to parse Word/PowerPoint document." }, { status: 400 });
      }
    } else if (filename.endsWith(".txt")) {
      const text = buffer.toString("utf-8");
      response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Here is the document text:\n\n${text.substring(0, 50000)}\n\n${promptText}`
      });
    } else {
      return NextResponse.json({ error: "Unsupported file type. Please upload a PDF, DOCX, PPTX, or TXT file." }, { status: 400 });
    }

    const aiText = response.text || "";

    // Parse the JSON response, stripping any markdown code fences
    let jsonStr = aiText.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const result = JSON.parse(sanitizeJsonString(jsonStr));
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

/** Robustly sanitizes AI JSON responses with unescaped control characters */
function sanitizeJsonString(str: string): string {
  str = str.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = str.indexOf("{");
  const end   = str.lastIndexOf("}");
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
