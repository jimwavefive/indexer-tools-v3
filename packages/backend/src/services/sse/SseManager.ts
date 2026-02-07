import type { Request, Response } from 'express';

export interface IncidentEvent {
  type:
    | 'incident:created'
    | 'incident:updated'
    | 'incident:acknowledged'
    | 'incident:resolved'
    | 'incident:auto-resolved';
  incidentId: string;
  ruleId: string;
  status: string;
  severity: string;
  targetLabel: string;
  title: string;
  timestamp: string;
}

interface SseClient {
  res: Response;
  heartbeat: ReturnType<typeof setInterval>;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

export class SseManager {
  private clients = new Set<SseClient>();

  addClient(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial connection event
    res.write('event: connected\ndata: {}\n\n');

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    const client: SseClient = { res, heartbeat };
    this.clients.add(client);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
    });
  }

  broadcast(event: IncidentEvent): void {
    const data = JSON.stringify(event);
    const message = `event: incident\ndata: ${data}\n\n`;

    for (const client of this.clients) {
      try {
        client.res.write(message);
      } catch {
        // Client disconnected — will be cleaned up on 'close'
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
