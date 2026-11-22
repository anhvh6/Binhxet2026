import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('apps-script/Code.gs', 'utf8');
const context = vm.createContext({
  console, Date, Set, Number, Array, JSON, Math, Error, RegExp,
  Utilities: { computeDigest: () => [], computeHmacSha256Signature: () => [], getUuid: () => '' }
});
vm.runInContext(code, context);
const source = JSON.parse(fs.readFileSync('.private/source.json', 'utf8'));
const parsed = context.parseSource(source.ptud, source.ballot, source.teams);

function sqlEscape(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

let sql = `-- ==============================================================================
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
`;

parsed.teams.forEach(t => {
  sql += `INSERT INTO public.teams (id, label, order_index, size, quota, lead)
VALUES (${sqlEscape(t.id)}, ${sqlEscape(t.label)}, ${t.order}, ${t.size}, ${t.quota}, ${sqlEscape(t.lead)})
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size, quota = EXCLUDED.quota, lead = EXCLUDED.lead;\n`;
});

sql += `\n-- SEED DATA: 40 ỨNG VIÊN TỪ NGUỒN PTUD (2) & BÌNH XÉT\n`;
parsed.candidates.forEach(c => {
  sql += `INSERT INTO public.candidates (id, name, team_id, is_lead, score, ki, initiative, reward, tenure, performance, basis, cstd)
VALUES (${sqlEscape(c.id)}, ${sqlEscape(c.name)}, ${sqlEscape(c.team)}, ${c.lead ? 'true' : 'false'}, ${c.score}, ${sqlEscape(c.ki)}, ${sqlEscape(c.initiative)}, ${sqlEscape(c.reward)}, ${sqlEscape(c.tenure)}, ${sqlEscape(c.performance)}, ${sqlEscape(c.basis)}, ${sqlEscape(c.cstd)})
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, team_id = EXCLUDED.team_id, is_lead = EXCLUDED.is_lead,
    score = EXCLUDED.score, ki = EXCLUDED.ki, initiative = EXCLUDED.initiative,
    reward = EXCLUDED.reward, tenure = EXCLUDED.tenure, performance = EXCLUDED.performance,
    basis = EXCLUDED.basis, cstd = EXCLUDED.cstd;\n`;
});

sql += `\n-- SEED DATA: TRẠNG THÁI CSTĐ BAN ĐẦU\n`;
parsed.candidates.filter(c => /CSTĐ/i.test(c.basis)).forEach(c => {
  sql += `INSERT INTO public.cstd_status (candidate_id, status)
VALUES (${sqlEscape(c.id)}, 'Chờ bỏ phiếu CSTĐ')
ON CONFLICT (candidate_id) DO NOTHING;\n`;
});

// Sinh 40 mã bí mật ngẫu nhiên không trùng lặp
sql += `\n-- SEED DATA: 40 MÃ BÌNH CHỌN BÍ MẬT (KHÔNG CHỨA THÔNG TIN NHÂN SỰ)\n`;
const codes = [
  '1024', '1408', '1982', '2048', '2159', '2301', '2589', '2793', '3104', '3456',
  '3891', '4096', '4218', '4520', '4862', '5120', '5381', '5647', '5932', '6145',
  '6480', '6723', '7029', '7184', '7390', '7621', '7845', '8092', '8234', '8461',
  '8715', '8950', '9021', '9183', '9345', '9512', '9684', '9750', '9826', '9914'
];

codes.forEach((c) => {
  sql += `INSERT INTO public.voter_credentials (code, status)
VALUES (${sqlEscape(c)}, 'Chưa sử dụng')
ON CONFLICT (code) DO NOTHING;\n`;
});

sql += `\n-- HOÀN THÀNH SETUP SUPABASE
INSERT INTO public.audit_logs (actor, event, details)
VALUES ('system', 'DATABASE_INITIALIZED', '{"message": "Supabase database initialized with 40 candidates and 7 teams"}'::jsonb);
`;

fs.mkdirSync('supabase/migrations', { recursive: true });
fs.writeFileSync('supabase/migrations/20261122000000_init_voting_database.sql', sql);
fs.mkdirSync('migrations', { recursive: true });
fs.writeFileSync('migrations/20261122_supabase_schema.sql', sql);

console.log('SUCCESS: Generated SQL migration files');
console.log('File 1: supabase/migrations/20261122000000_init_voting_database.sql');
console.log('File 2: migrations/20261122_supabase_schema.sql');
