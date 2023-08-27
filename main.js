const Websocket = require('ws');
const http = require('http')
const Cache = require('cache')
const os = require('os')
const RequestMessageInfoChunkBody = require("./RequestMessageInfoChunkBody")
const MessageChunk = require("./MessageChunk")

const chunkTypeArray = new Uint8Array([-2, 0, 1, 2, 3])
const cache = new Cache(5 * 60 * 1000);

class Connector {
    constructor(options) {
        const {
            listenerHost = "localhost",
            listenerPort = 0,
            listenerSsl = false,
            serviceName = "",
            servicePort = 0,
            serviceHost = "localhost",
            serviceSsl = false,
            instanceNum = 2,
            registerPath = "/register"
        } = options;

        this.connectionUrl = `${listenerSsl ? "wss" : "ws"}://${listenerHost}:${listenerPort}${registerPath}?serviceName=${serviceName}&servicePort=${servicePort}&instance=`;
        this.serviceHost = serviceHost;
        this.serviceSsl = serviceSsl;
        this.servicePort = servicePort;
        this.isClose = false;
        this.wsList = [];
        this.reconnectJobs = [];
        this.instanceNum = instanceNum;
    }

    connect() {
        for (let i = 0; i < this.instanceNum; i ++) {
            const wsUrl = this.connectionUrl + `js${Math.round(Math.random()*10)}-${Date.now()}`
            this.#instanceProcessor(i, wsUrl)
        }
    }

    #instanceProcessor(i, wsUrl) {
        const ws = new Websocket(wsUrl)
        this.wsList[i] = ws;
        ws.on('open', () => {
            console.log(`Succeeded to connect to vertx http gateway ${wsUrl}`)
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
                    hostname: this.serviceHost,
                    port: this.servicePort,
                    path: uri,
                    method: httpMethod,
                    headers: JSON.stringify(headers),
                    protocol: this.serviceSsl ? 'https:' : 'http:'
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
            console.warn(`connection to vertx http gateway ${wsUrl} is closed`)
            if (!this.isClose) {
                this.reconnectJobs[i] = setTimeout(() => {
                    console.log(`connection ${wsUrl} retry`)
                    this.#instanceProcessor(i, wsUrl)
                }, 2000)
            }
        })

        ws.on('error', (err) => {
            console.error(`failed to connect to vertx http gateway ${wsUrl} due to ${err}`)
        })
    }

    disconnect() {
        this.isClose = true;
        this.reconnectJobs.forEach((job) => clearTimeout(job))
        this.wsList.forEach((ws) => {
            console.log(`close connection ${ws.url}`)
            ws.terminate();
        })
    }
}

function buildResponseMessageInfoChunkBody(res) {
    let result = `http/${res.httpVersion} ${res.statusCode} ${res.statusMessage}` + os.EOL
    for (const key in res.headers) {
        result += `${key}:${res.headers[key]}` + os.EOL
    }
    return result;
}

module.exports = Connector;