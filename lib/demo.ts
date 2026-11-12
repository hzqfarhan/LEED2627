// In-memory sample data, used only when DATABASE_URL is not set, so the app can be
// opened and clicked through before the database exists. Nothing here is saved:
// it resets whenever the server restarts. Mirrors db/seed.sql.

import { AWARDS, JUDGE_PANEL, JUDGING_UNIT, SCALE_MAX, SCALE_MIN, pendingEmail, type CriterionDef } from './awards';
import type { Competition, Memory, Stall, StallColour, Submission } from './shared';

export interface DemoUser {
  id: number;
  name: string;
  email: string;
  pin: string;
  role: 'admin' | 'judge';
  isActive: boolean;
}

export interface DemoStore {
  users: DemoUser[];
  stalls: Stall[];
  competitions: Competition[];
  assignments: { judgeId: number; competitionId: number }[];
  submissions: Submission[];
  memories: Memory[];
  /** stall number -> team PIN */
  stallPins: Record<string, string>;
  /** stall number -> voter id -> liked */
  votes: Record<string, Record<string, boolean>>;
  resultsPublished: boolean;
  votingOpen: boolean;
  nextId: number;
}

/** In demo mode every stall team signs in with this PIN. */
export const DEMO_STALL_LOGIN = { stall: 7, pin: '123456' };

export const DEMO_LOGINS = [
  { label: 'Admin', email: 'admin@leed26.local', pin: 'change-me-26' },
  { label: 'Judge', email: 'judge1@leed26.local', pin: '111111' },
];

const COLOURS: StallColour[] = ['pink', 'blue', 'green', 'yellow', 'red'];

function criteria(competitionId: number, firstId: number, rows: CriterionDef[]) {
  return rows.map((k, i) => ({
    id: firstId + i,
    competitionId,
    position: i + 1,
    name: k.name,
    description: k.description,
    weight: k.marks / SCALE_MAX,
    levels: [...k.levels],
  }));
}

function build(): DemoStore {
  let nextCriterion = 1;
  const competitions: Competition[] = AWARDS.map((award, i) => {
    const id = i + 1;
    const list = criteria(id, nextCriterion, award.criteria);
    nextCriterion += list.length;
    return {
      id,
      slug: award.slug,
      name: award.name,
      description: award.description,
      isOpen: true,
      opensAt: null,
      closesAt: null,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
      criteria: list,
    };
  });

  const stalls: Stall[] = Array.from({ length: 40 }, (_, i) => {
    const n = i + 1;
    return {
      id: n,
      number: n,
      name: `Stall ${String(n).padStart(2, '0')}`,
      groupName: null,
      cluster: null,
      colour: COLOURS[Math.floor(i / 8)],
      description: null,
      instagram: null,
      pitchUrl: null,
      promoUrls: [],
      hasPin: true,
    };
  });

  const users: DemoUser[] = [
    { id: 1, name: 'LEED 26 Admin', email: 'admin@leed26.local', pin: 'change-me-26', role: 'admin', isActive: true },
    { id: 2, name: 'Sample Judge 1', email: 'judge1@leed26.local', pin: '111111', role: 'judge', isActive: true },
    { id: 3, name: 'Sample Judge 2', email: 'judge2@leed26.local', pin: '222222', role: 'judge', isActive: true },
    { id: 4, name: 'Sample Judge 3', email: 'judge3@leed26.local', pin: '333333', role: 'judge', isActive: true },
    ...JUDGE_PANEL.map((name, i) => ({ id: 10 + i, name, email: pendingEmail('juri', i + 1), pin: '', role: 'judge' as const, isActive: false })),
    ...JUDGING_UNIT.map((name, i) => ({ id: 50 + i, name, email: pendingEmail('penjurian', i + 1), pin: '', role: 'admin' as const, isActive: false })),
  ];

  const assignments = users
    .filter((u) => u.role === 'judge' && u.isActive)
    .flatMap((u) => competitions.map((c) => ({ judgeId: u.id, competitionId: c.id })));

  // A few sample score sheets from judges 2 and 3, so the leaderboard has something to show.
  const submissions: Submission[] = [];
  const stamp = new Date().toISOString();
  for (const judgeId of [3, 4]) {
    for (const comp of competitions) {
      for (let n = 1; n <= 14; n++) {
        const scores: Record<string, number> = {};
        for (const k of comp.criteria) scores[String(k.id)] = 2 + ((n * 7 + k.id * 3 + judgeId * 5) % 4);
        submissions.push({ judgeId, competitionId: comp.id, stallNumber: n, comment: null, updatedAt: stamp, scores });
      }
    }
  }

  const captions = [
    'Setting up before sunrise',
    'First sale of the day',
    'The queue that never ended',
    'Sold out by noon',
    'Team photo, finally',
    'Rain did not stop us',
    'Judges at our stall',
    'Lucky draw time',
    'Our banner survived the wind',
    'Free samples, gone in minutes',
    'Counting the takings',
    'Packing up. See you next year',
  ];
  const memories: Memory[] = captions.map((caption, i) => ({
    id: i + 1,
    kind: 'note',
    url: null,
    caption,
    author: 'LEED committee',
    year: 2025,
    likes: (i * 5) % 9,
    status: 'approved',
    createdAt: stamp,
  }));

  // A few sample Customer Choice votes.
  const votes: Record<string, Record<string, boolean>> = {};
  for (let n = 1; n <= 12; n++) {
    votes[String(n)] = {};
    for (let v = 0; v < (n * 7) % 11; v++) votes[String(n)][`demo-${v}`] = v % 4 !== 3;
  }

  const stallPins: Record<string, string> = {};
  for (const s of stalls) stallPins[String(s.number)] = DEMO_STALL_LOGIN.pin;

  return { users, stalls, competitions, assignments, submissions, memories, stallPins, votes, resultsPublished: false, votingOpen: true, nextId: 100 };
}

const g = globalThis as unknown as { __leedDemo?: DemoStore };

export function demo(): DemoStore {
  if (!g.__leedDemo) g.__leedDemo = build();
  return g.__leedDemo;
}
