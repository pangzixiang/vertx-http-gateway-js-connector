const Websocket = require('ws');
const http = require('http')
const Cache = require('cache')
const os = require('os')
const RequestMessageInfoChunkBody = require("./RequestMessageInfoChunkBody")
const MessageChunk = require("./MessageChunk")

const chunkTypeArray = new Uint8Array([-2, 0, 1, 2, 3])

const cache = new Cache(5 * 60 * 1000);

function connect(options) {
    const {
        listenerHost = "localhost",
        listenerPort = 0,
        listenerSsl = false,
        serviceName = "",
        servicePort = 0,
        serviceHost = "localhost",
        serviceSsl= false
    } = options;
    const connectUrl = `${listenerSsl? "wss": "ws"}://${listenerHost}:${listenerPort}/register?serviceName=${serviceName}&servicePort=${servicePort}&instance=js-${Date.now()}`;
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
                headers: JSON.stringify(headers),
                protocol: serviceSsl? 'https:' : 'http:'
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

module.exports = connect;