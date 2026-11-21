import { randomBytes } from 'node:crypto';

export type LiveSignal =
  | { type: 'notification' | 'notifications.read'; userId: number }
  | { type: 'request.changed'; requestId: number; siteId: number };

export interface EventBus {
  publish(signal: LiveSignal): void;
  subscribe(listener: (signal: LiveSignal) => void): () => void;
}

export class MemoryEventBus implements EventBus {
  private readonly listeners = new Set<(signal: LiveSignal) => void>();

  publish(signal: LiveSignal) {
    for (const listener of this.listeners) listener(signal);
  }

  subscribe(listener: (signal: LiveSignal) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class StreamTickets {
  private readonly entries = new Map<
    string,
    { session: string; expiresAt: number }
  >();

  issue(session: string, now: number) {
    for (const [key, entry] of this.entries)
      if (entry.expiresAt <= now) this.entries.delete(key);
    const ticket = randomBytes(32).toString('hex');
    this.entries.set(ticket, { session, expiresAt: now + 30_000 });
    return ticket;
  }

  consume(ticket: string, session: string, now: number) {
    const entry = this.entries.get(ticket);
    if (!entry || entry.session !== session) return false;
    this.entries.delete(ticket);
    return now < entry.expiresAt;
  }
}
