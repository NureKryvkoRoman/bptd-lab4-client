import { Stomp } from '@stomp/stompjs';
import { base64ToBigInt, bigIntToBase64, modPow, randomBigInt } from './math';
import { type ClientState } from './state'
import { deriveAesKey, aesEncrypt, aesDecrypt } from './aes';

export const fetchDhParams = async (state: ClientState) => {
    const res = await fetch('http://localhost:8080/params');
    const json = await res.json();
    state.p = BigInt('0x' + json.p);
    state.g = BigInt('0x' + json.g);
};

export const generateIdentityKey = (state: ClientState) => {
    state.identityPriv = randomBigInt(256);
    state.identityPub = modPow(state.g, state.identityPriv, state.p);
};

export const connect = (state: ClientState) => {
    const client = Stomp.client('ws://localhost:8080/ws');

    client.onConnect = () => {
        // Register identity public key
        client.publish({
            destination: '/app/registerKey',
            body: bigIntToBase64(state.identityPub)
        });

        // Receive session Id
        client.subscribe('/user/queue/session', (msg) => {
            state.sessionId = msg.body;
        });

        // Receive public key list
        client.subscribe('/topic/publicKeys', (msg) => {
            const keys: { id: string; pub: string } = JSON.parse(msg.body);
            state.users = Object.fromEntries(
                Object.entries(keys).map(([id, pub]) => [id, base64ToBigInt(pub)])
            );
        });

        // Receive encrypted messages
        client.subscribe('/queue/messages', async (msg) => {
            const data = JSON.parse(msg.body);
            try {
                await handleIncomingMessage(data, state);
            } catch (e) {
                console.log(e);
            }
        });
    };

    client.activate();
    state.stomp = client;
};

export const sendMessage = async (text: string, state: ClientState) => {
    let recipients: any = [];

    for (const recipientId in state.users) {
        if (recipientId === state.sessionId) continue;

        // Ephemeral DH
        const ephPriv = randomBigInt(256);
        const ephPub = modPow(state.g, ephPriv, state.p);
        const shared = modPow(state.users[recipientId], ephPriv, state.p);

        const aesKey = await deriveAesKey(shared);
        const encrypted = await aesEncrypt(aesKey, text);

        recipients.push({
            recipientId,
            senderEphemeralKey: bigIntToBase64(ephPub),
            nonce: encrypted.nonce,
            ciphertext: encrypted.ciphertext
        });
    }

    state.stomp?.publish({
        destination: '/app/sendMessage',
        body: JSON.stringify({
            senderId: state.sessionId,
            recipients
        })
    });
    // For FE presentation
    state.messages = [...state.messages, { senderId: 'me', message: text }];
};

export const handleIncomingMessage = async (
    msg: {
        senderId: string;
        senderEphemeralKey: string;
        nonce: string;
        ciphertext: string;
    },
    state: ClientState
) => {
    const senderEphPub = base64ToBigInt(msg.senderEphemeralKey);
    const shared = modPow(senderEphPub, state.identityPriv, state.p);
    const aesKey = await deriveAesKey(shared);

    const plaintext = await aesDecrypt(aesKey, msg.nonce, msg.ciphertext);

    console.log(`Message from ${msg.senderId}:`, plaintext);
    state.messages = [...state.messages, { senderId: msg.senderId, message: plaintext }];
};

