// Score sheets saved on the phone while there is no connection.
// They are sent, oldest first, as soon as the server can be reached again.

import type { ScorePayload } from './shared';

const KEY = 'leed26.scoreQueue.v1';
export const QUEUE_EVENT = 'leed26:queue';

export interface QueuedScore extends ScorePayload {
  queuedAt: string;
}

export function readQueue(): QueuedScore[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as QueuedScore[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list: QueuedScore[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage is full or blocked; nothing more we can do here.
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

/** Add a score sheet. A newer sheet for the same stall and competition replaces the older one. */
export function enqueue(p: ScorePayload): void {
  const rest = readQueue().filter((q) => !(q.competitionId === p.competitionId && q.stallNumber === p.stallNumber));
  writeQueue([...rest, { ...p, queuedAt: new Date().toISOString() }]);
}

export function dequeue(competitionId: number, stallNumber: number): void {
  writeQueue(readQueue().filter((q) => !(q.competitionId === competitionId && q.stallNumber === stallNumber)));
}

export interface FlushResult {
  sent: QueuedScore[];
  rejected: { item: QueuedScore; error: string }[];
  /** True when sending stopped because the judge needs to sign in again. */
  needsSignIn: boolean;
  /** True when sheets from a different judge are on this phone; they wait for that judge. */
  otherJudge: boolean;
}

let flushing = false;

export async function flushQueue(): Promise<FlushResult> {
  const result: FlushResult = { sent: [], rejected: [], needsSignIn: false, otherJudge: false };
  if (flushing) return result;
  flushing = true;
  try {
    for (const item of readQueue()) {
      let res: Response;
      try {
        res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            judgeId: item.judgeId,
            competitionId: item.competitionId,
            stallNumber: item.stallNumber,
            scores: item.scores,
            comment: item.comment,
          }),
        });
      } catch {
        break; // still offline
      }
      if (res.ok) {
        result.sent.push(item);
        dequeue(item.competitionId, item.stallNumber);
      } else if (res.status === 401) {
        result.needsSignIn = true;
        break;
      } else if (res.status === 409) {
        result.otherJudge = true; // leave it for the judge who wrote it
      } else if (res.status >= 400 && res.status < 500) {
        // The server refused this sheet (for example judging has closed). Keeping it would block the queue.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        result.rejected.push({ item, error: body?.error ?? 'The server did not accept this score.' });
        dequeue(item.competitionId, item.stallNumber);
      } else {
        break; // server trouble; try again later
      }
    }
  } finally {
    flushing = false;
  }
  return result;
}
