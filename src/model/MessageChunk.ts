export class MessageChunk {
    private readonly _chunkType: number;
    private readonly _requestId: bigint;
    private readonly _chunkBody: Buffer;

    constructor(buffer: Buffer) {
        this._chunkType = buffer.readUInt8(0);
        this._requestId = buffer.readBigInt64BE(1);
        this._chunkBody = buffer.slice(9);
    }


    get chunkType(): number {
        return this._chunkType;
    }

    get requestId(): bigint {
        return this._requestId;
    }

    get chunkBody(): Buffer {
        return this._chunkBody;
    }
}
