// In-memory sample data, used only when DATABASE_URL is not set, so the app can be
// opened and clicked through before the database exists. Nothing here is saved:
// it resets whenever the server restarts. Mirrors db/seed.sql.

import { AWARDS, JUDGE_PANEL, JUDGING_UNIT, SCALE_MAX, SCALE_MIN, pendingEmail, type CriterionDef } from './awards';
import type { Announcement, Competition, LogEntry, Memory, PayerDetails, PaymentStatus, RefundStatus, Stall, StallColour, StallDetails, Submission } from './shared';

export interface DemoUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'judge' | 'customer';
  isActive: boolean;
  picture?: string | null;
  staffId?: string | null;
  lastLoginAt?: string | null;
  nickname?: string | null;
}

export interface DemoStore {
  users: DemoUser[];
  stalls: Stall[];
  competitions: Competition[];
  assignments: { judgeId: number; competitionId: number }[];
  submissions: Submission[];
  memories: Memory[];
  /** email -> stall team membership */
  members: Record<string, { stall: number; isLeader: boolean; addedBy: string | null; addedAt?: string }>;
  /** stall number -> poster image */
  posters: Record<string, { data: Buffer; type: string; updatedAt: string }>;
  /** stall number -> company logo */
  logos: Record<string, { data: Buffer; type: string; updatedAt: string }>;
  announcements: Announcement[];
  /** judge id -> competition id -> stall numbers the judge must judge */
  judgeStalls: Record<string, Record<string, number[]>>;
  log: LogEntry[];
  /** stall number -> voter id -> liked */
  votes: Record<string, Record<string, boolean>>;
  /** stall number -> voter id -> criterion id -> stars (1 to 5) */
  ratings: Record<string, Record<string, Record<string, number>>>;
  /** stall number -> social media counts for the viral video award */
  viral: Record<string, { likes: number; shares: number; url: string | null }>;
  /** stall number -> registration details */
  details: Record<string, StallDetails>;
  /** "<stall>:<kind>" -> payment with its files */
  payments: Record<string, DemoPayment>;
  notifications: { id: number; email: string | null; audience: 'everyone' | 'sellers' | 'judges' | null; kind: string; title: string; body: string | null; link: string | null; createdAt: string }[];
  /** email -> when they last opened the bell */
  notifSeen: Record<string, string>;
  /** Small app settings (Google Drive connection), like the settings table. */
  kv: Record<string, string>;
  resultsPublished: boolean;
  votingOpen: boolean;
  nextId: number;
}

export interface DemoFile {
  data: Buffer | null;
  type: string;
  name: string | null;
  drive?: { id: string; url: string } | null;
}

export interface DemoPayment {
  id: number;
  stall: number;
  kind: 'deposit' | 'rental';
  amountSen: number;
  paidOn: string | null;
  receipt: DemoFile;
  statement: DemoFile | null;
  payer: Partial<PayerDetails>;
  status: PaymentStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  refundStatus: RefundStatus | null;
  submittedBy: string;
  submittedAt: string;
}

/**
 * Demo sign-in, only offered when there is no database (nothing is real or saved).
 * One sample person per role so every page can be tried without UTHM SSO.
 */
export const DEMO_PERSONAS = [
  { id: 'customer', label: 'Customer', who: 'A student visitor', email: 'ai240123@student.uthm.edu.my' },
  { id: 'seller', label: 'Seller', who: 'Team leader of stall 7', email: 'ai230007@student.uthm.edu.my' },
  { id: 'judge', label: 'Jury', who: 'A judge with allocated stalls', email: 'judge1.demo@uthm.edu.my' },
  { id: 'admin', label: 'Admin', who: 'The carnival committee', email: 'admin.demo@uthm.edu.my' },
] as const;

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
      ssmNumber: null,
      category: null,
      posterVersion: null,
      logoVersion: null,
    };
  });

  const users: DemoUser[] = [
    { id: 1, name: 'Demo Committee Admin', email: 'admin.demo@uthm.edu.my', role: 'admin', isActive: true },
    { id: 2, name: 'Dr Demo Judge', email: 'judge1.demo@uthm.edu.my', role: 'judge', isActive: true },
    { id: 3, name: 'Dr Sample Judge Two', email: 'judge2.demo@uthm.edu.my', role: 'judge', isActive: true },
    { id: 4, name: 'Dr Sample Judge Three', email: 'judge3.demo@uthm.edu.my', role: 'judge', isActive: true },
    { id: 5, name: 'Aina Sofea', email: 'ai230007@student.uthm.edu.my', role: 'customer', isActive: true },
    { id: 6, name: 'Hakim Firdaus', email: 'ai230011@student.uthm.edu.my', role: 'customer', isActive: true },
    { id: 7, name: 'Nur Iman', email: 'ai240123@student.uthm.edu.my', role: 'customer', isActive: true },
    ...JUDGE_PANEL.map((name, i) => ({ id: 10 + i, name, email: pendingEmail('juri', i + 1), role: 'judge' as const, isActive: false })),
    ...JUDGING_UNIT.map((name, i) => ({ id: 50 + i, name, email: pendingEmail('penjurian', i + 1), role: 'admin' as const, isActive: false })),
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

  // Sample customer ratings of the stall elements, and viral video counts.
  const ratings: Record<string, Record<string, Record<string, number>>> = {};
  const stallComp = competitions.find((c) => c.slug === 'stall');
  if (stallComp) {
    for (let n = 1; n <= 14; n++) {
      ratings[String(n)] = {};
      for (let v = 0; v < 3 + ((n * 5) % 6); v++) {
        const r: Record<string, number> = {};
        for (const k of stallComp.criteria) r[String(k.id)] = 1 + ((n * 3 + k.id + v * 2) % 5);
        ratings[String(n)][`demo-${v}`] = r;
      }
    }
  }
  const viral: Record<string, { likes: number; shares: number; url: string | null }> = {};
  for (let n = 1; n <= 8; n++) viral[String(n)] = { likes: (n * 97) % 420, shares: (n * 31) % 90, url: null };

  // Stall 7's team: a leader who has signed in, a member who has, and one invited who has not.
  const members: DemoStore['members'] = {
    'ai230007@student.uthm.edu.my': { stall: 7, isLeader: true, addedBy: 'admin.demo@uthm.edu.my', addedAt: stamp },
    'ai230011@student.uthm.edu.my': { stall: 7, isLeader: false, addedBy: 'ai230007@student.uthm.edu.my', addedAt: stamp },
    'ai230015@student.uthm.edu.my': { stall: 7, isLeader: false, addedBy: 'ai230007@student.uthm.edu.my', addedAt: stamp },
  };
  const s7 = stalls.find((s) => s.number === 7);
  if (s7) Object.assign(s7, { name: 'Waffle Works', groupName: 'Kumpulan 3, BIT21603', cluster: 'food', category: 'desserts', description: 'Bubble waffles with local fillings: pandan kaya, gula melaka and durian.', pitchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

  const announcements: Announcement[] = [
    { id: 1, title: 'Stall set-up starts 8:00 am', body: 'Teams may enter the FSKTM parking lot from 8:00 am on 9 December. Bring your own extension cords.', audience: 'sellers', pinned: true, createdAt: stamp },
    { id: 2, title: 'Rate the stalls you visit', body: 'Sign in with UTHM SSO on any stall page to like it and rate it with stars. Your stars count for half of every stall award.', audience: 'everyone', pinned: false, createdAt: stamp },
  ];

  // Judge 2 (the demo jury persona) judges stalls 1 to 10 at the stall competition.
  const judgeStalls: DemoStore['judgeStalls'] = stallComp ? { '2': { [String(stallComp.id)]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } } : {};

  return {
    users,
    stalls,
    competitions,
    assignments,
    submissions,
    memories,
    members,
    posters: {},
    logos: {},
    announcements,
    judgeStalls,
    log: [],
    votes,
    ratings,
    viral,
    details: {},
    payments: {},
    notifications: [],
    notifSeen: {},
    kv: {},
    resultsPublished: false,
    votingOpen: true,
    nextId: 100,
  };
}

const g = globalThis as unknown as { __leedDemo?: DemoStore };

export function demo(): DemoStore {
  if (!g.__leedDemo) g.__leedDemo = build();
  return g.__leedDemo;
}
