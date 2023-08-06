const Websocket = require('ws');
const http = require('http')
const Cache = require('cache')
const os = require('os')

const chunkTypeArray = new Uint8Array([-2, 0, 1, 2, 3])

const cache = new Cache(5*60*1000);

function connect(serviceName, servicePort, listenerHost, listenerPort) {
    const serviceHost = "localhost"
    const connectUrl = `ws://${listenerHost}:${listenerPort}/register?serviceName=${serviceName}&servicePort=${servicePort}&instance=js-${Date.now()}`;
    const ws = new Websocket(connectUrl);

    ws.on('open', () => {
        console.log(`Succeeded to connect to vertx http gateway ${connectUrl}`)
    })

    ws.on('message', (data) => {
        const messageChunk = new MessageChunk(data)

        if (messageChunk.getChunkType() === chunkTypeArray[1]) {
            const requestMessageInfoChunkBody = new RequestMessageInfoChunkBody(messageChunk.getChunkBody().toString())
            const httpMethod = requestMessageInfoChunkBody.getHttpMethod();
            const headers = requestMessageInfoChunkBody.getHeaders();
            const uri = requestMessageInfoChunkBody.getUri();
            const httpVersion = requestMessageInfoChunkBody.getHttpVersion();

            const requestOption = {
                hostname: serviceHost,
                port: servicePort,
                path: uri,
                method: httpMethod,
                headers: JSON.stringify(headers)
            }

            const req = http.request(requestOption, res => {
                const responseMessageInfoChunkBody = buildResponseMessageInfoChunkBody(res);
                const firstBuffer = Buffer.alloc(9)
                firstBuffer.writeUInt8(chunkTypeArray[1])
                firstBuffer.writeBigInt64BE(messageChunk.getRequestId(), 1)
                const responseInfoChunkBodyBuffer = Buffer.from(responseMessageInfoChunkBody)
                ws.send(Buffer.concat([firstBuffer, responseInfoChunkBodyBuffer]))

                res.on('data', (data) => {
                    const firstBuffer = Buffer.alloc(9)
                    firstBuffer.writeUInt8(chunkTypeArray[2])
                    firstBuffer.writeBigInt64BE(messageChunk.getRequestId(), 1)
                    const bodyChunkBuffer = Buffer.from(data)
                    ws.send(Buffer.concat([firstBuffer, bodyChunkBuffer]))
                })

                res.on('end', () => {
                    const firstBuffer = Buffer.alloc(9)
                    firstBuffer.writeUInt8(chunkTypeArray[3])
                    firstBuffer.writeBigInt64BE(messageChunk.getRequestId(), 1)
                    ws.send(firstBuffer)
                })
            });

            cache.put(messageChunk.getRequestId(), req)

            req.on('close', () => {
                cache.del(messageChunk.getRequestId())
            })
        }

        if (messageChunk.getChunkType() === chunkTypeArray[2]) {
            if (cache.get(messageChunk.getRequestId())) {
                const req = cache.get(messageChunk.getRequestId())
                req.write(messageChunk.getChunkBody())
            }
        }

        if (messageChunk.getChunkType() === chunkTypeArray[3]) {
            if (cache.get(messageChunk.getRequestId())) {
                const req = cache.get(messageChunk.getRequestId())
                req.end();
            }
        }
    })

    ws.on('close', () => {
        console.warn(`connection to vertx http gateway ${connectUrl} is closed`)
        setTimeout(() => {
            console.log(`connection ${connectUrl} retry`)
            connect(serviceName, servicePort, listenerHost, listenerPort)
        }, 2000)
    })

    ws.on('error', (err) => {
        console.error(`failed to connect to vertx http gateway ${connectUrl} due to ${err}`)
    })
}

function buildResponseMessageInfoChunkBody(res) {
    let result = `http/${res.httpVersion} ${res.statusCode} ${res.statusMessage}` + os.EOL
    for (const key in res.headers) {
        result += `${key}:${res.headers[key]}` + os.EOL
    }
    return result;
}

class MessageChunk {
    constructor(buffer) {
        this.chunkType = buffer.readUInt8(0);
        this.requestId = buffer.readBigInt64BE(1);
        this.chunkBody = buffer.slice(9)
    }

    getChunkType() {
        return this.chunkType
    }

    getRequestId() {
        return this.requestId
    }

    getChunkBody() {
        return this.chunkBody
    }
}

class RequestMessageInfoChunkBody {

    constructor(requestInfoChunkBody) {
        const lines = requestInfoChunkBody.split(os.EOL)
        const firstLine = lines[0].split(" ")
        this.httpVersion = firstLine[0]
        this.httpMethod = firstLine[1]
        this.uri = firstLine[2]
        this.headers = new Map()
        for (let i = 1; i < lines.length; i ++) {
            const line = lines[i].split(":")
            this.headers.set(line[0], line[1])
        }
    }

    getHttpVersion() {
        return this.httpVersion
    }

    getHttpMethod() {
        return this.httpMethod
    }

    getUri() {
        return this.uri
    }

    getHeaders() {
        return this.headers
    }

}

module.exports = connect;