import { z } from "zod";
export type Candidate = {
  id: string;
  name: string;
  team: string;
  lead: boolean;
  score: number;
  ki: string;
  initiative: string;
  reward: string;
  tenure: string;
  performance: string;
  other: string;
  basis: string;
  cstd: string;
};
export type Team = {
  id: string;
  order: number;
  label: string;
  size: number;
  quota: number;
  lead: string;
};
export type Snapshot = {
  candidates: Candidate[];
  teams: Team[];
  warnings: string[];
  conflicts: string[];
  fetchedAt: string;
};
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const ballotInput = z.object({
  choices: z.array(z.string().min(1)).max(10000),
  revision: z.number().int().nonnegative(),
  idempotencyKey: z.uuid(),
});
export function validateChoices(snapshot: Snapshot, choices: string[]) {
  if (new Set(choices).size !== choices.length)
    throw new AppError("Danh sách có ứng viên trùng lặp.");
  const byId = new Map(snapshot.candidates.map((c) => [c.id, c]));
  for (const id of choices)
    if (!byId.has(id))
      throw new AppError("Ứng viên không thuộc phiên dữ liệu đã chốt.");
  for (const team of snapshot.teams) {
    const count = choices.filter((id) => byId.get(id)?.team === team.id).length;
    if (count !== team.quota)
      throw new AppError(
        `Team ${team.id}: đã chọn ${count}/${team.quota} người.`,
      );
  }
  return true;
}
export function canToggle(team: Team, count: number, selected: boolean) {
  return selected || count < team.quota;
}
export function cstdStatus(basis: string) {
  if (/Đủ chuẩn CSTĐ/i.test(basis)) return "Chờ bỏ phiếu CSTĐ";
  if (/Không xét|không đủ/i.test(basis)) return "Chưa đủ điều kiện";
  return "Cần xác minh";
}
export function summarize(
  snapshot: Snapshot,
  ballots: { choices: string[] }[],
) {
  const counts = new Map<string, number>();
  for (const b of ballots)
    for (const id of b.choices) counts.set(id, (counts.get(id) ?? 0) + 1);
  const results = snapshot.candidates
    .map((c) => ({
      ...c,
      votes: counts.get(c.id) ?? 0,
      rate: ballots.length ? (counts.get(c.id) ?? 0) / ballots.length : 0,
    }))
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        b.rate - a.rate ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    );
  const teams = snapshot.teams.map((t) => ({
    ...t,
    votes: results
      .filter((c) => c.team === t.id)
      .reduce((n, c) => n + c.votes, 0),
  }));
  return {
    results,
    teams,
    submitted: ballots.length,
    totalChoices: results.reduce((n, c) => n + c.votes, 0),
  };
}
