import type { Snapshot, Candidate, Team } from "./domain";
export type Election = {
  id: string;
  year: number;
  status: "open" | "closed";
  version: number;
  snapshot: Snapshot;
  frozenAt: string;
};
export type Ballot = {
  id: string;
  voterId: string; // Mã bình chọn 4 số bí mật
  choices: string[];
  revision: number;
  version: number;
  submittedAt: string;
  updatedAt: string;
  status: string;
};
export type Me = {
  voterId: string;
  code: string;
  ballot: Ballot | null;
  election: Election;
  canEdit?: boolean;
};
export type Result = Candidate & { votes: number; rate: number };
export type Dashboard = {
  election: Election | null;
  source?: Snapshot;
  results: Result[];
  teams: (Team & { votes: number })[];
  submitted: number;
  totalChoices: number;
  updatedAt: string;
  cstd: { id: string; status: string }[];
  audit: string[][];
  ballots?: Ballot[];
  credentials?: { code: string; status?: string }[];
};
export type Progress = {
  ready: boolean;
  status: string;
  total: number;
  submitted: number;
  quota: number;
};
export type ReviewResult = {
  code: string;
  ballot: Ballot;
  election: Election;
};
