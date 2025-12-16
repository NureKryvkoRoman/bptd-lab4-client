<script lang="ts">
  import _state from '$lib/state';
  import { fetchDhParams, generateIdentityKey, connect, sendMessage } from '$lib/api';
  import { onMount } from 'svelte';

  let message = $state('');
  let State = $derived(_state);
  let sessionId = $derived(State.sessionId);
  let status = $derived(State.stomp == null);

  onMount(async () => {
    await fetchDhParams();
    generateIdentityKey();
    connect();
  });
  let messages: { senderId: string; message: string }[] = $state([]);
</script>

<div class="container">
  <h1>E2EE Diffie–Hellman Chat Demo</h1>

  <div class="status">
    Status: <b>{status ? 'connecting...' : 'connected'}</b><br />
    Session ID: {sessionId}
  </div>

  <div class="users">
    Connected users:
    <ul>
      {#each State.users as u}
        <li>{u}</li>
      {/each}
    </ul>
  </div>

  <div class="chat">
    {#each messages as m}
      <p class="message"><b>{m.senderId}</b>:{m.message}</p>
    {/each}
  </div>

  <div class="input-row">
    <input type="text" placeholder="Type a message…" bind:value={message} />
    <button
      onclick={() => {
        sendMessage(message);
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
