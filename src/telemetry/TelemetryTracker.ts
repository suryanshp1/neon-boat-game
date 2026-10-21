export type TelemetryEventType =
  | 'client_boot'
  | 'first_frame'
  | 'first_control'
  | 'tutorial_step'
  | 'mission_offer'
  | 'mission_start'
  | 'mission_complete'
  | 'mission_fail'
  | 'mission_abandon'
  | 'heat_change'
  | 'pursuit_escape'
  | 'boat_destroyed'
  | 'currency_source'
  | 'currency_sink'
  | 'upgrade_purchase'
  | 'boat_purchase'
  | 'district_enter'
  | 'secret_found'
  | 'session_end';

export interface TelemetryEvent {
  id: number;
  timestampMs: number;
  type: TelemetryEventType;
  payload: Record<string, unknown>;
}

export class TelemetryTracker {
  private events: TelemetryEvent[] = [];
  private seq = 1;
  private hasLoggedFirstControl = false;

  public track(type: TelemetryEventType, payload: Record<string, unknown> = {}): TelemetryEvent {
    const evt: TelemetryEvent = {
      id: this.seq++,
      timestampMs: Date.now(),
      type,
      payload,
    };
    this.events.push(evt);
    if (this.events.length > 500) {
      this.events.shift();
    }
    return evt;
  }

  public markFirstControlIfNeeded(inputActive: boolean): void {
    if (inputActive && !this.hasLoggedFirstControl) {
      this.hasLoggedFirstControl = true;
      this.track('first_control', {});
    }
  }

  public getEvents(): readonly TelemetryEvent[] {
    return this.events;
  }

  public getRecentEvents(limit = 12): TelemetryEvent[] {
    return this.events.slice(-limit).reverse();
  }
}
