
import { GoogleGenAI, Type } from "@google/genai";
import { IdeationData, NormalizedIdea, VoiceExtraction, PersonData } from "../../types";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

export const generateIdeaFromPerson = async (
  person: PersonData,
  systemInstruction: string
): Promise<Partial<IdeationData>> => {
  const ai = getAIClient();
  const prompt = `
    Basierend auf diesem Personenprofil, generiere eine innovative App-Idee, die genau auf diese Person zugeschnitten ist.
    
    Name/Rolle: ${person.name}
    Expertise: ${person.expertise}
    Leidenschaften: ${person.passions}
    Herausforderungen: ${person.challenges}
    Lebensstil: ${person.lifestyle}
    Zusatzinfos: ${person.manualExtension}
    
    Erstelle ein Konzept, das ein echtes Problem löst oder ein Potenzial dieser Person digital skaliert.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction + "\nAntworte auf Deutsch im JSON Format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          projectName: { type: Type.STRING },
          problemStatement: { type: Type.STRING },
          targetUser: { type: Type.STRING },
          solutionSummary: { type: Type.STRING },
          differentiation: { type: Type.STRING },
          tags: { type: Type.STRING }
        },
        required: ["projectName", "problemStatement", "targetUser", "solutionSummary", "differentiation", "tags"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const normalizeIdeation = async (
  raw: IdeationData,
  userEmail: string,
  systemInstruction: string
): Promise<NormalizedIdea> => {
  const ai = getAIClient();
  const prompt = `Normalisiere diese Daten auf DEUTSCH: ${JSON.stringify(raw)}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction + "\nAntworte immer auf Deutsch im JSON-Format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          project_name: { type: Type.STRING },
          problem_statement: { type: Type.STRING },
          target_user: { type: Type.STRING },
          solution_summary: { type: Type.STRING },
          constraints: { type: Type.STRING },
          differentiation: { type: Type.STRING },
          risks: { type: Type.STRING },
          next_action: { type: Type.STRING },
          tags: { type: Type.STRING },
          priority: { type: Type.STRING }
        }
      }
    }
  });

  const normalized = JSON.parse(response.text || '{}');
  return {
    idea_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    created_by_email: userEmail,
    project_name: normalized.project_name || raw.projectName,
    problem_statement: normalized.problem_statement || raw.problemStatement,
    target_user: normalized.target_user || raw.targetUser,
    solution_summary: normalized.solution_summary || raw.solutionSummary,
    constraints: normalized.constraints || raw.constraints,
    differentiation: normalized.differentiation || raw.differentiation,
    risks: normalized.risks || raw.risks,
    next_action: normalized.next_action || raw.nextAction,
    status: "neu",
    priority: normalized.priority || "P2",
    tags: normalized.tags || raw.tags,
    source: "ideation_app",
    version: "v1.4",
    image_url_1: "", image_url_2: "", image_url_3: "", image_url_4: "", image_url_5: "",
    audio_transcript: raw.audioTranscript || ""
  };
};

export const processAudioIdeation = async (
  audioBase64: string,
  mimeType: string,
  userInstruction: string
): Promise<VoiceExtraction> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: audioBase64, mimeType } },
        { text: "Analysiere das Audio. Transkribiere das Audio wortwörtlich (Feld: transcript) und extrahiere dann strukturiert Ideendaten ODER Personendaten." }
      ]
    },
    config: {
      systemInstruction: userInstruction + "\nAntworte im JSON Format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING, description: "Die wortwörtliche Transkription des Audios." },
          extracted_data: {
            type: Type.OBJECT,
            properties: {
              projectName: { type: Type.STRING },
              problemStatement: { type: Type.STRING },
              solutionSummary: { type: Type.STRING }
            }
          },
          extracted_person: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              expertise: { type: Type.STRING },
              passions: { type: Type.STRING },
              challenges: { type: Type.STRING }
            }
          },
          questions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["transcript"]
      }
    }
  });
  return JSON.parse(response.text || '{}');
};
