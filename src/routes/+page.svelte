<script lang="ts">
  import { onMount } from 'svelte';
  import { connect, fetchDhParams, generateIdentityKey, sendMessage } from '$lib/api';
  import type { ClientState } from '$lib/state';

  const printTime = (): string => {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
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
