import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Dashboard, Progress, Me, Ballot, ReviewResult } from "@/lib/types";
import { AppError, validateChoices, type Candidate, type Team, type Snapshot } from "@/lib/domain";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://kbmkxfkfhtgdgpqujcxv.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

let clientInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_KEY) return null;
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  }
  return clientInstance;
}

export function isSupabaseEnabled(): boolean {
  return !!SUPABASE_KEY;
}

// 1. LẤY TIẾN ĐỘ THAM GIA
export async function getSupabaseProgress(): Promise<Progress | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const [electionRes, totalRes, submittedRes, quotaRes] = await Promise.all([
    sb.from("elections").select("status").eq("id", "vcx-2026").single(),
    sb.from("candidates").select("id", { count: "exact", head: true }),
    sb.from("ballots").select("id", { count: "exact", head: true }),
    sb.from("teams").select("quota"),
  ]);

  if (electionRes.error || !electionRes.data) return null;

  const total = totalRes.count || 40;
  const submitted = submittedRes.count || 0;
  const quota = (quotaRes.data || []).reduce((n, t) => n + (t.quota || 0), 0);

  return {
    ready: true,
    status: electionRes.data.status,
    total,
    submitted,
    quota: quota || 18,
  };
}

// 2. ĐĂNG NHẬP BẰNG MÃ BÍ MẬT 4 SỐ (ẨN DANH)
export async function loginSupabaseVoter(code: string, tokenHash: string): Promise<Me | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // Kiểm tra mã tồn tại trong voter_credentials
  const credRes = await sb
    .from("voter_credentials")
    .select("code, status")
    .eq("code", code)
    .single();

  if (credRes.error || !credRes.data) {
    throw new Error("Mã bí mật không tồn tại trong hệ thống.");
  }

  if (["Bị khóa", "Đã thu hồi"].includes(credRes.data.status)) {
    throw new Error("Mã bí mật này đã bị khóa hoặc thu hồi.");
  }

  // Lấy thông tin kỳ bầu cử, candidates, teams
  const [electionRes, teamsRes, candidatesRes, ballotRes] = await Promise.all([
    sb.from("elections").select("*").eq("id", "vcx-2026").single(),
    sb.from("teams").select("*").order("order_index", { ascending: true }),
    sb.from("candidates").select("*").order("score", { ascending: false }),
    sb.from("ballots").select("*").eq("voter_code", code).maybeSingle(),
  ]);

  if (electionRes.error || !electionRes.data) {
    throw new Error("Đợt bình chọn chưa được khởi tạo trên Supabase.");
  }

  const teams: Team[] = (teamsRes.data || []).map((t) => ({
    id: t.id,
    label: t.label,
    order: t.order_index,
    size: t.size,
    quota: t.quota,
    lead: t.lead,
  }));

  const candidates: Candidate[] = (candidatesRes.data || [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team_id,
      lead: c.is_lead,
      score: Number(c.score),
      ki: c.ki,
      initiative: c.initiative,
      reward: c.reward,
      tenure: c.tenure,
      performance: c.performance,
      other: "",
      basis: c.basis,
      cstd: c.cstd,
    }))
    .sort((a, b) => {
      const orderA = teams.findIndex((t) => t.id === a.team);
      const orderB = teams.findIndex((t) => t.id === b.team);
      if (orderA !== orderB) return orderA - orderB;
      if (a.lead && !b.lead) return -1;
      if (!a.lead && b.lead) return 1;
      return b.score - a.score || a.id.localeCompare(b.id);
    });

  const snapshot: Snapshot = {
    candidates,
    teams,
    warnings: [],
    conflicts: [],
    fetchedAt: new Date().toISOString(),
  };

  const election = {
    id: electionRes.data.id,
    year: electionRes.data.year,
    status: electionRes.data.status,
    version: electionRes.data.version,
    snapshot,
    frozenAt: electionRes.data.created_at,
  };

  // Cập nhật session
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await sb.from("sessions").upsert({
    token_hash: tokenHash,
    role: "voter",
    voter_code: code,
    expires_at: expiresAt,
  });

  if (!ballotRes.data && credRes.data.status === "Chưa sử dụng") {
    await sb
      .from("voter_credentials")
      .update({ status: "Đang thao tác", updated_at: new Date().toISOString() })
      .eq("code", code);
  }

  const ballot: Ballot | null = ballotRes.data
    ? {
        id: ballotRes.data.id,
        voterId: ballotRes.data.voter_code,
        choices: ballotRes.data.choices || [],
        revision: ballotRes.data.revision || 0,
        version: ballotRes.data.version || 1,
        status: ballotRes.data.status || "submitted",
        submittedAt: ballotRes.data.submitted_at,
        updatedAt: ballotRes.data.updated_at,
      }
    : null;

  return {
    voterId: code,
    code,
    ballot,
    election,
    canEdit: false,
  };
}

// 3. XEM LẠI PHIẾU CỦA 1 MÃ BẤT KỲ
export async function reviewSupabaseCode(code: string): Promise<ReviewResult | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const [credRes, ballotRes, electionRes, teamsRes, candidatesRes] = await Promise.all([
    sb.from("voter_credentials").select("code").eq("code", code).single(),
    sb.from("ballots").select("*").eq("voter_code", code).maybeSingle(),
    sb.from("elections").select("*").eq("id", "vcx-2026").single(),
    sb.from("teams").select("*").order("order_index", { ascending: true }),
    sb.from("candidates").select("*").order("score", { ascending: false }),
  ]);

  if (credRes.error || !credRes.data) {
    throw new Error("Mã bí mật không tồn tại trong hệ thống.");
  }

  if (!ballotRes.data) {
    throw new Error(`Mã ${code} chưa nộp phiếu bình chọn.`);
  }

  const teams: Team[] = (teamsRes.data || []).map((t) => ({
    id: t.id,
    label: t.label,
    order: t.order_index,
    size: t.size,
    quota: t.quota,
    lead: t.lead,
  }));

  const candidates: Candidate[] = (candidatesRes.data || [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team_id,
      lead: c.is_lead,
      score: Number(c.score),
      ki: c.ki,
      initiative: c.initiative,
      reward: c.reward,
      tenure: c.tenure,
      performance: c.performance,
      other: "",
      basis: c.basis,
      cstd: c.cstd,
    }))
    .sort((a, b) => {
      const orderA = teams.findIndex((t) => t.id === a.team);
      const orderB = teams.findIndex((t) => t.id === b.team);
      if (orderA !== orderB) return orderA - orderB;
      if (a.lead && !b.lead) return -1;
      if (!a.lead && b.lead) return 1;
      return b.score - a.score || a.id.localeCompare(b.id);
    });

  const election = {
    id: electionRes.data.id,
    year: electionRes.data.year,
    status: electionRes.data.status,
    version: electionRes.data.version,
    snapshot: {
      candidates,
      teams,
      warnings: [],
      conflicts: [],
      fetchedAt: new Date().toISOString(),
    },
    frozenAt: electionRes.data.created_at,
  };

  const ballot: Ballot = {
    id: ballotRes.data.id,
    voterId: ballotRes.data.voter_code,
    choices: ballotRes.data.choices || [],
    revision: ballotRes.data.revision || 0,
    version: ballotRes.data.version || 1,
    status: ballotRes.data.status || "submitted",
    submittedAt: ballotRes.data.submitted_at,
    updatedAt: ballotRes.data.updated_at,
  };

  return { code, ballot, election };
}

// 4. LẤY THÔNG TIN SESSION VOTER HIỆN TẠI
export async function getSupabaseMe(tokenHash: string): Promise<Me | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const sessionRes = await sb
    .from("sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!sessionRes.data || !sessionRes.data.voter_code) return null;

  const code = sessionRes.data.voter_code;
  const canEdit =
    !!sessionRes.data.can_edit_until &&
    new Date(sessionRes.data.can_edit_until) > new Date();

  const review = await reviewSupabaseCode(code).catch(() => null);
  if (!review) {
    // Nếu chưa có ballot
    return loginSupabaseVoter(code, tokenHash);
  }

  return {
    voterId: code,
    code,
    ballot: review.ballot,
    election: review.election,
    canEdit,
  };
}

// 5. MỞ KHÓA SỬA PHIẾU
export async function unlockSupabaseEdit(
  tokenHash: string,
  voterCode?: string,
  newTokenHash?: string,
): Promise<{ voterCode: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  let code = voterCode;

  if (!code && tokenHash) {
    const sessionRes = await sb
      .from("sessions")
      .select("voter_code")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    code = sessionRes.data?.voter_code;
  }

  if (!code) {
    throw new AppError("Không xác định được mã bí mật cần sửa.", 400);
  }

  const credRes = await sb
    .from("voter_credentials")
    .select("code, status")
    .eq("code", code)
    .single();

  if (credRes.error || !credRes.data) {
    throw new AppError("Mã bí mật không tồn tại trong hệ thống.", 404);
  }

  if (["Bị khóa", "Đã thu hồi"].includes(credRes.data.status)) {
    throw new AppError("Mã bí mật này đã bị khóa hoặc thu hồi.", 403);
  }

  const now = Date.now();
  const canEditUntil = new Date(now + 900000).toISOString(); // 15 phút
  const expiresAt = new Date(now + 3600000).toISOString(); // 1 giờ
  const hashToUse = newTokenHash || tokenHash;

  await Promise.all([
    sb.from("sessions").upsert({
      token_hash: hashToUse,
      role: "voter",
      voter_code: code,
      can_edit_until: canEditUntil,
      expires_at: expiresAt,
    }),
    sb
      .from("voter_credentials")
      .update({ status: "Được phép sửa", updated_at: new Date().toISOString() })
      .eq("code", code),
    sb
      .from("audit_logs")
      .insert({
        actor: code,
        event: "EDIT_UNLOCK",
        details: { message: "Mở quyền sửa phiếu thành công" },
      }),
  ]);

  return { voterCode: code };
}

// 6. NỘP PHIẾU VÀO SUPABASE
export async function submitSupabaseBallot(
  tokenHash: string,
  choices: string[],
  revision: number,
  idempotencyKey: string,
): Promise<Ballot | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const sessionRes = await sb
    .from("sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!sessionRes.data || !sessionRes.data.voter_code) {
    throw new Error("Phiên đăng nhập không hợp lệ.");
  }

  const voterCode = sessionRes.data.voter_code;
  const now = new Date().toISOString();

  // Kiểm tra phiếu cũ
  const oldRes = await sb
    .from("ballots")
    .select("*")
    .eq("voter_code", voterCode)
    .maybeSingle();

  const oldBallot = oldRes.data;
  if (oldBallot) {
    const canEdit =
      !!sessionRes.data.can_edit_until &&
      new Date(sessionRes.data.can_edit_until) > new Date();
    if (!canEdit) {
      throw new Error("Phiếu đã nộp. Bạn cần nhập mã xác nhận sửa để chỉnh sửa.");
    }
  }

  // Ghi ballot mới hoặc update
  let newBallotId = oldBallot?.id;
  const newRevision = Math.max((oldBallot?.revision || 0) + 1, revision + 1);

  if (oldBallot) {
    await sb
      .from("ballots")
      .update({
        choices,
        revision: newRevision,
        updated_at: now,
      })
      .eq("id", oldBallot.id);
  } else {
    const insertRes = await sb
      .from("ballots")
      .insert({
        election_id: "vcx-2026",
        voter_code: voterCode,
        choices,
        revision: 1,
        version: 1,
        status: "submitted",
        submitted_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertRes.error) throw new Error(insertRes.error.message);
    newBallotId = insertRes.data.id;
  }

  // Ghi revision history
  await sb.from("ballot_revisions").insert({
    ballot_id: newBallotId,
    revision: newRevision,
    choices,
    created_at: now,
  });

  // Ghi nhận idempotency request
  if (idempotencyKey) {
    await sb.from("idempotency_requests").upsert({
      voter_code: voterCode,
      idempotency_key: idempotencyKey,
      digest: String(newRevision),
      response_json: { ballotId: newBallotId, submittedAt: now },
    });
  }

  // Cập nhật trạng thái voter_credentials
  await sb
    .from("voter_credentials")
    .update({
      status: "Đã nộp phiếu",
      submitted_at: oldBallot ? oldBallot.submitted_at : now,
      updated_at: now,
    })
    .eq("code", voterCode);

  // Xóa quyền edit sau khi nộp
  await sb
    .from("sessions")
    .update({ can_edit_until: null })
    .eq("token_hash", tokenHash);

  return {
    id: newBallotId,
    voterId: voterCode,
    choices,
    revision: newRevision,
    version: 1,
    status: "submitted",
    submittedAt: oldBallot ? oldBallot.submitted_at : now,
    updatedAt: now,
  };
}

// 7. DASHBOARD TỔNG HỢP KẾT QUẢ TỪ SUPABASE VIEW
export async function getSupabaseDashboard(): Promise<Dashboard | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const [electionRes, teamsRes, resultsRes, cstdRes, ballotsRes, auditRes] =
    await Promise.all([
      sb.from("elections").select("*").eq("id", "vcx-2026").single(),
      sb.from("view_results_team").select("*"),
      sb.from("view_results_ldtt").select("*"),
      sb.from("cstd_status").select("*"),
      sb.from("ballots").select("*"),
      sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

  if (electionRes.error || !electionRes.data) return null;

  const teams: (Team & { votes: number })[] = (teamsRes.data || []).map((t) => ({
    id: t.id,
    label: t.label,
    order: t.order_index,
    size: t.size,
    quota: t.quota,
    lead: t.id === "QA" ? "Võ Hoàng Anh" : t.lead,
    votes: t.votes || 0,
  }));

  const results = (resultsRes.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    team: r.team,
    lead: r.id === "091579" ? true : r.lead,
    score: Number(r.score),
    ki: r.ki,
    initiative: r.initiative,
    reward: r.reward,
    tenure: r.tenure,
    performance: r.performance,
    other: "",
    basis: r.basis,
    cstd: r.cstd,
    votes: r.votes || 0,
    rate: Number(r.rate) || 0,
  }));

  const submitted = (ballotsRes.data || []).length;
  const totalChoices = teams.reduce((n, t) => n + t.votes, 0);

  const snapshot: Snapshot = {
    candidates: results,
    teams: teams.map((t) => ({
      id: t.id,
      label: t.label,
      order: t.order,
      size: t.size,
      quota: t.quota,
      lead: t.lead,
    })),
    warnings: [],
    conflicts: [],
    fetchedAt: new Date().toISOString(),
  };

  const election = {
    id: electionRes.data.id,
    year: electionRes.data.year,
    status: electionRes.data.status,
    version: electionRes.data.version,
    snapshot,
    frozenAt: electionRes.data.created_at,
  };

  const ballots: Ballot[] = (ballotsRes.data || []).map((b) => ({
    id: b.id,
    voterId: b.voter_code,
    choices: b.choices || [],
    revision: b.revision || 0,
    version: b.version || 1,
    status: b.status || "submitted",
    submittedAt: b.submitted_at,
    updatedAt: b.updated_at,
  }));

  const audit = (auditRes.data || []).map((a) => [
    a.created_at,
    a.actor,
    a.event,
    JSON.stringify(a.details || {}),
  ]);

  return {
    election,
    results,
    teams,
    submitted,
    totalChoices,
    updatedAt: new Date().toISOString(),
    cstd: (cstdRes.data || []).map((c) => ({ id: c.candidate_id, status: c.status })),
    audit,
    ballots,
  };
}

// 8. RESET DỮ LIỆU TRÊN SUPABASE
export async function resetSupabaseData(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  await Promise.all([
    sb.from("ballots").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    sb.from("ballot_revisions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    sb.from("sessions").delete().neq("token_hash", ""),
    sb.from("idempotency_requests").delete().neq("voter_code", ""),
    sb.from("voter_credentials").update({
      status: "Chưa sử dụng",
      submitted_at: null,
      updated_at: null,
    }).neq("code", ""),
    sb.from("elections").update({ status: "open", version: 1 }).eq("id", "vcx-2026"),
    sb.from("candidates").update({ is_lead: true }).eq("id", "091579"),
    sb.from("teams").update({ lead: "Võ Hoàng Anh" }).eq("id", "QA"),
  ]);

  await sb.from("audit_logs").insert({
    actor: "admin",
    event: "DATABASE_RESET",
    details: { message: "Reset database to initial clean state" },
  });

  return true;
}

// 9. XÁC THỰC LỰA CHỌN PHIẾU BÌNH CHỌN (VALIDATE)
export async function validateSupabaseBallot(
  tokenHash: string,
  choices: string[],
): Promise<{ ok: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Chưa cấu hình Supabase.");

  const sessionRes = await sb
    .from("sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!sessionRes.data || !sessionRes.data.voter_code) {
    throw new AppError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.", 401);
  }

  const [electionRes, teamsRes, candidatesRes] = await Promise.all([
    sb.from("elections").select("status").eq("id", "vcx-2026").single(),
    sb.from("teams").select("*").order("order_index", { ascending: true }),
    sb.from("candidates").select("*"),
  ]);

  if (electionRes.data?.status !== "open") {
    throw new AppError("Kỳ bình chọn đã đóng.", 409);
  }

  const teams: Team[] = (teamsRes.data || []).map((t) => ({
    id: t.id,
    label: t.label,
    order: t.order_index,
    size: t.size,
    quota: t.quota,
    lead: t.lead,
  }));

  const candidates: Candidate[] = (candidatesRes.data || [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team_id,
      lead: c.is_lead,
      score: Number(c.score),
      ki: c.ki,
      initiative: c.initiative,
      reward: c.reward,
      tenure: c.tenure,
      performance: c.performance,
      other: "",
      basis: c.basis,
      cstd: c.cstd,
    }))
    .sort((a, b) => {
      const orderA = teams.findIndex((t) => t.id === a.team);
      const orderB = teams.findIndex((t) => t.id === b.team);
      if (orderA !== orderB) return orderA - orderB;
      if (a.lead && !b.lead) return -1;
      if (!a.lead && b.lead) return 1;
      return b.score - a.score || a.id.localeCompare(b.id);
    });

  const snapshot: Snapshot = {
    candidates,
    teams,
    warnings: [],
    conflicts: [],
    fetchedAt: new Date().toISOString(),
  };

  validateChoices(snapshot, choices);

  return { ok: true };
}
