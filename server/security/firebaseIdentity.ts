export interface FirebaseIdentity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
}

/**
 * Verify a Firebase ID token against Firebase Identity Toolkit.
 * The returned profile is sourced from Firebase, never from client-supplied fields.
 */
export async function verifyFirebaseIdentity(
  idToken: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<FirebaseIdentity | null> {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 12_000 || !apiKey?.trim()) {
    return null;
  }

  let response: Response;
  try {
    response = await fetcher(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
  } catch {
    throw new Error('FIREBASE_IDENTITY_UNAVAILABLE');
  }

  if (response.status >= 500 || response.status === 429) {
    throw new Error('FIREBASE_IDENTITY_UNAVAILABLE');
  }
  if (!response.ok) return null;

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new Error('FIREBASE_IDENTITY_UNAVAILABLE');
  }

  const user = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!user || typeof user.localId !== 'string' || !user.localId.trim()) return null;

  return {
    uid: user.localId,
    email: typeof user.email === 'string' ? user.email : undefined,
    emailVerified: user.emailVerified === true,
    displayName: typeof user.displayName === 'string' ? user.displayName : undefined,
  };
}
