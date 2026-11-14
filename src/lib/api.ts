import { signOut } from 'firebase/auth';
import { auth } from './firebase';

export const SESSION_EXPIRED_EVENT = 'jamii-session-expired';

function notifySessionExpired(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } })
    );
  }
}

function isRefreshTokenFailure(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  return (
    code === 'auth/user-token-expired' ||
    code === 'auth/invalid-user-token' ||
    code === 'auth/user-disabled' ||
    code === 'auth/user-not-found' ||
    code === 'auth/requires-recent-login'
  );
}

async function getValidIdToken(forceRefresh = false): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken(forceRefresh);
  } catch (err) {
    if (isRefreshTokenFailure(err) || forceRefresh) {
      await signOut(auth).catch(() => {});
      notifySessionExpired(
        'Your session has expired. Please sign in again to continue.'
      );
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw err;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const buildHeaders = (token: string | null) => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  };

  let token = await getValidIdToken(false);
  let response = await fetch(path, {
    ...options,
    headers: buildHeaders(token),
  });

  // If access token expired or was rejected, force-refresh using the Firebase refresh token and retry once
  if (response.status === 401 && auth.currentUser) {
    token = await getValidIdToken(true);
    response = await fetch(path, {
      ...options,
      headers: buildHeaders(token),
    });

    if (response.status === 401) {
      await signOut(auth).catch(() => {});
      notifySessionExpired(
        'Your session could not be renewed. Please sign in again.'
      );
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export async function uploadFileToServer(
  file: File,
  purpose: 'profile_photo' | 'id_document'
): Promise<{ id: number; url: string; fileName: string }> {
  const maxBytes = 3 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('File must be smaller than 3 MB.');
  }

  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file'));
    reader.readAsDataURL(file);
  });

  return apiFetch('/api/files/upload', {
    method: 'POST',
    body: JSON.stringify({
      purpose,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64,
    }),
  });
}

export const NAIROBI_LOCATIONS = [
  { label: 'Kilimani, Nairobi', lat: -1.2921, lng: 36.7879 },
  { label: 'Westlands, Nairobi', lat: -1.2635, lng: 36.8032 },
  { label: 'Karen, Nairobi', lat: -1.3204, lng: 36.7069 },
  { label: 'Lavington, Nairobi', lat: -1.2768, lng: 36.7689 },
  { label: 'Kileleshwa, Nairobi', lat: -1.2818, lng: 36.7806 },
  { label: 'South C, Nairobi', lat: -1.3189, lng: 36.8261 },
  { label: 'Gigiri & Runda, Nairobi', lat: -1.2335, lng: 36.8112 },
  { label: 'Upper Hill, Nairobi', lat: -1.2981, lng: 36.8165 },
];
