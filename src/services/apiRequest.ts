interface TokenUser {
  uid: string;
  getIdToken: (refresh?: boolean) => Promise<string>;
}
export async function requestJson<T = any>(
  url: string,
  body: unknown,
  currentUser: () => TokenUser | null,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const user = currentUser();
  const send = async (refresh: boolean) => {
    const token = user ? await user.getIdToken(refresh) : null;
    if ((currentUser()?.uid || null) !== (user?.uid || null))
      throw new Error("Account changed. Please reopen your test.");
    return fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  };
  let response = await send(false);
  if (response.status === 401 && user) response = await send(true);
  if ((currentUser()?.uid || null) !== (user?.uid || null))
    throw new Error("Account changed. Please reopen your test.");
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.error ||
        `Request failed (${response.status}). Please retry; your answers are saved.`,
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const error = new Error("The scoring API did not return JSON. The deployed server or /api route needs checking. Your answers are saved.") as Error & { status: number };
    error.status = 502;
    throw error;
  }
  return data as T;
}

