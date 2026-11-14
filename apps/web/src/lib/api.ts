// API-Client.
// Access-Token: nur im Speicher (kein localStorage) -> bei XSS ist nach einem
// Reload nichts zu stehlen, und das Token ist nach 15 Minuten ohnehin tot.
// Refresh-Token: httpOnly-Cookie beim Server, wird vom Browser automatisch
// mitgeschickt und ist fuer JavaScript nicht lesbar.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearTokens(): void {
  accessToken = null;
}

export class ApiError extends Error {
  status: number;
  details?: string[];
  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Single-Flight-Refresh: Parallel laufende 401-Retries (z. B. React
// StrictMode doppel-mountet den Auth-Effekt, mehrere Queries gleichzeitig)
// teilen sich EINEN /auth/refresh. Ein zweiter Aufruf mit demselben Cookie
// würde die gerade rotierte Session treffen -> Diebstahl-Erkennung -> alle
// Sessions gesperrt.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccess(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // Refresh-Cookie mitschicken
      });
      if (!res.ok) return false;
      const data = await res.json();
      setAccessToken(data.accessToken);
      return true;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  // FormData (Foto-/Dokument-Uploads) setzt den Content-Type selbst —
  // keinen JSON-Header setzen, sonst bricht der Multipart-Body. DELETE
  // ohne Body: auch ohne JSON-Header schicken, sonst versucht Fastify,
  // den leeren Body als JSON zu parsen (-> 400).
  const isForm = options.body instanceof FormData;
  const hasBody = options.body != null && options.body !== "";
  const access = getAccessToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(isForm || !hasBody ? {} : { "Content-Type": "application/json" }),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry) {
    if (await refreshAccess()) {
      return api<T>(path, options, false);
    }
    clearTokens();
    // Nur umleiten, wenn wir nicht schon auf /login oder einer öffentlichen
    // Seite sind. Sonst: /auth/me scheitert -> Redirect auf /login -> Seite
    // laedt neu -> AuthProvider prueft erneut ... (flackernde Endlosschleife);
    // Gäste auf Landing/Börse/Ankauffsformular sollen nicht zum Login springen.
    const PUBLIC_PATHS = new Set(["/", "/ankauf", "/boerse", "/impressum", "/datenschutz"]);
    const path401 = window.location.pathname;
    if (path401 !== "/login" && !PUBLIC_PATHS.has(path401)) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, isJson ? body.error : "Request fehlgeschlagen", isJson ? body.details : undefined);
  }
  return body as T;
}

/**
 * Geschützte Datei (z. B. Fahrzeugausweis) laden und als Download auslösen.
 * Läuft mit Bearer-Token, da /uploads-Dokumente nicht öffentlich sind.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const access = getAccessToken();
  const res = await fetch(`/api${path}`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  });
  if (res.status === 401 && (await refreshAccess())) {
    return apiDownload(path, fallbackName);
  }
  if (!res.ok) throw new ApiError(res.status, "Download fehlgeschlagen");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}
/**
 * Geschützte Datei als Blob laden (für die In-App-Ansicht in einem Modal).
 * 401 löst wie api() einen Refresh + Retry aus.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const access = getAccessToken();
  const res = await fetch(`/api${path}`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  });
  if (res.status === 401 && (await refreshAccess())) {
    return apiBlob(path);
  }
  if (!res.ok) throw new ApiError(res.status, "Dokument konnte nicht geladen werden");
  return res.blob();
}
