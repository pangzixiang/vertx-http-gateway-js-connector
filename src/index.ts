import { type PathConverter, type VertxHttpGatewayConnectorOptionsType } from './type/Types';
import { MessageChunk } from './model/MessageChunk';
import { buildResponseMessageInfoChunkBody, chunkTypeArray } from './Commons';
import { RequestMessageInfoChunkBody } from './model/RequestMessageInfoChunkBody';
import { type ClientRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import WebSocket, { type ClientOptions } from 'ws';
import * as https from 'https';
import * as http from 'http';

export class VertxHttpGatewayConnector {
  private readonly _connectionUrl: string;
  private readonly _serviceHost: string;
  private readonly _serviceUseSsl: boolean;
  private readonly _servicePort: number;
  private _isClose: boolean;
  private readonly _instanceNum: number;
  private readonly _wsList: WebSocket[] = [];
  private readonly _reconnectList: NodeJS.Timeout[] = [];
  private readonly _pathConverter: PathConverter;
  private readonly _registerClientOptions: ClientOptions | undefined;
  private readonly _proxyAgent: http.Agent | https.Agent | undefined;
  private readonly _requestStorage: Map<string, ClientRequest>;

  constructor(options: VertxHttpGatewayConnectorOptionsType) {
    const {
      registerHost = 'localhost',
      registerPort = 0,
      registerUseSsl = false,
      registerClientOptions = undefined,
      serviceName = '',
      servicePort = 0,
      serviceHost = 'localhost',
      serviceUseSsl = false,
      instanceNum = 2,
      registerPath = '/register',
      pathConverter = (p: string) => p,
      proxyAgent = undefined,
    } = options;

    this._requestStorage = new Map<string, ClientRequest>();
    this._connectionUrl = `${registerUseSsl ? 'wss' : 'ws'}://${registerHost}:${registerPort}${registerPath}?serviceName=${serviceName}&servicePort=${servicePort}&instance=`;
    this._serviceHost = serviceHost;
    this._serviceUseSsl = serviceUseSsl;
    this._servicePort = servicePort;
    this._isClose = false;
    this._instanceNum = instanceNum;
    this._pathConverter = pathConverter;
    this._registerClientOptions = registerClientOptions;
    this._proxyAgent = proxyAgent;
  }

  public start(): void {
    for (let i = 0; i < this._instanceNum; i++) {
      const url = this._connectionUrl + `${Math.round(Math.random() * 10)}${Date.now()}`;
      this.connect(i, url);
    }
  }

  public stop(): void {
    this._isClose = true;
    this._reconnectList.forEach((job) => {
      clearTimeout(job);
    });
    this._wsList.forEach((ws) => {
      console.log(`close connection ${ws.url}`);
      ws.close();
    });
  }

  private handleIncomingMessage(res: IncomingMessage, messageChunk: MessageChunk, ws: WebSocket): void {
    const responseMessageInfoChunkBody = buildResponseMessageInfoChunkBody(res);
    const firstBuffer = Buffer.alloc(9);
    firstBuffer.writeUInt8(chunkTypeArray[1]);
    firstBuffer.writeBigInt64BE(messageChunk.requestId, 1);
    const responseInfoChunkBodyBuffer = Buffer.from(responseMessageInfoChunkBody);
    ws.send(Buffer.concat([firstBuffer, responseInfoChunkBodyBuffer]));

    res.on('data', (data) => {
      const firstBuffer = Buffer.alloc(9);
      firstBuffer.writeUInt8(chunkTypeArray[2]);
      firstBuffer.writeBigInt64BE(messageChunk.requestId, 1);
      const bodyChunkBuffer = Buffer.from(data as Uint8Array);
      ws.send(Buffer.concat([firstBuffer, bodyChunkBuffer]));
    });

    res.on('end', () => {
      const firstBuffer = Buffer.alloc(9);
      firstBuffer.writeUInt8(chunkTypeArray[3]);
      firstBuffer.writeBigInt64BE(messageChunk.requestId, 1);
      ws.send(firstBuffer);
    });

    res.on('error', (err) => {
      const chunk = Buffer.alloc(9);
      chunk.writeUInt8(chunkTypeArray[0]);
      chunk.writeBigInt64BE(messageChunk.requestId, 1);
      ws.send(Buffer.concat([chunk, Buffer.from(err.message)]));
    });
  }

  private connect(i: number, url: string): void {
    const ws = new WebSocket(url, this._registerClientOptions);
    this._wsList[i] = ws;
    ws.onopen = () => {
      console.log(`Succeeded to connect to vertx http gateway via ${url}`);
    };

    ws.on('message', (data: Buffer) => {
      const messageChunk = new MessageChunk(data);
      if (messageChunk.chunkType === chunkTypeArray[1]) {
        const requestMessageInfoChunkBody = new RequestMessageInfoChunkBody(messageChunk.chunkBody.toString());
        const httpMethod = requestMessageInfoChunkBody.httpMethod;
        const headers = requestMessageInfoChunkBody.headers;
        const uri = this._pathConverter(requestMessageInfoChunkBody.uri);
        // const httpVersion = requestMessageInfoChunkBody.httpVersion;

        console.debug(`start to handle request for ${httpMethod} ${uri}`);

        const requestOptions: RequestOptions = {
          hostname: this._serviceHost,
          port: this._servicePort,
          path: uri,
          method: httpMethod,
          headers,
          agent: this._proxyAgent,
        };

        const req = this._serviceUseSsl
          ? https.request(requestOptions, (res) => {
              this.handleIncomingMessage(res, messageChunk, ws);
            })
          : http.request(requestOptions, (res) => {
              this.handleIncomingMessage(res, messageChunk, ws);
            });

        this._requestStorage.set(String(messageChunk.requestId), req);

        req.on('close', () => {
          this._requestStorage.delete(String(messageChunk.requestId));
          console.debug(`succeeded to handle request for ${httpMethod} ${uri}`);
        });

        req.on('error', (err) => {
          const chunk = Buffer.alloc(9);
          chunk.writeUInt8(chunkTypeArray[0]);
          chunk.writeBigInt64BE(messageChunk.requestId, 1);
          ws.send(Buffer.concat([chunk, Buffer.from(err.message)]));
        });
      }

      if (messageChunk.chunkType === chunkTypeArray[2]) {
        const req: ClientRequest | undefined = this._requestStorage.get(String(messageChunk.requestId));
        if (req != null) {
          req.write(messageChunk.chunkBody);
        }
      }

      if (messageChunk.chunkType === chunkTypeArray[3]) {
        const req: ClientRequest | undefined = this._requestStorage.get(String(messageChunk.requestId));
        if (req != null) {
          req.end();
        }
      }
    });

    ws.on('close', () => {
      console.warn(`connection to vertx http gateway ${url} is closed`);
      if (!this._isClose) {
        this._reconnectList[i] = setTimeout(() => {
          console.log(`start to retry connection via ${url}`);
          this.connect(i, url);
        }, 2000);
      }
    });

    ws.on('error', (err) => {
      console.error(`failed to connect to vertx http gateway ${url} due to ${err.message}`, err);
    });
  }
}
