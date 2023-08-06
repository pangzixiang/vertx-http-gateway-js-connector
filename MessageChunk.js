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

module.exports = MessageChunk;