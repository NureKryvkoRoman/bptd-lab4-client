import type { CompatClient } from '@stomp/stompjs';

export type ClientState = {
    p: bigint;
    g: bigint;

    identityPriv: bigint;
    identityPub: bigint;

    users: Record<string, bigint>;

    stomp: CompatClient | null;
    sessionId: string;
    messages: { senderId: string; message: string }[];
};
