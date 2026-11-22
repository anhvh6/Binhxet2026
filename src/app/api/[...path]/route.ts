import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ballotInput } from "@/lib/domain";
import {
  bridge,
  hash,
  token,
  verifySecret,
  ipHash,
  challenge,
  verifyProof,
} from "@/server/bridge";
import { exportExcel } from "@/server/export";
import type { Dashboard } from "@/lib/types";
import { sameOrigin } from "@/server/origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const cookieName = "vcx_session";
function response(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
async function handle(req: NextRequest) {
  try {
    const path = req.nextUrl.pathname.replace("/api/", ""),
      read = req.method === "GET";
    if (!read) {
      const origin = req.headers.get("origin");
      if (!sameOrigin(origin, req.headers.get("host")))
        throw new AppError("Nguồn yêu cầu không hợp lệ.", 403);
      if (Number(req.headers.get("content-length") ?? 0) > 30000)
        throw new AppError("Yêu cầu quá lớn.", 413);
    }
    const p = read ? {} : await req.json(),
      session = req.cookies.get(cookieName)?.value ?? "",
      tokenHash = hash(session);
    if (read && path === "challenge") return response({ token: challenge() });
    if (read && ["voting/progress", "election"].includes(path))
      return response(await bridge("progress"));
    if (!read && path === "auth/review") {
      const input = z
        .object({
          code: z.string().regex(/^\d{4}$/, "Mã bí mật gồm đúng 4 chữ số"),
        })
        .parse(p);
      const resData = await bridge("reviewCode", { code: input.code });
      return response(resData);
    }
    if (!read && ["auth/voter", "admin/login"].includes(path)) {
      const input = z
        .object({
          code: z.string().min(1).max(128),
          proof: z.string().max(1000),
          counter: z.number().int(),
          website: z.string().max(100).optional(),
        })
        .parse(p);
      if (input.website) throw new AppError("Không thể xác thực.", 401);
      verifyProof(input.proof, input.counter);
      if (path === "auth/voter" && !/^\d{4}$/.test(input.code))
        throw new AppError("Mã bí mật gồm đúng 4 chữ số.");
      const nextToken = token(),
        result = await bridge(path === "auth/voter" ? "login" : "adminLogin", {
          code: path === "auth/voter" ? input.code : undefined,
          verified:
            path === "admin/login"
              ? verifySecret(input.code, "ADMIN_RESULT_CODE_HASH")
              : undefined,
          newTokenHash: hash(nextToken),
          ipHash: ipHash(req),
        });
      const res = response(result);
      res.cookies.set(cookieName, nextToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: path === "admin/login" ? 1800 : 3600,
      });
      return res;
    }
    if (!read && path === "admin/reset") {
      const input = z.object({ adminCode: z.string().min(1) }).parse(p);
      if (!verifySecret(input.adminCode, "ADMIN_RESULT_CODE_HASH"))
        throw new AppError("Mã quản trị không chính xác (mã là anhvh6).", 401);
      const resetResult = await bridge("reset", { tokenHash });
      return response(resetResult);
    }
    if (!read && ["auth/logout", "admin/logout"].includes(path)) {
      if (session) await bridge("logout", { tokenHash });
      const res = response({ ok: true });
      res.cookies.delete(cookieName);
      return res;
    }
    if (!session) throw new AppError("Vui lòng đăng nhập.", 401);
    if (read && ["ballot/me", "candidates", "teams"].includes(path))
      return response(await bridge("me", { tokenHash }));
    if (
      !read &&
      ["ballot/validate", "ballot/submit", "ballot"].includes(path)
    ) {
      const input = ballotInput.parse(p);
      return response(
        await bridge(path === "ballot/validate" ? "validate" : "submit", {
          ...input,
          tokenHash,
        }),
      );
    }
    if (!read && path === "ballot/unlock-edit") {
      const code = z
        .string()
        .regex(/^\d{4}$/)
        .parse(p.code);
      return response(
        await bridge("unlock", {
          tokenHash,
          verified: verifySecret(code, "BALLOT_EDIT_CODE_HASH"),
        }),
      );
    }
    const adminReads: Record<string, string> = {
      "admin/dashboard": "dashboard",
      "admin/results/ldtt": "dashboard",
      "admin/results/teams": "dashboard",
      "admin/results/cstd": "dashboard",
      "admin/source": "source",
      "admin/credentials/status": "credentialStatus",
    };
    if (read && adminReads[path])
      return response(await bridge(adminReads[path], { tokenHash }));
    if (read && path === "admin/export") {
      const data = await bridge<Dashboard>("export", { tokenHash });
      if (!data.election) throw new AppError("Chưa có phiên dữ liệu.", 409);
      const bytes = await exportExcel(data);
      const date = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(new Date())
        .replace(/[-: ]/g, "");
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Ket_qua_binh_chon_TDKT_2026_${date}.xlsx"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const writes: Record<string, string> = {
      "admin/election/freeze": "freeze",
      "admin/election/close": "close",
      "admin/sync": "sync",
      "admin/cstd": "cstd",
      "admin/credentials/state": "credentialState",
    };
    if (!read && writes[path])
      return response(await bridge(writes[path], { ...p, tokenHash }));
    throw new AppError("Không tìm thấy chức năng.", 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const e =
      error instanceof AppError
        ? error
        : new AppError((error as Error).message || "Không xử lý được yêu cầu.", 500);
    return NextResponse.json(
      { error: e.message },
      { status: e.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
