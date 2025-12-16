import type { CompatClient } from '@stomp/stompjs';

export type ClientState = {
    p: bigint;
    g: bigint;

    identityPriv: bigint;
    identityPub: bigint;

    users: Map<string, bigint>;

    stomp: CompatClient | null;
    sessionId: string;
    messages: { senderId: string; message: string }[];
};

let _state: ClientState = {
    p: BigInt(0),
    g: BigInt(0),

    identityPriv: BigInt(0),
    identityPub: BigInt(0),

    users: new Map(),

    stomp: null,
    sessionId: '',
    messages: []
};

export default _state;
