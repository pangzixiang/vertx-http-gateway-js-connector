import { type ClientOptions } from 'ws';
import type * as http from 'http';
import type * as https from 'https';

export interface VertxHttpGatewayConnectorOptionsType {
  registerHost?: string;
  registerPort: number;
  registerUseSsl?: boolean;
  registerPath: string;
  registerClientOptions?: ClientOptions | undefined;
  serviceHost?: string;
  serviceName: string;
  servicePort: number;
  serviceUseSsl?: boolean;
  instanceNum?: number;
  pathConverter?: PathConverter;
  proxyAgent?: http.Agent | https.Agent | undefined;
}

export type PathConverter = (path: string) => string;
