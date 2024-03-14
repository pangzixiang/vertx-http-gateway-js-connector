import type * as http from 'http';

export const chunkTypeArray = new Uint8Array([-2, 0, 1, 2, 3]);

export const EOL = '\n';

export const buildResponseMessageInfoChunkBody = (res: http.IncomingMessage): string => {
  let result = `http/${res.httpVersion} ${res.statusCode} ${res.statusMessage}` + EOL;
  for (const key in res.headers) {
    result += `${key}:${res.headers[key] as string}` + EOL;
  }
  return result;
};
