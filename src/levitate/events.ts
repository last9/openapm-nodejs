import EventEmitter from 'events';
import type { OpenAPMOptions } from '../OpenAPM';
import { fetch, request } from 'undici';

export interface LevitateConfig {
  host?: string;
  orgSlug: string;
  dataSourceName: string;
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
  readonly levitateConfig?: LevitateConfig;
  constructor(options?: OpenAPMOptions) {
    super();
    this.levitateConfig = options?.levitateConfig;
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
      this.once('application_started', this.putDomainEvents);
      this.once('application_stopped', this.putDomainEvents);
    }
  }

  private generateAccessToken = () => {
    const endpoint = '/api/v4/oauth/access_token';
    const url = new URL(endpoint, this.levitateConfig?.host ?? defaultHost);

    try {
      return fetch(url.toString(), {
        method: 'POST',
        body: JSON.stringify({
          refresh_token: this.levitateConfig?.refreshTokens.write ?? ''
        })
      }).then((response) => {
        return response.json();
      }) as Promise<{ access_token: string }>;
    } catch (error) {
      console.log(error);
    }
  };

  private async putDomainEvents(body: DomainEventsBody) {
    if (!!body) {
      try {
        const tokenResponse = await this.generateAccessToken();
        await request(this.eventsUrl.toString(), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-LAST9-API-TOKEN': `Bearer ${tokenResponse?.access_token}`
          },
          body: JSON.stringify(body)
        });
      } catch (error) {
        console.log(error);
      }
    }
  }
}
