export interface VertxHttpGatewayConnectorOptionsType {
  registerHost?: string;
  registerPort: number;
  registerUseSsl?: boolean;
  registerPath: string;
  serviceHost?: string;
  serviceName: string;
  servicePort: number;
  serviceUseSsl?: boolean;
  instanceNum?: number;
  pathConverter?: PathConverter;
}

export type PathConverter = (path: string) => string;
