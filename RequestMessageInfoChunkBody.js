import os from "os";

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

module.exports = RequestMessageInfoChunkBody;