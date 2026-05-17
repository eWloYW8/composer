export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let message = response.statusText;
    if (text) {
      try {
        const payload = JSON.parse(text) as { error?: string };
        message = payload.error ?? text;
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function fetchText(input: string, init?: RequestInit): Promise<string> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || response.statusText);
  }
  return text;
}
