
import { NormalizedIdea } from "../types";

// Hardcoded folder IDs for each user (pre-existing shared folders)
const USER_FOLDER_IDS: Record<string, string> = {
  'eluma0001@gmail.com': '10koBufrVkO4b7f0hKh4wFHyexhqNxrjR',
  'eluma0002@gmail.com': '1NT51UxfKdZ4CEnzSmoKFHd4mmsSZYHNf',
};


// Default fallback folder
const DEFAULT_FOLDER_ID = '1J8BjXBhuLkmSHrOXchYuLUCBPlgbVpIE';

/**
 * Get the folder ID for a specific user.
 * Uses hardcoded folder IDs since folders are pre-created and shared.
 */
export const getUserFolderId = (userEmail: string): string => {
  const folderId = USER_FOLDER_IDS[userEmail.toLowerCase()];
  if (folderId) {
    console.log(`[Drive] Using folder for ${userEmail}: ${folderId}`);
    return folderId;
  }
  console.warn(`[Drive] No folder configured for ${userEmail}, using default`);
  return DEFAULT_FOLDER_ID;
};

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
  accessToken: string,
  userEmail?: string
): Promise<string> => {
  try {
    // Get user-specific folder
    const folderId = userEmail ? getUserFolderId(userEmail) : DEFAULT_FOLDER_ID;

    const metadata = {
      name: fileName,
      mimeType: 'image/jpeg',
      parents: [folderId],
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
  accessToken: string,
  userEmail?: string,
  customFileName?: string
): Promise<{ id: string; name?: string; createdTime?: string; webContentLink?: string }> => {
  const headers = [
    "idea_id", "session_uuid", "created_at", "created_by_email", "project_name",
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

  // Use custom filename if provided, otherwise generate default
  const fileName = customFileName || `IDEATION_${idea.project_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

  try {
    // Get user-specific folder
    const folderId = userEmail ? getUserFolderId(userEmail) : DEFAULT_FOLDER_ID;

    const metadata = {
      name: fileName,
      mimeType: 'text/csv',
      parents: [folderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([csvContent], { type: 'text/csv' }));

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,webContentLink',
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

/**
 * Update an existing file in Google Drive (used for editing ideas)
 */
export const updateFileInDrive = async (
  fileId: string,
  idea: NormalizedIdea,
  accessToken: string
): Promise<void> => {
  const headers = [
    "idea_id", "session_uuid", "created_at", "created_by_email", "project_name",
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

  try {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'text/csv'
        },
        body: csvContent,
      }
    );

    await handleResponse(response);
    console.log(`[Drive] File ${fileId} updated successfully`);
  } catch (error: any) {
    console.error("Drive Update Error:", error);
    throw error;
  }
};

/**
 * List ideation files for a specific user (filtered by parent folder)
 * Supports both old format (IDEATION_...) and new format (DATE_AUTHOR_PROJECT_UUID.csv)
 */
export const listIdeationFilesForUser = async (
  accessToken: string,
  userEmail: string
): Promise<any[]> => {
  try {
    const folderId = getUserFolderId(userEmail);
    // Query all CSV files in the user's folder (not just IDEATION_ prefix)
    const query = `'${folderId}' in parents and mimeType = 'text/csv' and trashed = false`;
    const encodedQuery = encodeURIComponent(query);

    console.log(`[Drive] Listing files for ${userEmail} in folder ${folderId}`);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id,name,createdTime)&orderBy=createdTime desc`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    await handleResponse(response);
    const data = await response.json();
    console.log(`[Drive] Found ${data.files?.length || 0} files`);
    return data.files || [];
  } catch (error: any) {
    console.error("List Files For User Error:", error);
    throw error;
  }
};

/**
 * Parse CSV content into a NormalizedIdea object
 */
export const parseCSVToIdea = (csvContent: string): NormalizedIdea => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('Invalid CSV: missing header or data row');
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVRow(headerLine);

  // Parse data row
  const dataLine = lines[1];
  const values = parseCSVRow(dataLine);

  // Build object from headers and values
  const result: any = {};
  headers.forEach((header, index) => {
    result[header] = values[index] || '';
  });

  return result as NormalizedIdea;
};

/**
 * Helper: Parse a single CSV row (handles quoted values with commas)
 */
const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

