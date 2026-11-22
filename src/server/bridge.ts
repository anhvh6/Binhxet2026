import {
  createHmac,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "@/lib/domain";
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function token() {
  return randomBytes(32).toString("hex");
}
function secret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 32)
    throw new AppError(`Chưa cấu hình ${name}.`, 503);
  return value;
}
export function verifySecret(value: string, name: string) {
  const stored = process.env[name] ?? "",
    parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt")
    throw new AppError(`Chưa cấu hình ${name}.`, 503);
  const actual = scryptSync(value, parts[1], 32),
    expected = Buffer.from(parts[2], "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export async function bridge<T = unknown>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (
    !url ||
    !/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec$/.test(url)
  )
    throw new AppError(
      "Chưa kết nối Google Apps Script. Vui lòng liên hệ quản trị viên.",
      503,
    );
  const payload = JSON.stringify({
      action,
      data,
      timestamp: Date.now(),
      nonce: token(),
    }),
    signature = createHmac("sha256", secret("BRIDGE_SECRET"))
      .update(payload)
      .digest("hex");
  let result: Response;
  try {
    result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, signature }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    throw new AppError(
      "Google Sheets chưa phản hồi. Hãy thử lại; không đổi yêu cầu nộp phiếu.",
      503,
    );
  }
  let parsed: { ok: boolean; data: T; error: string; status: number };
  try {
    parsed = await result.json();
  } catch {
    throw new AppError(
      "Backend Google chưa sẵn sàng hoặc chưa được cấp quyền.",
      503,
    );
  }
  if (!parsed.ok)
    throw new AppError(
      parsed.error || "Không xử lý được yêu cầu.",
      parsed.status || 503,
    );
  return parsed.data;
}
export function ipHash(request: Request) {
  const ip = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown")
    : "local";
  return createHmac("sha256", secret("SESSION_SECRET"))
    .update(ip)
    .digest("hex");
}
export function challenge() {
  const value = Buffer.from(
    JSON.stringify({ id: token(), expires: Date.now() + 300000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret("SESSION_SECRET"))
    .update(value)
    .digest("hex");
  return `${value}.${sig}`;
}
export function verifyProof(proof: string, counter: number) {
  const [value, sig] = proof.split("."),
    expected = createHmac("sha256", secret("SESSION_SECRET"))
      .update(value ?? "")
      .digest("hex");
  if (
    !value ||
    sig !== expected ||
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    counter > 10000000
  )
    throw new AppError("Vui lòng thử xác thực lại.", 401);
  let p: { expires: number };
  try {
    p = JSON.parse(Buffer.from(value, "base64url").toString());
  } catch {
    throw new AppError("Vui lòng thử xác thực lại.", 401);
  }
  if (p.expires < Date.now() || !hash(`${proof}:${counter}`).startsWith("000"))
    throw new AppError("Vui lòng thử xác thực lại.", 401);
}
