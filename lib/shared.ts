// Types and small helpers shared by server and browser code. No server-only imports here.

/** 'stall' is a stall team signed in with their stall number and team PIN. */
/**
 * What a signed-in person mainly does on the site. Everyone with a UTHM account is at least a
 * customer; a customer who belongs to a stall team is a seller; judges and admins are set by the committee.
 */
export type Role = 'admin' | 'judge' | 'seller' | 'customer';
export type StallColour = 'pink' | 'blue' | 'green' | 'yellow' | 'red';
export const STALL_COLOURS: StallColour[] = ['pink', 'blue', 'green', 'yellow', 'red'];

/** Canopy colours, used by the 2D plan, the 3D scene and the stall chips. */
export const CANOPY: Record<StallColour | 'none', { fill: string; ink: string; label: string }> = {
  pink: { fill: '#F27BAE', ink: '#3A0A20', label: 'Pink' },
  blue: { fill: '#3F86E6', ink: '#06203F', label: 'Blue' },
  green: { fill: '#35A772', ink: '#052616', label: 'Green' },
  yellow: { fill: '#F5C21B', ink: '#3A2C00', label: 'Yellow' },
  red: { fill: '#E2493F', ink: '#3A0705', label: 'Red' },
  none: { fill: '#F4F5F6', ink: '#23262B', label: 'Not set' },
};

export interface Stall {
  id: number;
  number: number;
  name: string;
  groupName: string | null;
  cluster: string | null;
  colour: StallColour | null;
  description: string | null;
  instagram: string | null;
  /** Business pitch video link, added by the stall team. */
  pitchUrl: string | null;
  /** Up to three promotional video links. */
  promoUrls: string[];
  /** SSM business registration number, if the team has one. */
  ssmNumber: string | null;
  /** Food category id, see FOOD_CATEGORIES in lib/event.ts. */
  category: string | null;
  /** Changes whenever a new poster is uploaded (use it to bust caches); null when there is no poster. */
  posterVersion: string | null;
  /** Same for the optional company logo. */
  logoVersion: string | null;
}

/** Someone on a stall team. Email is shown only to the team and the committee. */
export interface StallMember {
  email: string;
  name: string | null;
  isLeader: boolean;
  /** Profile photo candidates, best first (UTHM Community, then Google). */
  photos: string[];
  /** False until they have signed in once. */
  joined: boolean;
  /** When the leader or committee added them (ISO), if known. */
  addedAt: string | null;
  /** Their latest UTHM SSO sign-in (ISO), if any. */
  lastSeen: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  audience: 'everyone' | 'sellers' | 'judges';
  pinned: boolean;
  createdAt: string;
}

export interface Criterion {
  id: number;
  competitionId: number;
  position: number;
  name: string;
  description: string | null;
  /** Marks per level step: full marks = weight × the competition's top level. */
  weight: number;
  /** What each level means, lowest first (index 0 = level 0). Null when the rubric has none. */
  levels: string[] | null;
}

export interface Competition {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  scaleMin: number;
  scaleMax: number;
  criteria: Criterion[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'judge' | 'customer';
  isActive: boolean;
}

export interface Person extends User {
  assigned: number[];
  /** competitionId -> number of stalls scored */
  scored: Record<string, number>;
}

export interface Submission {
  judgeId: number;
  competitionId: number;
  stallNumber: number;
  comment: string | null;
  updatedAt: string;
  /** criterionId -> score */
  scores: Record<string, number>;
}

export interface LeaderboardRow {
  stallNumber: number;
  stallName: string;
  colour: StallColour | null;
  judges: number;
  average: number;
  rank: number;
  /** criterionId -> average score */
  criteria: Record<string, number>;
}

export type MemoryKind = 'image' | 'video' | 'youtube' | 'note';
export type MemoryStatus = 'approved' | 'pending' | 'hidden';

/** A stall award worked out from the Stall Competition: half jury marks, half customer ratings. */
export interface StallAwardRow {
  stallNumber: number;
  stallName: string;
  colour: StallColour | null;
  /** Average jury marks for the award's elements. */
  jury: number;
  /** Customer marks: average stars / 5 x the elements' marks. */
  customer: number;
  total: number;
  judges: number;
  raters: number;
  rank: number;
}

export interface StallAwardBoard {
  slug: string;
  name: string;
  element: string;
  juryMarks: number;
  customerMarks: number;
  rows: StallAwardRow[];
}

/** An element visitors rate with 1 to 5 stars. */
export interface RatingCriterion {
  id: number;
  name: string;
  question: string;
  marks: number;
}

/** Social media counts for the Most Popular & Viral Video Marketing award. */
export interface ViralRow {
  stallNumber: number;
  stallName: string;
  colour: StallColour | null;
  likes: number;
  shares: number;
  total: number;
  url: string | null;
  rank: number;
}

/** People Choice votes for one stall. */
export interface VoteTally {
  stallNumber: number;
  stallName: string;
  colour: StallColour | null;
  likes: number;
  dislikes: number;
  rank: number;
}

export interface Memory {
  id: number;
  kind: MemoryKind;
  url: string | null;
  caption: string;
  author: string | null;
  year: number | null;
  likes: number;
  status: MemoryStatus;
  createdAt: string;
}

export interface ScorePayload {
  /** Who filled in the sheet, so a shared phone can never send it under another judge's name. */
  judgeId?: number;
  competitionId: number;
  stallNumber: number;
  scores: Record<string, number>;
  comment: string;
}

/** A competition takes scores when it is switched on and inside its window (if it has one). */
export function isAccepting(c: Competition, now: Date = new Date()): boolean {
  if (!c.isOpen) return false;
  if (c.opensAt && now < new Date(c.opensAt)) return false;
  if (c.closesAt && now > new Date(c.closesAt)) return false;
  return true;
}

export function maxTotal(c: Competition): number {
  return c.criteria.reduce((sum, k) => sum + k.weight * c.scaleMax, 0);
}

/** Full marks for one criterion (e.g. 4 for a 4-mark criterion on a 0 to 5 scale). */
export function criterionMarks(c: Competition, criterionWeight: number): number {
  return Math.round(criterionWeight * c.scaleMax * 100) / 100;
}

/** Marks earned at a level, rounded to 2 decimals (level 4 of a 4-mark criterion = 3.2). */
export function marksFor(_c: Competition, criterionWeight: number, level: number): number {
  return Math.round(criterionWeight * level * 100) / 100;
}

export function totalOf(c: Competition, scores: Record<string, number>): number {
  return c.criteria.reduce((sum, k) => sum + (scores[String(k.id)] ?? 0) * k.weight, 0);
}

export function isComplete(c: Competition, scores: Record<string, number>): boolean {
  return c.criteria.every((k) => {
    const v = scores[String(k.id)];
    return Number.isInteger(v) && v >= c.scaleMin && v <= c.scaleMax;
  });
}

/** True when a stall still has its seeded placeholder name. */
export function isUnnamed(s: Stall): boolean {
  return /^Stall \d+$/.test(s.name);
}

/** Accept only full https links of a sensible length; returns null for anything else. */
export function cleanLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 300) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The video links a judge needs for a competition, taken from what the stall team submitted. */
export function materialsFor(slug: string, stall: Stall): { label: string; url: string }[] {
  if (slug === 'business-pitch') return stall.pitchUrl ? [{ label: 'Watch the pitch video', url: stall.pitchUrl }] : [];
  if (slug === 'video-marketing') return stall.promoUrls.map((url, i) => ({ label: `Watch promo video ${i + 1}`, url }));
  return [];
}

export function fmtScore(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(r * 10 === Math.round(r * 10) ? 1 : 2);
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Work out how a pasted link should be shown on the memory wall. */
export function classifyMemoryUrl(raw: string): { kind: MemoryKind; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  let yt: string | null = null;
  if (host === 'youtu.be') yt = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') yt = u.searchParams.get('v');
    else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) yt = u.pathname.split('/')[2] ?? null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { kind: 'youtube', url: yt };
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: 'video', url: u.toString() };
  return { kind: 'image', url: u.toString() };
}

// ---------------------------------------------------------------------------
// Activity log and account directory (admin console)
// ---------------------------------------------------------------------------

export type LogKind = 'admin' | 'user' | 'auth';

export interface LogEntry {
  id: number;
  at: string;
  actorId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  kind: LogKind;
  action: string;
  summary: string;
  target: string | null;
}

/** One account as the admin console lists it. */
export interface UserRow {
  id: number;
  name: string;
  email: string;
  /** Stored role; a customer on a stall team shows as a seller. */
  role: 'admin' | 'judge' | 'customer';
  isActive: boolean;
  stall: number | null;
  isLeader: boolean;
  lastLoginAt: string | null;
  photos: string[];
  /** Score sheets they have saved as a jury. */
  scored: number;
}

/** What customers said about one stall: People Choice votes and the star ratings per element. */
export interface CustomerFeedback {
  likes: number;
  dislikes: number;
  /** People who rated at least one element. */
  raters: number;
  elements: {
    id: number;
    name: string;
    marks: number;
    /** Average stars, 0 when nobody rated it. */
    average: number;
    count: number;
    /** How many gave 1, 2, 3, 4 and 5 stars. */
    spread: [number, number, number, number, number];
  }[];
}

// ---------------------------------------------------------------------------
// Stall registration and payments
// ---------------------------------------------------------------------------

/** One electrical item the stall will plug in, with its power rating. */
export interface ElectricalItem {
  item: string;
  watts: number;
}

/** The stall registration details (2024 "Maklumat Gerai" and pitch forms). */
export interface StallDetails {
  course: string | null;
  lecturer: string | null;
  groupNo: number | null;
  mainProduct: string | null;
  productName: string | null;
  /** Same product as in the team's original proposal? */
  sameProduct: boolean | null;
  electrical: ElectricalItem[];
  leaderPhone: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const EMPTY_DETAILS: StallDetails = {
  course: null,
  lecturer: null,
  groupNo: null,
  mainProduct: null,
  productName: null,
  sameProduct: null,
  electrical: [],
  leaderPhone: null,
  updatedAt: null,
  updatedBy: null,
};

/** Every field of the details form is filled in (electrical may be an empty list only if confirmed "none"). */
export function detailsComplete(d: StallDetails): boolean {
  return Boolean(d.course && d.lecturer && d.groupNo && d.mainProduct && d.productName && d.sameProduct !== null && d.leaderPhone);
}

export type PaymentStatus = 'pending' | 'verified' | 'rejected';
export type RefundStatus = 'held' | 'refunded' | 'forfeited';

/** Personal details on the deposit form (as the 2024 form asked). Shown only to the leader and admins. */
export interface PayerDetails {
  name: string;
  matric: string;
  ic: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  gender: string;
  bumiputera: string;
  sulung: string;
  level: string;
  year: string;
  faculty: string;
  field: string;
  collegeType: string;
  college: string;
  refundBank: string;
  refundAccount: string;
}

export const PAYER_FIELDS: (keyof PayerDetails)[] = [
  'name', 'matric', 'ic', 'phone', 'email', 'address', 'state', 'gender', 'bumiputera', 'sulung',
  'level', 'year', 'faculty', 'field', 'collegeType', 'college', 'refundBank', 'refundAccount',
];

/** A payment as the team leader and the committee see it (files are fetched separately). */
export interface Payment {
  id: number;
  stallNumber: number;
  kind: 'deposit' | 'rental';
  amount: number;
  paidOn: string | null;
  receiptName: string | null;
  receiptType: string;
  hasStatement: boolean;
  statementName: string | null;
  statementType: string | null;
  /** Google Drive links, when the files are kept in Drive. */
  receiptUrl: string | null;
  statementUrl: string | null;
  payer: Partial<PayerDetails>;
  status: PaymentStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  refundStatus: RefundStatus | null;
  submittedBy: string;
  submittedAt: string;
}

/** One row of the committee's payments table. */
export interface PaymentRow {
  stallNumber: number;
  stallName: string;
  colour: StallColour | null;
  leader: string | null;
  details: StallDetails;
  deposit: Payment | null;
  rental: Payment | null;
}

/** Student emails start with the matric number (AI230007@student.uthm.edu.my). Empty for staff. */
export function matricFromEmail(email: string): string {
  return /@student\.uthm\.edu\.my$/i.test(email) ? email.split('@')[0].toUpperCase() : '';
}

/** One item under the notification bell. */
export interface Notice {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  unread: boolean;
}
