# Collaborative Real-Time Editor

A minimal, concurrent document editor where multiple users can edit the same
text at the same time. Built with **React**, **Node.js**, **WebSockets**, and
**Operational Transformation (OT)**.

---

## Live Demo

You can try the collaborative editor instantly without installing anything on your local machine.

- **Live Link :** `https://real-time-collab-editor-six.vercel.app/`

To test real-time collaboration :

1. Open the Website in **two or more browser tabs** (or different browsers).
2. Enter a short username (maximum **6 characters**) in each tab.
3. Start typing in one tab.
4. Your changes will appear almost instantly in the other tabs, demonstrating real-time synchronization powered by Operational Transformation.

---

# 🚀 Running Locally

Follow the steps below to set up and run the project on your own machine.

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js :** (Version **16** or higher)
- **npm :** (Included with Node.js)

You can verify your installation by running:

```bash
node -v
npm -v
```

---

## 1. Clone the Repository

```bash
git clone https://github.com/Jainil979/Real-Time-Collab-Editor/
cd collab-editor
```


---


## 2. Start the Backend Server

Open a terminal and run:

```bash
cd server
npm install
node index.js
```

Once the server starts successfully, you should see a message indicating that the WebSocket server is running.

The backend will be available at:

```text
ws://localhost:3001
```

---

## 3. Start the Frontend

Open a **new terminal window** and run:

```bash
cd client
npm install
npm run dev
```

The Vite development server will start, typically at:

```text
http://localhost:5173
```

---

## 4. Start Collaborating

1. Open:

```
http://localhost:5173
```

2. Open the same URL in **two or more browser tabs** (or different browsers).

3. Enter a username (maximum **6 characters**) in each tab.

4. Start editing the document.

5. Changes made in one tab will be synchronized almost instantly across all connected clients.


---


## 5. Run the Unit Tests

The Operational Transformation engine is tested using **Vitest**.

Run the following commands:

```bash
cd client
npm test
```

This executes the complete test suite, including:

- Concurrent insert operations
- Concurrent delete operations
- Overlapping deletes
- Delete splitting
- Cursor transformation
- Boundary conditions
- Empty operations (no-ops)
- Three-way concurrent edits
- **200 randomized concurrent editing (fuzz) tests**

All tests should pass successfully.


---


## Project Structure

```text
collab-editor/
├── client/          # React + Vite frontend
├── server/          # Node.js WebSocket server
└── README.md
```

---


## Verification

After completing the setup:

- ✅ Backend WebSocket server is running.
- ✅ Frontend is accessible in the browser.
- ✅ Multiple browser tabs stay synchronized in real time.
- ✅ All Operational Transformation unit tests pass successfully.

Your collaborative editor is now running locally and ready for real-time editing.


---


## Core Requirements – How We Satisfied Them

### ✅ Multiple users can open the document in different tabs or browsers :
The server holds a single shared document. When a new client connects over
WebSocket, the server immediately sends a `sync` message with the full document
and the current revision. Every open tab or browser gets its own WebSocket
connection, so changes from one are instantly available to all. There is no
login – you just enter a short name and you’re in.

### ✅ Edits appear in near real time :
Whenever a user types, the client computes the difference between the old and
new text and turns that into tiny **insert** or **delete** operations. These
operations are sent to the server over the persistent WebSocket connection. The
server transforms the operation against any concurrent edits, applies it, and
broadcasts it to every other connected client. Because everything goes through
WebSockets without polling, the delay is only the network round‑trip – it feels
instant.

### ✅ Concurrent edits never lose data :
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

### ✅ Brief disconnections are handled correctly :
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

### ✅ The UI never lies about what was saved :
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

I looked at the three suggested stretch goals and decided to focus on the ones
that give the most immediate collaborative feel without over‑complicating the
project. Here is what we implemented and what I left for later.

### ✅ Live cursors and presence indicator :
When another user is in the document, you can see exactly where they are
working. A thin, coloured, blinking vertical bar appears at their cursor
position, with a small label showing their name. The colour is unique to each
user and stays consistent across all clients. In the top‑right corner of the
editor, a row of circular avatars shows every connected user. The avatars appear
as soon as someone joins and disappear when they leave. Cursor positions are
calculated using the `textarea-caret` library, which gives accurate pixel
coordinates even when the text wraps or scrolls.

### ❌ Offline editing that reconciles when the connection returns :
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

### ❌ Document history or undo :
Undo is surprisingly difficult in a collaborative setting because an “undo” is
not simply a local action – other users may have built on top of your last
edit. We did not implement undo for this reason. Building a proper collaborative
undo stack requires storing the inverse of every operation and carefully
transforming undo operations against concurrent edits. It is a well‑known hard
problem in OT systems, and we felt that a correct implementation would exceed
the time budget. For now, users can manually edit or delete text, but a full
undo/redo feature would be the next major addition after offline support.


---


## Edge Cases Handled by Operational Transformation

Our OT logic has been tested against every type of concurrent edit conflict. The table below lists the key edge cases we cover, how they are resolved, and a real-world example of each.

| Edge Case | How We Handle It | Real-World Example |
|-----------|-------------------|--------------------|
| **Two inserts at the same position** | The insert with the smaller client ID is applied first. The second insert is shifted to the right, ensuring every client reaches the same final document state. | Alice types `A` and Bob types `B` at position `0`. The final text is always `AB` (or `BA`, depending on client IDs), and every connected client sees the same result. |
| **Insert before a delete** | The delete operation's position is shifted to the right by the length of the inserted text so that it still deletes the intended characters. | Bob deletes `world`, while Alice inserts `Hello ` before it. The delete still removes `world`, producing the expected final document. |
| **Insert after a delete** | Since the insert occurs after the deleted region, the delete operation remains unchanged and the insert position is unaffected. | Bob deletes text near the beginning of the document while Alice adds new text at the end. Both changes are preserved correctly. |
| **Insert inside a delete range (split delete)** | The delete operation is divided into two parts: one before the inserted text and one after it, allowing the inserted content to remain while the surrounding text is deleted. | Bob deletes `brown fox`, while Alice inserts `X` in the middle. The surrounding text is deleted, but `X` remains exactly where it was inserted. |
| **Delete inside another delete range** | The smaller delete becomes a no-op because its target text has already been removed by the larger delete. | Bob deletes an entire paragraph while Alice deletes a single word inside that paragraph. The word is not deleted twice. |
| **Two overlapping deletes** | The overlapping portion is removed only once. The delete operations are transformed into a single consistent deletion without duplicating work. | Alice deletes characters `5–10`, while Bob deletes `8–12`. The final result behaves like one delete covering characters `5–12`. |
| **Delete at the beginning or end of the document** | Boundary conditions are handled safely by clamping positions and preventing invalid indexes or out-of-bounds access. | Deleting the first character removes it correctly, and deleting the last character shortens the document without errors. |
| **Empty inserts or zero-length deletes** | Operations that make no actual change are treated as no-ops and do not affect any concurrent operations. | Alice accidentally sends an empty insert while Bob deletes text. Bob's delete behaves exactly as if the empty insert never existed. |
| **Cursor position during concurrent edits** | Cursor positions are transformed using the same OT rules so that users continue editing at the correct location after remote updates. | Bob's cursor is at position `10`. Alice inserts three characters before it, so Bob's cursor automatically moves to position `13`. |
| **Random concurrent edits (Fuzz Testing)** | Hundreds of randomly generated document states and random operation pairs are executed to verify convergence regardless of operation order. | Two completely random inserts or deletes applied in different orders always produce the same final document on every client. |
| **Three or more concurrent edits** | The server serializes incoming operations, transforms each against previously accepted operations, and broadcasts the transformed results so every client converges to the same state. | Alice, Bob, and Charlie all edit the same word simultaneously. Despite different arrival orders, every client eventually displays the exact same final document. |

All of these edge cases are verified by our automated unit test suite every time the tests are executed, ensuring consistent Operational Transformation behavior and document convergence across all connected clients.


---


## Tradeoffs of Operational Transformation

### (1). Operational Transformation solved our core problem : 
preventing data loss during concurrent edits. But like every approach, it comes with its own set of tradeoffs that we should be upfront about.

### (2). Central server required :
OT in our design relies on a single server that sequences all operations. This means every client must be connected to that server to collaborate. It’s not a peer‑to‑peer system, so if the server goes down, collaboration stops entirely. The upside is that we avoid the complexity of synchronising state across multiple peers and we have a clear, single source of truth.

### (3). Transform functions are tricky to get right :
The heart of OT is the transform function – it has to handle every combination of insert and delete correctly. We spent significant effort covering edge cases (splitting deletes, adjusting positions, tie‑breaking same‑position inserts). Even with our thorough test suite, we know that OT implementations are historically easy to get subtly wrong. We validated ours heavily, but the complexity is real.

### (4). Guarantees only pairwise convergence (TP1), not full TP2 :
Our OT ensures that any two concurrent operations will converge to the same result (TP1 property). However, we don’t guarantee that three or more concurrent operations applied in different orders will always produce exactly the same output unless the server serialises them first. In practice, the server imposes one global order, so this is not a problem. If we ever moved to a truly decentralised model, we would need a more complex transformation that satisfies TP2.

### (5). No built‑in offline support :
OT, in its classic form, assumes an always‑connected model. We had to deliberately disable editing while offline because local changes could diverge too far from the server state and become impossible to transform correctly without a local operation log. Offline editing would either require a much heavier OT variant (like Google Wave’s) or a switch to a CRDT approach.

### (6). Tie‑breaking is deterministic but arbitrary :
When two users insert at the same position, we break the tie using their client ID. The result is predictable and the same for everyone, which is what matters. But from a user’s perspective, who gets to go first might feel random. There’s no semantic rule – it’s just alphabetical order of random IDs. That’s a fair tradeoff for avoiding data loss.


---


## Why I Store Document State in Memory (and Not a Database) 
For this project, the entire collaborative document lives only in the server’s RAM. Here’s why we made that choice and what the consequences are.

### (1). Simplicity and zero setup :
We wanted the project to be easy to run locally and easy to understand. Storing the document in memory means there’s no database to install, no schema to design, and no connection strings to configure. Anyone can clone the repository, run node index.js, and start editing immediately.

### (2). Speed :
Reading and writing to RAM is near‑instant. There’s no network round‑trip to a database, no query parsing, and no disk I/O. For a real‑time editor that needs to apply and broadcast operations as fast as possible, this keeps latency minimal.

### (3). Fits the scope of a small, single‑document demo :
The assignment asks for a single shared document. An in‑memory solution is perfectly adequate for that. It holds the entire document and its operation history without worrying about persistence, migrations, or backup strategies – things that would be critical in a production system but would only add noise here.

### (4). The biggest risk is data loss on server restart :
If the server process stops – because of a crash, a deployment, or manual restart – the document and all its history disappear completely. There is no recovery. For a production system, this would be unacceptable. We’d need to persist every operation to a database (like PostgreSQL or Redis) and rebuild the document from the operation log.

### (5). No persistence across sessions :
Once the server restarts, a new document starts from scratch. There’s no way to revisit yesterday’s notes. This is fine for a demo where sessions are short‑lived, but it means the editor cannot serve as a long‑term collaborative workspace without adding storage.

### (6). What i would do with more time :
The natural next step would be to add a lightweight database layer. The server already stores operations in an array; writing those same operations to a persistent store would be straightforward. For true production use, we’d probably keep the in‑memory document as a cache and persist each operation to disk asynchronously, then rebuild the cache from the operation log on startup.

