import EventEmitter from 'events';

export interface LevitateConfig {
  host?: string;
  orgSlug: string;
  refreshTokens: {
    write: string;
  };
}

export interface DomainEventsBody {
  [key: string]: any;
  event_name: string;
  event_state: 'start' | 'stop';
  workspace?: string;
  namespace?: string;
  entity_type?: string;
  data_source_name: string;
}

const defaultHost = 'https://app.last9.io';

export class LevitateEvents extends EventEmitter {
  private eventsUrl: URL;
  public levitateConfig?: LevitateConfig;
  constructor() {
    super();
    this.eventsUrl = new URL(
      `/api/v4/organizations/${this.levitateConfig?.orgSlug}/domain_events`,
      this.levitateConfig?.host ?? defaultHost
    );
    this.initiateEventListeners();
  }

  // Making the emit and on methods type safe
  public emit(
    event: 'application_started',
    ...args: (DomainEventsBody | any)[]
  ): boolean;
  public emit(
    event: 'application_stopped',
    ...args: (DomainEventsBody | any)[]
  ): boolean;
  public emit(event: any, ...args: any[]): any {
    return super.emit(event, ...args);
  }

  public on(
    event: 'application_started',
    listener: (...args: (DomainEventsBody | any)[]) => void
  ): this;
  public on(
    event: 'application_stopped',
    listener: (...args: (DomainEventsBody | any)[]) => void
  ): this;
  public on(event: any, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  public once(
    event: 'application_started',
    listener: (...args: (DomainEventsBody | any)[]) => void
  ): this;
  public once(
    event: 'application_stopped',
    listener: (...args: (DomainEventsBody | any)[]) => void
  ): this;
  public once(event: any, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  private initiateEventListeners() {
    if (typeof this.levitateConfig?.refreshTokens?.write === 'string') {
      this.once('application_started', this.applicationStarted);
    }
  }

  private applicationStarted(body: DomainEventsBody) {
    const params = new URLSearchParams();

    if (!!body) {
      for (const key in body) {
        if (key in body) {
          params.append(key, body[key]);
        }
      }

      // fetch(this.eventsUrl.toString(), {
      //   method: 'PUT',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'X-LAST9-API-TOKEN': `Bearer `
      //   },
      //   body: params
      // });
      console.log(params);
    }
  }
}
