export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Không kết nối được hệ thống.");
  return result as T;
}
export async function proof() {
  const { token } = await api<{ token: string }>("challenge");
  const encoder = new TextEncoder();
  for (let counter = 0; counter < 10000000; counter++) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`${token}:${counter}`),
    );
    const a = new Uint8Array(bytes);
    if (a[0] === 0 && (a[1] & 240) === 0) return { proof: token, counter };
  }
  throw new Error("Vui lòng thử lại.");
}
