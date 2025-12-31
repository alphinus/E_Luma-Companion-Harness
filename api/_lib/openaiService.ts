
import OpenAI from "openai";
import { IdeationData, PersonData, NormalizedIdea, VoiceExtraction } from "../../types";

const getOpenAIClient = () => {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

export const generateIdeaFromPerson = async (
    person: PersonData,
    systemInstruction: string
): Promise<Partial<IdeationData>> => {
    const openai = getOpenAIClient();
    const prompt = `
    System Context: ${systemInstruction}
    
    Basierend auf diesem Personenprofil, generiere eine innovative App-Idee, die genau auf diese Person zugeschnitten ist.
    
    Name/Rolle: ${person.name}
    Expertise: ${person.expertise}
    Leidenschaften: ${person.passions}
    Herausforderungen: ${person.challenges}
    Lebensstil: ${person.lifestyle}
    Zusatzinfos: ${person.manualExtension}
    
    Erstelle ein Konzept, das ein echtes Problem löst oder ein Potenzial dieser Person digital skaliert.
    Antworte auf DEUTSCH.
  `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
};

export const normalizeIdeation = async (
    raw: IdeationData,
    userEmail: string,
    systemInstruction: string
): Promise<NormalizedIdea> => {
    const openai = getOpenAIClient();
    const prompt = `
    System Context: ${systemInstruction}
    Normalisiere diese Daten auf DEUTSCH und gib ein JSON Objekt zurück: ${JSON.stringify(raw)}
  `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    const normalized = JSON.parse(response.choices[0].message.content || '{}');
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
        source: "ideation_app_openai",
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
    const openai = getOpenAIClient();

    // 1. Convert Base64 to Buffer for OpenAI
    const buffer = Buffer.from(audioBase64, 'base64');

    // 2. Transcribe using Whisper
    // We create a virtual file using a Buffer
    const transcription = await openai.audio.transcriptions.create({
        file: await OpenAI.toFile(buffer, `input-audio.${mimeType.split('/')[1] || 'webm'}`),
        model: "whisper-1",
    });

    const transcript = transcription.text;

    // 3. Extract structured data using GPT-4o-mini
    const prompt = `
    Analysiere das folgende Audio-Transkript einer App-Idee oder eines Personenprofils.
    Beachte den System-Kontext: ${userInstruction}

    Extrahiere die folgenden Informationen im JSON-Format:
    - extracted_data: { projectName, problemStatement, solutionSummary } (falls App-Idee)
    - extracted_person: { name, expertise, passions, challenges } (falls Personenprofil)
    - questions: [] (optionale Rückfragen)

    Transkript: "${transcript}"
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
        transcript,
        extracted_data: result.extracted_data,
        extracted_person: result.extracted_person,
        questions: result.questions || []
    };
};

// Harness Spec Feature Expansion
export const expandHarnessFeatures = async (
    prompt: string,
    projectName: string
): Promise<{ content: string }> => {
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: "Du bist ein erfahrener Software-Architekt. Generiere Feature-Listen im JSON-Array Format. Antworte nur mit dem JSON-Array, keine zusätzlichen Erklärungen."
            },
            {
                role: "user",
                content: prompt
            }
        ],
        max_tokens: 8000,
        temperature: 0.7
    });

    return {
        content: response.choices[0].message.content || '[]'
    };
};

// Harness KI-Voranalyse
export interface HarnessAnalysis {
    suggestedType: 'Mobile App' | 'SaaS' | 'Tool' | 'API' | 'CLI' | 'Library';
    typeReason: string;
    suggestedTechStack: Record<string, string>;
    suggestedFeatures: string[];
    inputQuality: 'strong' | 'medium' | 'weak';
    questions?: string[];
}

export const analyzeIdeaForHarness = async (
    idea: {
        project_name: string;
        problem_statement: string;
        solution_summary: string;
        target_user: string;
        constraints?: string;
        tags?: string;
    }
): Promise<HarnessAnalysis> => {
    const openai = getOpenAIClient();

    const prompt = `
Analysiere diese App-Idee und gib Empfehlungen für die technische Umsetzung.

PROJEKT: ${idea.project_name}
PROBLEM: ${idea.problem_statement}
LÖSUNG: ${idea.solution_summary}
ZIELGRUPPE: ${idea.target_user}
EINSCHRÄNKUNGEN: ${idea.constraints || 'Keine angegeben'}
TAGS: ${idea.tags || 'Keine'}

Analysiere und antworte im JSON-Format:
{
    "suggestedType": "Mobile App" | "SaaS" | "Tool" | "API" | "CLI" | "Library",
    "typeReason": "Kurze Begründung warum dieser Typ (z.B. 'Bluetooth und Android erwähnt')",
    "suggestedTechStack": {
        // Für Mobile App:
        "framework": "React Native" | "Flutter" | "Kotlin" | "Swift" | "Expo",
        "backend": "Firebase" | "Supabase" | "AWS Amplify" | "Custom API" | "None",
        "database": "Firestore" | "SQLite" | "Realm" | "None",
        "auth": "Firebase Auth" | "Biometric" | "None"

        // Für SaaS:
        "backend": "Next.js API" | "Node.js + Express" | "FastAPI",
        "database": "Supabase" | "PostgreSQL" | "MongoDB",
        "frontend": "Next.js" | "React + Vite" | "Vue",
        "auth": "Supabase Auth" | "Clerk" | "NextAuth",
        "hosting": "Vercel" | "Railway" | "AWS"

        // Passend zum suggestedType wählen!
    },
    "suggestedFeatures": [
        "Feature 1 - kurze Beschreibung",
        "Feature 2 - kurze Beschreibung",
        "Feature 3 - kurze Beschreibung"
    ],
    "inputQuality": "strong" | "medium" | "weak",
    "questions": ["Frage 1?", "Frage 2?"]  // NUR wenn inputQuality = "weak"
}

WICHTIG:
- Bei "Mobile App": Niemals Supabase/Next.js empfehlen, sondern Firebase/React Native
- Bei "SaaS": Web-Stack wie Next.js/Supabase
- Bei schwachem Input (vage Beschreibung): inputQuality="weak" und Rückfragen stellen
- Features sollten konkret und umsetzbar sein
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: "Du bist ein erfahrener Software-Architekt. Analysiere App-Ideen und empfehle passende Tech-Stacks. Antworte NUR mit validem JSON."
            },
            {
                role: "user",
                content: prompt
            }
        ],
        response_format: { type: "json_object" },
        temperature: 0.5
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
        suggestedType: result.suggestedType || 'SaaS',
        typeReason: result.typeReason || 'Standardempfehlung',
        suggestedTechStack: result.suggestedTechStack || {},
        suggestedFeatures: result.suggestedFeatures || [],
        inputQuality: result.inputQuality || 'medium',
        questions: result.questions
    };
};
