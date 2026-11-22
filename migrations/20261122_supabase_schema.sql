-- ==============================================================================
-- SUPABASE MIGRATION: VCX BÌNH CHỌN THI ĐUA KHEN THƯỞNG 2026
-- Supabase Project: https://kbmkxfkfhtgdgpqujcxv.supabase.co
-- Tự động khởi tạo toàn bộ bảng và dữ liệu từ Google Sheet / Excel
-- ==============================================================================

-- 1. KỲ BÌNH CHỌN (Elections)
CREATE TABLE IF NOT EXISTS public.elections (
    id TEXT PRIMARY KEY,
    year INT NOT NULL DEFAULT 2026,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    version INT NOT NULL DEFAULT 1,
    warnings JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. DANH SÁCH TEAM (Teams)
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    order_index INT NOT NULL,
    size INT NOT NULL,
    quota INT NOT NULL,
    lead TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. DANH SÁCH ỨNG VIÊN (Candidates)
CREATE TABLE IF NOT EXISTS public.candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    is_lead BOOLEAN NOT NULL DEFAULT false,
    score NUMERIC(6, 3) NOT NULL DEFAULT 0,
    ki TEXT NOT NULL DEFAULT '',
    initiative TEXT NOT NULL DEFAULT '',
    reward TEXT NOT NULL DEFAULT '',
    tenure TEXT NOT NULL DEFAULT '',
    performance TEXT NOT NULL DEFAULT '',
    basis TEXT NOT NULL DEFAULT '',
    cstd TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. MÃ BÌNH CHỌN BÍ MẬT - ẨN DANH 100% (Voter Credentials)
CREATE TABLE IF NOT EXISTS public.voter_credentials (
    code TEXT PRIMARY KEY CHECK (code ~ '^[0-9]{4}$'),
    status TEXT NOT NULL DEFAULT 'Chưa sử dụng' CHECK (status IN ('Chưa sử dụng', 'Đang thao tác', 'Đã nộp phiếu', 'Được phép sửa', 'Bị khóa', 'Đã thu hồi')),
    submitted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 5. PHIẾU BÌNH CHỌN (Ballots)
CREATE TABLE IF NOT EXISTS public.ballots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id TEXT NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
    voter_code TEXT NOT NULL UNIQUE REFERENCES public.voter_credentials(code) ON DELETE CASCADE,
    choices JSONB NOT NULL DEFAULT '[]'::jsonb,
    revision INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'submitted',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 6. LỊCH SỬ PHIÊN BẢN PHIẾU (Ballot Revisions)
CREATE TABLE IF NOT EXISTS public.ballot_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ballot_id UUID NOT NULL REFERENCES public.ballots(id) ON DELETE CASCADE,
    revision INT NOT NULL,
    choices JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 7. TRẠNG THÁI CSTĐ (CSTD Status)
CREATE TABLE IF NOT EXISTS public.cstd_status (
    candidate_id TEXT PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Chờ bỏ phiếu CSTĐ',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. NHẬT KÝ HỆ THỐNG (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT NOT NULL DEFAULT 'anonymous',
    event TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 9. PHIÊN LÀM VIỆC (Sessions)
CREATE TABLE IF NOT EXISTS public.sessions (
    token_hash TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('voter', 'admin')),
    voter_code TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    can_edit_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 10. IDEMPOTENCY REQUESTS
CREATE TABLE IF NOT EXISTS public.idempotency_requests (
    voter_code TEXT NOT NULL,
    idempotency_key UUID NOT NULL,
    digest TEXT NOT NULL,
    response_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (voter_code, idempotency_key)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_candidates_team ON public.candidates(team_id);
CREATE INDEX IF NOT EXISTS idx_ballots_election ON public.ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_ballot_revisions_ballot ON public.ballot_revisions(ballot_id);

-- VIEW TÍNH TOÁN KẾT QUẢ LĐTT TỨC THÌ (Siêu nhanh)
CREATE OR REPLACE VIEW public.view_results_ldtt AS
WITH vote_counts AS (
    SELECT 
        c_id.value::text AS candidate_id,
        COUNT(*)::INT AS votes
    FROM public.ballots b,
         jsonb_array_elements_text(b.choices) AS c_id
    GROUP BY c_id.value::text
),
total_ballots AS (
    SELECT COUNT(*)::NUMERIC AS total FROM public.ballots
)
SELECT 
    c.id,
    c.name,
    c.team_id AS team,
    c.is_lead AS lead,
    c.score,
    c.ki,
    c.initiative,
    c.reward,
    c.tenure,
    c.performance,
    c.basis,
    c.cstd,
    COALESCE(vc.votes, 0) AS votes,
    CASE 
        WHEN tb.total > 0 THEN ROUND(COALESCE(vc.votes, 0)::NUMERIC / tb.total, 4)
        ELSE 0 
    END AS rate,
    ARRAY(
        SELECT b.voter_code 
        FROM public.ballots b 
        WHERE b.choices ? c.id
        ORDER BY b.voter_code
    ) AS voter_codes
FROM public.candidates c
LEFT JOIN vote_counts vc ON c.id = vc.candidate_id
CROSS JOIN total_ballots tb
ORDER BY COALESCE(vc.votes, 0) DESC, c.score DESC, c.id ASC;

-- VIEW TỔNG HỢP THEO TEAM TỨC THÌ
CREATE OR REPLACE VIEW public.view_results_team AS
SELECT 
    t.id,
    t.label,
    t.order_index,
    t.size,
    t.quota,
    t.lead,
    COALESCE(SUM(r.votes), 0)::INT AS votes
FROM public.teams t
LEFT JOIN public.view_results_ldtt r ON t.id = r.team
GROUP BY t.id, t.label, t.order_index, t.size, t.quota, t.lead
ORDER BY t.order_index ASC;

-- BẬT ROW LEVEL SECURITY (RLS) VÀ CẤP QUYỀN TRUY CẬP
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voter_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballot_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cstd_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow sync write on teams" ON public.teams FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow sync write on candidates" ON public.candidates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow sync write on elections" ON public.elections FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow sync write on voter_credentials" ON public.voter_credentials FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read on elections" ON public.elections FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read on teams" ON public.teams FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read on candidates" ON public.candidates FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on voter_credentials" ON public.voter_credentials FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on ballots" ON public.ballots FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on ballot_revisions" ON public.ballot_revisions FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on cstd_status" ON public.cstd_status FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on audit_logs" ON public.audit_logs FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on sessions" ON public.sessions FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow service full on idempotency_requests" ON public.idempotency_requests FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SEED DATA: KỲ BÌNH CHỌN
INSERT INTO public.elections (id, year, status, version, warnings)
VALUES ('vcx-2026', 2026, 'open', 1, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE SET status = 'open', version = 1;

-- SEED DATA: 7 TEAMS
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('IPCC', 'I', 0, 13, 6, 'Lý Hoàng Quyền')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('Lite ERP+Số hóa', 'II', 1, 6, 3, 'Hoàng Anh Văn')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('AI', 'III', 2, 7, 3, 'Nguyễn Đình Thịnh')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('QA', 'IV', 3, 2, 1, 'Chưa xác định Lead')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('vCOC', 'V', 4, 3, 1, 'Nguyễn Văn Minh')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('KnowXHub', 'VI', 5, 4, 2, 'Nguyễn Thế Tùng')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;
INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES ('SP nội bộ', 'VII', 6, 5, 2, 'Lê Nguyên Huy')
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;

-- SEED DATA: 40 ỨNG VIÊN TỪ NGUỒN PTUD (2) & BÌNH XÉT
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('260775', 'Lý Hoàng Quyền', 'IPCC', true, 3.505, 'B', 'Có sáng kiến cơ sở / KHCN', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('477131', 'Nguyễn Thị Hoài Thương', 'IPCC', false, 3.896, 'A', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành xuất sắc NV', 'Đủ chuẩn CSTĐ cơ sở (Chờ bỏ phiếu >50%)', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('479414', 'Vũ Đình Duy', 'IPCC', false, 3.784, 'A', 'Không', 'Tháng 01/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('478345', 'Chung Minh Hòa', 'IPCC', false, 3.768, 'A', 'Không', 'Tháng 10/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('475873', 'Lò Hoàng Linh', 'IPCC', false, 3.53, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('464865', 'Lê Học Hoàng Anh', 'IPCC', false, 3.46, 'B', 'Có sáng kiến cơ sở / KHCN', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('475407', 'Ngô Đức Hùng', 'IPCC', false, 3.339, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('291129', 'Chu Văn Cầu', 'IPCC', false, 3.32, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('482198', 'Phạm Thị Như Quỳnh', 'IPCC', false, 3.262, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('476431', 'Trần Thanh Sơn', 'IPCC', false, 3.233, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('485708', 'Phạm Ngọc Thắng', 'IPCC', false, 3.193, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('477575', 'Nguyễn Mạnh Kiên', 'IPCC', false, 3.15, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('489686', 'Phan Trung Hiếu', 'IPCC', false, 3.15, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('260779', 'Hoàng Anh Văn', 'Lite ERP+Số hóa', true, 3.627, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('479452', 'Nguyễn Thị Thu Trang', 'Lite ERP+Số hóa', false, 4.105, 'A', 'Có sáng kiến cơ sở / KHCN', 'Tháng 08/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành xuất sắc NV', 'Đủ chuẩn CSTĐ cơ sở (Chờ bỏ phiếu >50%)', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('478807', 'Phạm Tuyết Mai', 'Lite ERP+Số hóa', false, 3.929, 'A', 'Không', 'Tháng 06/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('477363', 'Hà Thị Lương Hoài', 'Lite ERP+Số hóa', false, 3.76, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('491280', 'Nguyễn Tiến Đạt', 'Lite ERP+Số hóa', false, 3.59, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('490980', 'Nguyễn Thị Thùy Anh', 'Lite ERP+Số hóa', false, 3.195, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('275305', 'Nguyễn Đình Thịnh', 'AI', true, 3.605, 'B', 'Có sáng kiến cơ sở / KHCN', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('478275', 'Bùi Ngọc Huy', 'AI', false, 3.93, 'A', 'Có sáng kiến cơ sở / KHCN', '', 'Đạt (>=6 tháng)', 'Hoàn thành xuất sắc NV', 'Đủ chuẩn CSTĐ cơ sở (Chờ bỏ phiếu >50%)', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('452107', 'Đặng Thị Phương Tú', 'AI', false, 3.624, 'B', 'Có sáng kiến cơ sở / KHCN', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('246743', 'Bùi Văn Tài', 'AI', false, 3.585, 'A', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('481680', 'Nguyễn Trường Giang', 'AI', false, 3.506, 'A', 'Không', 'Tháng 02/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('489684', 'Nguyễn Thành Lập', 'AI', false, 3.045, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('460693', 'Đào Mai Trang', 'AI', false, 3.025, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('477275', 'Đặng Thị Thắm', 'QA', false, 3.859, 'A', 'Không', 'Tháng 05/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành xuất sắc NV', 'Đủ chuẩn CSTĐ cơ sở (Chờ bỏ phiếu >50%)', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('091579', 'Võ Hoàng Anh', 'QA', false, 3.684, 'B', 'Có sáng kiến cơ sở / KHCN', 'Giải nhất Tập đoàn cuộc thi "AI kể truyện lịch sử"
Giải 3 Tập đoàn cuộc thi "Sóng Tri thức"', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('484800', 'Nguyễn Văn Minh', 'vCOC', true, 3.842, 'A', 'Không', 'Tháng 04/2026 - Khen thưởng cá nhân Hoàn thành XSNV SXKD', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('480816', 'Vũ Hoàng Anh', 'vCOC', false, 3.592, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('451551', 'Trần Thị Hương', 'vCOC', false, 3.591, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('477127', 'Nguyễn Thế Tùng', 'KnowXHub', true, 3.825, 'A', 'Có sáng kiến cơ sở / KHCN', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn CSTĐ cơ sở (Chờ bỏ phiếu >50%)', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('477137', 'Lưu Thị Hiền', 'KnowXHub', false, 3.69, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('484330', 'Hoàng Trọng Nho', 'KnowXHub', false, 3.512, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('484120', 'Nguyễn Thành Long', 'KnowXHub', false, 3.47, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('010833', 'Lê Nguyên Huy', 'SP nội bộ', true, 3.645, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('067159', 'Trần Thanh Nhã', 'SP nội bộ', false, 3.783, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('106836', 'Vũ Ngọc Bảo', 'SP nội bộ', false, 3.769, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('008973', 'Trần Đức Trọng', 'SP nội bộ', false, 3.712, 'A', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;
INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES ('082495', 'Nguyễn Văn Long', 'SP nội bộ', false, 3.61, 'B', 'Không', '', 'Đạt (>=6 tháng)', 'Hoàn thành tốt NV', 'Đủ chuẩn LĐTT', 'Chưa bỏ phiếu')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;

-- SEED DATA: TRẠNG THÁI CSTĐ BAN ĐẦU
INSERT INTO public.cstd_status (candidate_id, status)
VALUES ('477131', 'Chờ bỏ phiếu CSTĐ')
ON CONFLICT (candidate_id) DO NOTHING;
INSERT INTO public.cstd_status (candidate_id, status)
VALUES ('479452', 'Chờ bỏ phiếu CSTĐ')
ON CONFLICT (candidate_id) DO NOTHING;
INSERT INTO public.cstd_status (candidate_id, status)
VALUES ('478275', 'Chờ bỏ phiếu CSTĐ')
ON CONFLICT (candidate_id) DO NOTHING;
INSERT INTO public.cstd_status (candidate_id, status)
VALUES ('477275', 'Chờ bỏ phiếu CSTĐ')
ON CONFLICT (candidate_id) DO NOTHING;
INSERT INTO public.cstd_status (candidate_id, status)
VALUES ('477127', 'Chờ bỏ phiếu CSTĐ')
ON CONFLICT (candidate_id) DO NOTHING;

-- SEED DATA: 40 MÃ BÌNH CHỌN BÍ MẬT (KHÔNG CHỨA THÔNG TIN NHÂN SỰ)
INSERT INTO public.voter_credentials (code, status)
VALUES ('1024', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('1408', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('1982', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('2048', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('2159', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('2301', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('2589', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('2793', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('3104', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('3456', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('3891', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('4096', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('4218', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('4520', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('4862', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('5120', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('5381', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('5647', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('5932', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('6145', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('6480', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('6723', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('7029', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('7184', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('7390', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('7621', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('7845', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('8092', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('8234', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('8461', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('8715', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('8950', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9021', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9183', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9345', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9512', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9684', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9750', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9826', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.voter_credentials (code, status)
VALUES ('9914', 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;

-- HOÀN THÀNH SETUP SUPABASE
INSERT INTO public.audit_logs (actor, event, details)
VALUES ('system', 'DATABASE_INITIALIZED', '{"message": "Supabase database initialized with 40 candidates and 7 teams"}'::jsonb);
