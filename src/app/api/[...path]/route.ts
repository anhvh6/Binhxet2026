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
import {
  isSupabaseEnabled,
  getSupabaseProgress,
  loginSupabaseVoter,
  reviewSupabaseCode,
  getSupabaseMe,
  unlockSupabaseEdit,
  submitSupabaseBallot,
  validateSupabaseBallot,
  getSupabaseDashboard,
  resetSupabaseData,
} from "@/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const cookieName = "vcx_session";

function response(data: unknown, cacheControl = "private, no-store") {
  return NextResponse.json(data, {
    headers: { "Cache-Control": cacheControl },
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

    // 1. TIẾN ĐỘ THAM GIA
    if (read && ["voting/progress", "election"].includes(path)) {
      if (isSupabaseEnabled()) {
        try {
          const sbProgress = await getSupabaseProgress();
          if (sbProgress)
            return response(
              sbProgress,
              "public, s-maxage=3, stale-while-revalidate=10",
            );
        } catch {
          // fallback to bridge if error
        }
      }
      return response(
        await bridge("progress"),
        "public, s-maxage=3, stale-while-revalidate=10",
      );
    }

    // 2. XEM LẠI PHIẾU
    if (!read && path === "auth/review") {
      const input = z
        .object({
          code: z.string().regex(/^\d{4}$/, "Mã bí mật gồm đúng 4 chữ số"),
        })
        .parse(p);

      if (isSupabaseEnabled()) {
        try {
          const sbReview = await reviewSupabaseCode(input.code);
          if (sbReview) {
            const nextToken = token();
            await loginSupabaseVoter(input.code, hash(nextToken)).catch(() => {});
            const res = response(sbReview);
            res.cookies.set(cookieName, nextToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
              path: "/",
              maxAge: 3600,
            });
            return res;
          }
        } catch (e) {
          if ((e as Error).message.includes("chưa nộp phiếu")) {
            throw new AppError((e as Error).message, 404);
          }
        }
      }
      const resData = await bridge("reviewCode", { code: input.code });
      return response(resData);
    }

    // 3. ĐĂNG NHẬP (VOTER / ADMIN)
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

      const nextToken = token();

      let result: unknown = null;

      if (path === "auth/voter" && isSupabaseEnabled()) {
        try {
          result = await loginSupabaseVoter(input.code, hash(nextToken));
        } catch (e) {
          throw new AppError((e as Error).message || "Không thể xác thực.", 401);
        }
      }

      if (!result) {
        result = await bridge(path === "auth/voter" ? "login" : "adminLogin", {
          code: path === "auth/voter" ? input.code : undefined,
          verified:
            path === "admin/login"
              ? verifySecret(input.code, "ADMIN_RESULT_CODE_HASH")
              : undefined,
          newTokenHash: hash(nextToken),
          ipHash: ipHash(req),
        });
      }

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

    // 4. RESET DỮ LIỆU
    if (!read && path === "admin/reset") {
      const input = z.object({ adminCode: z.string().min(1) }).parse(p);
      if (!verifySecret(input.adminCode, "ADMIN_RESULT_CODE_HASH"))
        throw new AppError("Mã xác nhận quản trị không chính xác.", 401);

      if (isSupabaseEnabled()) {
        try {
          await resetSupabaseData();
        } catch {}
      }

      const resetResult = await bridge("reset", { tokenHash });
      return response(resetResult);
    }

    // 5. ĐĂNG XUẤT
    if (!read && ["auth/logout", "admin/logout"].includes(path)) {
      if (session) await bridge("logout", { tokenHash });
      const res = response({ ok: true });
      res.cookies.delete(cookieName);
      return res;
    }

    // 6. MỞ KHÓA SỬA PHIẾU
    if (!read && path === "ballot/unlock-edit") {
      const input = z
        .object({
          code: z.string().regex(/^\d{4}$/),
          voterCode: z.string().regex(/^\d{4}$/).optional(),
        })
        .parse(p);

      const isVerified = verifySecret(input.code, "BALLOT_EDIT_CODE_HASH");
      if (!isVerified) throw new AppError("Mã xác nhận sửa phiếu không chính xác.", 401);

      const nextToken = token();
      const nextHash = hash(nextToken);

      if (isSupabaseEnabled()) {
        try {
          const unlocked = await unlockSupabaseEdit(tokenHash, input.voterCode, nextHash);
          if (unlocked) {
            void bridge("unlock", {
              tokenHash: nextHash,
              verified: isVerified,
            }).catch(() => {});

            const res = response({ ok: true, voterCode: unlocked.voterCode });
            res.cookies.set(cookieName, nextToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
              path: "/",
              maxAge: 3600,
            });
            return res;
          }
        } catch (e) {
          if (e instanceof AppError) throw e;
          throw new AppError((e as Error).message || "Không thể mở quyền sửa phiếu.", 400);
        }
      }

      if (!session && !input.voterCode) throw new AppError("Vui lòng đăng nhập.", 401);

      const resBridge = await bridge("unlock", {
        tokenHash,
        verified: isVerified,
        newTokenHash: nextHash,
      });

      const res = response(resBridge);
      res.cookies.set(cookieName, nextToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 3600,
      });
      return res;
    }

    if (!session) throw new AppError("Vui lòng đăng nhập.", 401);

    // 7. THÔNG TIN PHIẾU CỦA USER HIỆN TẠI
    if (read && ["ballot/me", "candidates", "teams"].includes(path)) {
      if (isSupabaseEnabled()) {
        try {
          const sbMe = await getSupabaseMe(tokenHash);
          if (sbMe) return response(sbMe);
        } catch {}
      }
      return response(await bridge("me", { tokenHash }));
    }

    // 8. NỘP VÀ XÁC THỰC PHIẾU BÌNH CHỌN
    if (
      !read &&
      ["ballot/validate", "ballot/submit", "ballot"].includes(path)
    ) {
      const input = ballotInput.parse(p);

      if (path === "ballot/validate" && isSupabaseEnabled()) {
        try {
          const resVal = await validateSupabaseBallot(tokenHash, input.choices);
          return response(resVal);
        } catch (e) {
          if (e instanceof AppError) throw e;
          throw new AppError((e as Error).message || "Không thể xác thực lựa chọn.", 400);
        }
      }

      if (path === "ballot/submit" && isSupabaseEnabled()) {
        try {
          const sbBallot = await submitSupabaseBallot(
            tokenHash,
            input.choices,
            input.revision,
            input.idempotencyKey,
          );
          if (sbBallot) {
            // Đồng bộ ngầm sang Google Sheets
            void bridge("submit", { ...input, tokenHash }).catch(() => {});
            return response(sbBallot);
          }
        } catch (e) {
          throw new AppError((e as Error).message, 409);
        }
      }

      return response(
        await bridge(path === "ballot/validate" ? "validate" : "submit", {
          ...input,
          tokenHash,
        }),
      );
    }

    // 9. DASHBOARD VÀ BÁO CÁO ADMIN
    const adminReads: Record<string, string> = {
      "admin/dashboard": "dashboard",
      "admin/results/ldtt": "dashboard",
      "admin/results/teams": "dashboard",
      "admin/results/cstd": "dashboard",
      "admin/source": "source",
      "admin/credentials/status": "credentialStatus",
    };

    if (read && adminReads[path]) {
      if (path === "admin/dashboard" && isSupabaseEnabled()) {
        try {
          const sbDashboard = await getSupabaseDashboard();
          if (sbDashboard)
            return response(
              sbDashboard,
              "private, s-maxage=5, stale-while-revalidate=15",
            );
        } catch {}
      }
      return response(
        await bridge(adminReads[path], { tokenHash }),
        "private, s-maxage=5, stale-while-revalidate=15",
      );
    }

    // 10. XUẤT EXCEL
    if (read && path === "admin/export") {
      let data: Dashboard | null = null;
      if (isSupabaseEnabled()) {
        try {
          data = await getSupabaseDashboard();
        } catch {}
      }
      if (!data) {
        data = await bridge<Dashboard>("export", { tokenHash });
      }
      if (!data?.election) throw new AppError("Chưa có phiên dữ liệu.", 409);

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
