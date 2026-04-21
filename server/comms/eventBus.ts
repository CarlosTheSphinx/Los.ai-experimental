import { EventEmitter } from 'events';

/**
 * In-process domain event bus for the comms automation engine.
 *
 * Publishers call `publish(eventName, payload)` from places in the codebase
 * where a meaningful business event happens (loan stage moved, document
 * uploaded, deal submitted, task completed). Subscribers — currently only the
 * trigger service — subscribe via `subscribe(eventName, handler)` to fire
 * automations.
 *
 * Payloads always carry `tenantId` so subscribers can scope work correctly,
 * plus the canonical subject id (`loanId` for loan-scoped events).
 *
 * NOTE: This is intentionally in-process only. If we ever need cross-process
 * delivery (multi-instance deploy), swap the underlying emitter for a
 * Postgres LISTEN/NOTIFY or Redis pub/sub adapter — the public API stays the
 * same.
 */

export type LoanStatusChangedPayload = {
  tenantId: number;
  loanId: number;
  fromStage: string | null;
  toStage: string;
  movedByUserId?: number | null;
};

export type DocumentUploadedPayload = {
  tenantId: number;
  loanId: number;
  documentId: number;
  documentName: string;
  uploadedByUserId?: number | null;
};

export type DealSubmittedPayload = {
  tenantId: number;
  dealId: number;
  loanId?: number | null;
  submittedByUserId?: number | null;
};

export type TaskCompletedPayload = {
  tenantId: number;
  taskId: number;
  loanId?: number | null;
  completedByUserId?: number | null;
};

export type CommsEventMap = {
  loan_status_changed: LoanStatusChangedPayload;
  document_uploaded: DocumentUploadedPayload;
  deal_submitted: DealSubmittedPayload;
  task_completed: TaskCompletedPayload;
};

export type CommsEventName = keyof CommsEventMap;

class CommsEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Avoid Node's default 10-listener warning — we may have many automations.
    this.emitter.setMaxListeners(500);
  }

  publish<E extends CommsEventName>(event: E, payload: CommsEventMap[E]): void {
    // Fire-and-forget. Handlers are responsible for their own error handling.
    this.emitter.emit(event, payload);
  }

  subscribe<E extends CommsEventName>(
    event: E,
    handler: (payload: CommsEventMap[E]) => void | Promise<void>,
  ): () => void {
    const wrapped = (payload: CommsEventMap[E]) => {
      try {
        const result = handler(payload);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(err => {
            console.error(`[commsEventBus] handler for ${event} threw:`, err);
          });
        }
      } catch (err) {
        console.error(`[commsEventBus] handler for ${event} threw:`, err);
      }
    };
    this.emitter.on(event, wrapped as (...args: unknown[]) => void);
    return () => this.emitter.off(event, wrapped as (...args: unknown[]) => void);
  }
}

export const commsEventBus = new CommsEventBus();
