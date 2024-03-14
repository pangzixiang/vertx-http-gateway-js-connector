import type * as http from 'http';
import { EOL } from '../Commons';

export class RequestMessageInfoChunkBody {
  private readonly _httpVersion: string;
  private readonly _httpMethod: string;
  private readonly _uri: string;
  private readonly _headers: http.OutgoingHttpHeaders = {};
  constructor(requestInfoChunkBody: string) {
    const lines = requestInfoChunkBody.split(EOL);
    const firstLine = lines[0].split(' ');
    this._httpVersion = firstLine[0];
    this._httpMethod = firstLine[1];
    this._uri = firstLine[2];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].split(':');
      if (line[0].length > 0 && line[1].length > 0) {
        this._headers[line[0].toLowerCase()] = line[1];
      }
    }
  }

  get httpVersion(): string {
    return this._httpVersion;
  }

  get httpMethod(): string {
    return this._httpMethod;
  }

  get uri(): string {
    return this._uri;
  }

  get headers(): http.OutgoingHttpHeaders {
    return this._headers;
  }
}
