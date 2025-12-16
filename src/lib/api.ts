import { Stomp } from '@stomp/stompjs';
import { base64ToBigInt, bigIntToBase64, modPow, randomBigInt } from './math';
import _state from './state'
import { deriveAesKey, aesEncrypt, aesDecrypt } from './aes';

export const fetchDhParams = async () => {
    const res = await fetch("http://localhost:8080/params");
    const json = await res.json();
    _state.p = BigInt("0x" + json.p);
    _state.g = BigInt("0x" + json.g);
}

export const generateIdentityKey = () => {
    _state.identityPriv = randomBigInt(256);
    _state.identityPub = modPow(_state.g, _state.identityPriv, _state.p);
}

export const connect = () => {
    const client = Stomp.client("ws://localhost:8080/ws")

    client.onConnect = () => {
        // Register identity public key
        client.publish({
            destination: "/app/registerKey",
            body: bigIntToBase64(_state.identityPub)
        });

        // Receive session Id
        client.subscribe("/user/queue/session", msg => {
            _state.sessionId = msg.body;
        });

        // Receive public key list
        client.subscribe("/topic/publicKeys", msg => {
            const keys: { id: string, pub: string } = JSON.parse(msg.body);
            _state.users.clear();
            for (const [id, pub] of Object.entries(keys)) {
                _state.users.set(id, base64ToBigInt(pub));
            }
        });

        // Receive encrypted messages
        client.subscribe("/user/queue/messages", async msg => {
            const data = JSON.parse(msg.body);
            await handleIncomingMessage(data);
        });
    };

    client.activate();
    _state.stomp = client;
}

export const sendMessage = async (text: string) => {
    const recipients = [];

    for (const [recipientId, recipientPub] of _state.users.entries()) {
        if (recipientId === _state.sessionId) continue;

        // Ephemeral DH
        const ephPriv = randomBigInt(256);
        const ephPub = modPow(_state.g, ephPriv, _state.p);
        const shared = modPow(recipientPub, ephPriv, _state.p);

        const aesKey = await deriveAesKey(shared);
        const encrypted = await aesEncrypt(aesKey, text);

        recipients.push({
            recipientId,
            senderEphemeralKey: bigIntToBase64(ephPub),
            nonce: encrypted.nonce,
            ciphertext: encrypted.ciphertext
        });
    }

    _state.stomp?.publish({
        destination: "/app/sendMessage",
        body: JSON.stringify({
            senderId: _state.sessionId,
            recipients
        })
    });
}

export const handleIncomingMessage = async (msg: { senderId: string, senderEphemeralKey: string; nonce: string; ciphertext: string }) => {
    const senderEphPub = base64ToBigInt(msg.senderEphemeralKey);
    const shared = modPow(senderEphPub, _state.identityPriv, _state.p);
    const aesKey = await deriveAesKey(shared);

    const plaintext = await aesDecrypt(
        aesKey,
        msg.nonce,
        msg.ciphertext
    );

    console.log(`Message from ${msg.senderId}:`, plaintext);
    _state.messages.push({ senderId: msg.senderId, message: plaintext })
}
