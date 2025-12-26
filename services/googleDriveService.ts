
import { NormalizedIdea } from "../types";

/**
 * Hilfsfunktion zur Behandlung von Google API-Antworten und Fehlern.
 */
const handleResponse = async (response: Response) => {
  if (response.ok) return response;

  let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.';
  try {
    const errorData = await response.json();
    errorMessage = errorData.error?.message || response.statusText;
  } catch (e) {
    errorMessage = response.statusText || 'Netzwerkfehler';
  }

  switch (response.status) {
    case 401:
      throw new Error('Sitzung abgelaufen. Bitte melde dich erneut an (Logout/Login), um den Zugriff zu erneuern.');
    case 403:
      throw new Error('Zugriff verweigert. Bitte stelle sicher, dass die App die nötigen Berechtigungen für deinen Google Drive hat.');
    case 429:
      throw new Error('Zu viele Anfragen an Google Drive (Rate Limit). Bitte warte kurz und versuche es gleich noch einmal.');
    case 404:
      throw new Error('Die angeforderte Datei wurde nicht gefunden.');
    default:
      throw new Error(`Google Drive Fehler (${response.status}): ${errorMessage}`);
  }
};

export const uploadImageToDrive = async (
  base64Data: string,
  fileName: string,
  accessToken: string
): Promise<string> => {
  try {
    const metadata = {
      name: fileName,
      mimeType: 'image/jpeg',
    };

    const base64Content = base64Data.split(',')[1];
    if (!base64Content) throw new Error('Ungültige Bilddaten: Base64-Inhalt fehlt.');

    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: form,
      }
    );

    await handleResponse(response);
    const data = await response.json();
    return data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
  } catch (error: any) {
    console.error("Drive Image Upload Error:", error);
    throw error;
  }
};

export const saveToGoogleDrive = async (
  idea: NormalizedIdea,
  accessToken: string
): Promise<{ fileId: string; webContentLink?: string }> => {
  const headers = [
    "idea_id", "created_at", "created_by_email", "project_name", 
    "problem_statement", "target_user", "solution_summary", "constraints", 
    "differentiation", "risks", "next_action", "status", "priority", 
    "tags", "source", "version", 
    "image_url_1", "image_url_2", "image_url_3", "image_url_4", "image_url_5",
    "audio_transcript"
  ];
  
  const values = headers.map(h => {
    const val = (idea as any)[h] || "";
    return `"${String(val).replace(/"/g, '""')}"`;
  });

  const csvContent = headers.join(",") + "\n" + values.join(",") + "\n";
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `IDEATION_${idea.project_name.replace(/\s+/g, '_')}_${dateStr}.csv`;

  try {
    const metadata = {
      name: fileName,
      mimeType: 'text/csv',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([csvContent], { type: 'text/csv' }));

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: form,
      }
    );

    await handleResponse(response);
    return await response.json();
  } catch (error) {
    console.error("Drive CSV Error:", error);
    throw error;
  }
};

export const listIdeationFiles = async (accessToken: string): Promise<any[]> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name contains 'IDEATION_' and mimeType = 'text/csv' and trashed = false&fields=files(id,name,createdTime)&orderBy=createdTime desc`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    await handleResponse(response);
    const data = await response.json();
    return data.files || [];
  } catch (error: any) {
    console.error("List Files Error:", error);
    throw error;
  }
};

export const getFileContent = async (fileId: string, accessToken: string): Promise<string> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    await handleResponse(response);
    return await response.text();
  } catch (error: any) {
    console.error("Get File Content Error:", error);
    throw error;
  }
};

export const downloadCsvLocally = (idea: NormalizedIdea) => {
  const headers = Object.keys(idea);
  const values = Object.values(idea).map(v => `"${String(v).replace(/"/g, '""')}"`);
  const content = headers.join(",") + "\n" + values.join(",");
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ideation_${idea.project_name}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
