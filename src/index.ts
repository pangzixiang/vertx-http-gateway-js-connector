import { type VertxHttpGatewayConnectorOptionsType } from './type/Types';
import { MessageChunk } from './model/MessageChunk';
import { buildResponseMessageInfoChunkBody, chunkTypeArray } from './Commons';
import { RequestMessageInfoChunkBody } from './model/RequestMessageInfoChunkBody';
import * as http from 'http';
import { type RequestOptions } from 'node:http';
import { CacheContainer } from 'node-ts-cache';
import { MemoryStorage } from 'node-ts-cache-storage-memory';
import WebSocket from 'ws';

const cache = new CacheContainer(new MemoryStorage());
const cacheTTL = 5 * 60;

export class VertxHttpGatewayConnector {
  private readonly _connectionUrl: string;
  private readonly _serviceHost: string;
  private readonly _serviceUseSsl: boolean;
  private readonly _servicePort: number;
  private _isClose: boolean;
  private readonly _instanceNum: number;
  private readonly _wsList: WebSocket[] = [];
  private readonly _reconnectList: NodeJS.Timeout[] = [];

  constructor(options: VertxHttpGatewayConnectorOptionsType) {
    const {
      registerHost = 'localhost',
      registerPort = 0,
      registerUseSsl = false,
      serviceName = '',
      servicePort = 0,
      serviceHost = 'localhost',
      serviceUseSsl = false,
      instanceNum = 2,
      registerPath = '/register',
    } = options;

    this._connectionUrl = `${registerUseSsl ? 'wss' : 'ws'}://${registerHost}:${registerPort}${registerPath}?serviceName=${serviceName}&servicePort=${servicePort}&instance=`;
    this._serviceHost = serviceHost;
    this._serviceUseSsl = serviceUseSsl;
    this._servicePort = servicePort;
    this._isClose = false;
    this._instanceNum = instanceNum;
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

  private connect(i: number, url: string): void {
    const ws = new WebSocket(url);
    this._wsList[i] = ws;
    ws.onopen = () => {
      console.log(`Succeeded to connect to vertx http gateway via ${url}`);
    };

    ws.on('message', (data: Buffer) => {
      const messageChunk = new MessageChunk(data);

      void (async () => {
        if (messageChunk.chunkType === chunkTypeArray[1]) {
          const requestMessageInfoChunkBody = new RequestMessageInfoChunkBody(messageChunk.chunkBody.toString());
          const httpMethod = requestMessageInfoChunkBody.httpMethod;
          const headers = requestMessageInfoChunkBody.headers;
          const uri = requestMessageInfoChunkBody.uri;
          // const httpVersion = requestMessageInfoChunkBody.httpVersion;

          console.debug(`start to handle request for ${httpMethod} ${uri}`);

          const requestOptions: RequestOptions = {
            hostname: this._serviceHost,
            port: this._servicePort,
            path: uri,
            method: httpMethod,
            headers,
            protocol: this._serviceUseSsl ? 'https:' : 'http:',
          };

          const req = http.request(requestOptions, (res) => {
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
          });
          await cache.setItem(String(messageChunk.requestId), req, { ttl: cacheTTL });

          req.on('close', () => {
            void cache.setItem(String(messageChunk.requestId), null, { ttl: 0 });
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
          const req: http.ClientRequest | undefined = await cache.getItem(String(messageChunk.requestId));
          if (req != null) {
            req.write(messageChunk.chunkBody);
          }
        }

        if (messageChunk.chunkType === chunkTypeArray[3]) {
          const req: http.ClientRequest | undefined = await cache.getItem(String(messageChunk.requestId));
          if (req != null) {
            req.end();
          }
        }
      })();
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
      console.error(`failed to connect to vertx http gateway ${url} due to ${err.message}`);
    });
  }
}
