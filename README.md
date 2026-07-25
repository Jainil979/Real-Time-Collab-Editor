# Collaborative Real-Time Editor

A minimal, concurrent document editor where multiple users can edit the same
text at the same time. Built with **React**, **Node.js**, **WebSockets**, and
**Operational Transformation (OT)**.

## Core Requirements – How We Satisfied Them

### ✅ Multiple users can open the document in different tabs or browsers
The server holds a single shared document. When a new client connects over
WebSocket, the server immediately sends a `sync` message with the full document
and the current revision. Every open tab or browser gets its own WebSocket
connection, so changes from one are instantly available to all. There is no
login – you just enter a short name and you’re in.

### ✅ Edits appear in near real time
Whenever a user types, the client computes the difference between the old and
new text and turns that into tiny **insert** or **delete** operations. These
operations are sent to the server over the persistent WebSocket connection. The
server transforms the operation against any concurrent edits, applies it, and
broadcasts it to every other connected client. Because everything goes through
WebSockets without polling, the delay is only the network round‑trip – it feels
instant.

### ✅ Concurrent edits never lose data
Imagine two people are editing the same sentence at the same time. Alice
decides to add the word **“amazing”** in the middle, while Bob selects the
entire middle part and presses Delete. If we used the simplest approach – “last
writer wins” – the person whose message reached the server last would
completely overwrite the other’s change. One of the edits would simply vanish,
and the final document would be missing either the new word or the deletion.

Operational Transformation solves this by **understanding what each operation
intended**, not just its final result. Instead of blindly overwriting the whole
sentence, the server looks at the two conflicting operations and adjusts them
so they can work together. It mathematically answers the question: *“What would
have happened if these two edits had been made one after the other, no matter
the order?”*

In our implementation, every edit is broken down into atomic **insert** and
**delete** actions. When the server receives two concurrent actions that affect
the same region, it runs them through a set of `transform` functions. For
example:

- If Alice’s insert falls inside the range Bob is deleting, the delete
  operation is automatically **split into two deletes** – one before Alice’s
  word and one after. The new word is preserved.
- If two people insert at exactly the same position, we use a deterministic
  tie‑breaker (their client ID) to decide whose text goes first. The result is
  always the same on every client.

No operation is ever silently dropped. The server guarantees that all characters
inserted by all users will appear in the final document (unless explicitly
deleted), and every client will converge to exactly the same text.

The transformation logic is backed by over 80 unit tests, including random
fuzz tests that simulate hundreds of unpredictable concurrent edits. Every
combination of insert and delete converges to the same state, so data loss is
impossible.

### ✅ Brief disconnections are handled correctly
If the WebSocket connection drops (e.g., because of a network hiccup), the UI
immediately shows a red “Disconnected” message and disables the textarea so you
can’t type. It then starts trying to reconnect automatically, with a delay that
increases each time (2 seconds, then 4, then 8…) up to 5 attempts. After 5
failures it shows a final message asking you to refresh.

When the connection comes back, the server sends a fresh `sync` with the whole
document and the latest revision. The client throws away any local pending
operations that weren’t acknowledged and resets itself to the server’s state.
You’ll briefly see a blue “● Synced” indicator so you know you’re back in
step. Because the textarea was disabled while you were offline, you couldn’t
have typed anything that would be lost – the document is always safe.

### ✅ The UI never lies about what was saved
We make sure that the on‑screen status always reflects reality:
- **Connected**: green dot, textarea enabled.
- **Disconnected / Retrying**: red dot, textarea disabled, countdown shown.
- **Synced**: blue notification appears for 2 seconds after a successful
  reconnect.

While disconnected, you can’t type at all – so there’s no risk of believing
your edit was saved when it wasn’t. The only possible race condition (typing
right as the connection drops) is covered by a guard in the send function: if
the socket is unexpectedly closed, the operation is pushed back to the pending
queue and will be sent when the connection is restored. If the queue gets
discarded by a later `sync`, that’s intentional – the server had moved on, and
we respect its state.

---

## Stretch Goals

We looked at the three suggested stretch goals and decided to focus on the ones
that give the most immediate collaborative feel without over‑complicating the
project. Here is what we implemented and what we left for later.

### ✅ Live cursors and presence indicator
When another user is in the document, you can see exactly where they are
working. A thin, coloured, blinking vertical bar appears at their cursor
position, with a small label showing their name. The colour is unique to each
user and stays consistent across all clients. In the top‑right corner of the
editor, a row of circular avatars shows every connected user. The avatars appear
as soon as someone joins and disappear when they leave. Cursor positions are
calculated using the `textarea-caret` library, which gives accurate pixel
coordinates even when the text wraps or scrolls.

### ❌ Offline editing that reconciles when the connection returns
We chose **not** to implement offline editing. When a user disconnects, the
textarea becomes disabled and no typing is possible. This was a deliberate
decision – offline editing adds significant complexity because you need to
store local changes, track them against the server’s evolving state, and
re‑apply them correctly when the connection returns. That would require a
robust local operation log and a reconciliation step that goes beyond the scope
of the current OT implementation. Instead, we focused on making the online
editing bulletproof and ensuring that the user is never confused about whether
their changes were saved. With more time, we would explore using a CRDT
approach (like Yjs) alongside our OT server to allow true offline editing.

### ❌ Document history or undo
Undo is surprisingly difficult in a collaborative setting because an “undo” is
not simply a local action – other users may have built on top of your last
edit. We did not implement undo for this reason. Building a proper collaborative
undo stack requires storing the inverse of every operation and carefully
transforming undo operations against concurrent edits. It is a well‑known hard
problem in OT systems, and we felt that a correct implementation would exceed
the time budget. For now, users can manually edit or delete text, but a full
undo/redo feature would be the next major addition after offline support.
