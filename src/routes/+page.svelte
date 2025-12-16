<script lang="ts">
  import { onMount } from 'svelte';
  import { Stomp } from '@stomp/stompjs';
  import type { CompatClient } from '@stomp/stompjs';

  const deriveAesKey = async (sharedSecret: bigint): Promise<CryptoKey> => {
    const raw = new TextEncoder().encode(sharedSecret.toString(16));
    const hash = await crypto.subtle.digest('SHA-256', raw);
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  };

  const aesEncrypt = async (
    key: CryptoKey,
    plaintext: string
  ): Promise<{ nonce: string; ciphertext: string }> => {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      new TextEncoder().encode(plaintext)
    );
    return {
      nonce: btoa(String.fromCharCode(...nonce)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct)))
    };
  };

  const aesDecrypt = async (
    key: CryptoKey,
    nonceB64: string,
    ciphertextB64: string
  ): Promise<string> => {
    const nonce = Uint8Array.from(atob(nonceB64), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct);
    return new TextDecoder().decode(pt);
  };

  const fetchDhParams = async (state: ClientState) => {
    const res = await fetch('http://localhost:8080/params');
    const json = await res.json();
    state.p = BigInt('0x' + json.p);
    state.g = BigInt('0x' + json.g);
  };

  const generateIdentityKey = (state: ClientState) => {
    state.identityPriv = randomBigInt(256);
    state.identityPub = modPow(state.g, state.identityPriv, state.p);
  };

  const connect = (state: ClientState) => {
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

  const sendMessage = async (text: string, state: ClientState) => {
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

  const handleIncomingMessage = async (
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
  const modPow = (base: bigint, exp: bigint, mod: bigint): bigint => {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % mod;
      exp >>= 1n;
      base = (base * base) % mod;
    }
    return result;
  };

  const randomBigInt = (bits: number): bigint => {
    const bytes = Math.ceil(bits / 8);
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    return BigInt('0x' + [...buf].map((b) => b.toString(16).padStart(2, '0')).join(''));
  };

  const bigIntToBase64 = (bi: bigint): string => {
    return btoa(bi.toString(16));
  };

  const base64ToBigInt = (b64: string): bigint => {
    return BigInt('0x' + atob(b64));
  };

  type ClientState = {
    p: bigint;
    g: bigint;

    identityPriv: bigint;
    identityPub: bigint;

    users: Record<string, bigint>;

    stomp: CompatClient | null;
    sessionId: string;
    messages: { senderId: string; message: string }[];
  };

  let State: ClientState = $state({
    p: BigInt(0),
    g: BigInt(0),

    identityPriv: BigInt(0),
    identityPub: BigInt(0),

    users: {} as Record<string, bigint>,

    stomp: null,
    sessionId: '',
    messages: []
  });

  ////
  const printTime = (): string => {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
  };

  let message = $state('');
  let status = $derived(State.stomp == null);

  onMount(async () => {
    await fetchDhParams(State);
    generateIdentityKey(State);
    connect(State);
  });
</script>

<div class="container">
  <h1>E2EE Diffie–Hellman Chat Demo</h1>

  <div class="status">
    Status: <b>{status ? 'connecting...' : 'connected'}</b><br />
    Session ID: {State.sessionId}
  </div>

  <div class="users">
    Connected users:
    <ul>
      {#each Object.keys(State.users) as u}
        <li>{u}</li>
      {/each}
    </ul>
  </div>

  <div class="chat">
    {#each State.messages as m}
      <p class="message">[{printTime()}] <b>{m.senderId.substring(0, 6)}</b>: {m.message}</p>
    {/each}
  </div>

  <div class="input-row">
    <input type="text" placeholder="Type a message…" bind:value={message} />
    <button
      onclick={() => {
        sendMessage(message, State);
        message = '';
      }}>Send</button
    >
  </div>
</div>

<style>
  .container {
    max-width: 800px;
    margin: 30px auto;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 20px;
  }

  h1 {
    margin-top: 0;
    font-size: 22px;
  }

  .status {
    font-size: 14px;
    margin-bottom: 10px;
  }

  .users {
    font-size: 14px;
    margin-bottom: 10px;
  }

  .chat {
    border: 1px solid #ddd;
    height: 300px;
    overflow-y: auto;
    padding: 10px;
    margin-bottom: 10px;
    background: #fafafa;
  }

  .message {
    margin-bottom: 8px;
  }

  .message b {
    color: #333;
  }

  .input-row {
    display: flex;
    gap: 10px;
  }

  input[type='text'] {
    flex: 1;
    padding: 10px;
    font-size: 14px;
  }

  button {
    padding: 10px 15px;
    font-size: 14px;
    cursor: pointer;
  }
</style>
