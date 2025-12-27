
import OpenAI from "openai";
import { Buffer } from 'buffer'; // Explicit import for safety in serverless
import { IdeationData, PersonData, VoiceExtraction } from "../../types";

const getGroqClient = () => {
    console.log("[Groq] Initializing client...");
    return new OpenAI({
        apiKey: "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",
        baseURL: "https://api.groq.com/openai/v1",
    });
};

/**
 * Clean LLM response that might contain markdown backticks
 */
const cleanJson = (raw: string) => {
    return raw.replace(/```json/g, "").replace(/```/g, "").trim();
};

export const generateIdeaFromPerson = async (
    person: PersonData,
    systemInstruction: string
): Promise<Partial<IdeationData>> => {
    const groq = getGroqClient();
    const prompt = `
    System Context: ${systemInstruction}
    Generiere eine innovative App-Idee basierend auf:
    Name: ${person.name}, Expertise: ${person.expertise}, Passions: ${person.passions}, Challenges: ${person.challenges}.
    
    WICHTIG: Antworte AUSSCHLIESSLICH im JSON Format.
    {
      "projectName": "...",
      "problemStatement": "...",
      "solutionSummary": "...",
      "targetUser": "...",
      "nextAction": "..."
    }
    `;

    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || '{}';
        return JSON.parse(cleanJson(content));
    } catch (err) {
        console.error("Groq generateIdeaFromPerson Error:", err);
        throw err;
    }
};

export const processAudioIdeation = async (
    audioBase64: string,
    mimeType: string,
    userInstruction: string
): Promise<VoiceExtraction> => {
    console.log(`[Groq] Starting audio processing. Mime: ${mimeType}, Base64 length: ${audioBase64.length}`);
    const groq = getGroqClient();

    // Improved extension extraction (handles audio/webm;codecs=opus)
    let extension = "webm";
    if (mimeType.includes("wav")) extension = "wav";
    else if (mimeType.includes("mp3")) extension = "mp3";
    else if (mimeType.includes("m4a")) extension = "m4a";
    else if (mimeType.includes("ogg")) extension = "ogg";

    const buffer = Buffer.from(audioBase64, 'base64');

    try {
        // 1. Transcription (Whisper-large-v3)
        const transcription = await groq.audio.transcriptions.create({
            file: await OpenAI.toFile(buffer, `audio.${extension}`),
            model: "whisper-large-v3",
        });

        const transcript = transcription.text;
        console.log("[Groq] Transcript extracted:", transcript.substring(0, 100) + "...");

        // 2. Structured extraction via Llama
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{
                role: "user",
                content: `
                Analysiere dieses Transkript: "${transcript}"
                Kontext: ${userInstruction}

                Extrahiere Daten AUSSCHLIESSLICH im JSON Format:
                {
                  "extracted_data": { 
                    "projectName": "...", 
                    "problemStatement": "...", 
                    "solutionSummary": "...",
                    "targetUser": "...",
                    "constraints": "...",
                    "differentiation": "...",
                    "risks": "...",
                    "nextAction": "...",
                    "tags": "..."
                  },
                  "extracted_person": { 
                    "name": "...", 
                    "expertise": "...", 
                    "challenges": "...", 
                    "lifestyle": "...",
                    "passions": "..."
                  },
                  "questions": ["...", "..."]
                }
                `
            }],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || '{}';
        const result = JSON.parse(cleanJson(content));

        return {
            transcript,
            extracted_data: result.extracted_data || {},
            extracted_person: result.extracted_person,
            questions: result.questions || [],
            confidence_score: 1.0 // Mandatory per interface
        };
    } catch (err: any) {
        console.error("Groq processAudioIdeation Error:", err);
        throw new Error(`Groq Processing Failed: ${err.message}`);
    }
};
