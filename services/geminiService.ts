
import { GoogleGenAI, Type } from "@google/genai";
import { IdeationData, NormalizedIdea, VoiceExtraction } from "../types";

export const normalizeIdeation = async (
  raw: IdeationData, 
  userEmail: string,
  systemInstruction: string
): Promise<NormalizedIdea> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Normalisiere die folgenden Ideations-Eingaben in ein standardisiertes, maschinenlesbares Format auf DEUTSCH.
    
    Eingaben:
    Projektname: ${raw.projectName}
    Problem: ${raw.problemStatement}
    Zielgruppe: ${raw.targetUser}
    Lösung: ${raw.solutionSummary}
    Einschränkungen: ${raw.constraints}
    Differenzierung: ${raw.differentiation}
    Risiken: ${raw.risks}
    Nächster Schritt: ${raw.nextAction}
    Tags: ${raw.tags}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction + "\nAntworte immer auf Deutsch. Erzeuge eine strukturierte JSON-Ausgabe.",
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
          tags: { type: Type.STRING, description: "Mit Pipe getrennte Tags wie tag1|tag2" },
          priority: { type: Type.STRING, description: "Eines von P0, P1, P2, P3" }
        },
        required: ["project_name", "problem_statement", "target_user", "solution_summary", "constraints", "differentiation", "risks", "next_action", "tags", "priority"]
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
    tags: normalized.tags || raw.tags.split(',').map(t => t.trim()).join('|'),
    source: "ideation_app",
    version: "v1.3",
    image_url_1: "",
    image_url_2: "",
    image_url_3: "",
    image_url_4: "",
    image_url_5: ""
  };
};

export const processAudioIdeation = async (
  audioBase64: string,
  mimeType: string,
  userInstruction: string
): Promise<VoiceExtraction> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType
        }
      },
      {
        text: "Höre dir diese Sprachnotiz an. Extrahiere so viele Ideationsdaten wie möglich in das angegebene JSON-Format auf DEUTSCH. Falls wichtige Informationen (Projektname, Problem oder Lösung) fehlen, stelle MAXIMAL zwei präzise Rückfragen. Sei ein hilfreicher kreativer Assistent."
      }
    ],
    config: {
      systemInstruction: userInstruction + "\nDu bist ein Experte im Zuhören. Extrahiere Ideendaten aus Audio. Antworte NUR im JSON-Format auf Deutsch.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extracted_data: {
            type: Type.OBJECT,
            properties: {
              projectName: { type: Type.STRING },
              problemStatement: { type: Type.STRING },
              targetUser: { type: Type.STRING },
              solutionSummary: { type: Type.STRING },
              constraints: { type: Type.STRING },
              differentiation: { type: Type.STRING },
              risks: { type: Type.STRING },
              nextAction: { type: Type.STRING },
              tags: { type: Type.STRING }
            }
          },
          questions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Max. 2 Fragen, falls kritische Infos fehlen."
          },
          confidence_score: { type: Type.NUMBER }
        },
        required: ["extracted_data", "questions"]
      }
    }
  });

  return JSON.parse(response.text || '{}') as VoiceExtraction;
};
