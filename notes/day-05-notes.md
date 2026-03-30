# Day 5 : WebSockets + Real-Time Dashboard

## What Was Built

- `websocket_manager.py` : ConnectionManager class tracking all active WebSocket connections per project
- WebSocket endpoint at `ws://localhost:8000/feedback/ws/{project_id}`
- `create_feedback` updated : broadcasts new feedback to all connected dashboards instantly
- Dashboard `connectWebSocket()` function : opens persistent browser WebSocket connection
- Real-time feedback list : new entries appear without any page refresh
- LIVE / Offline status badge showing WebSocket connection state

---

## Updated Project Structure

```
feedbackpulse/
├── frontend/
│   └── app/dashboard/
│       ├── page.js              : updated --> connectWebSocket, useRef, wsStatus, cleanup
│       └── Dashboard.module.css : updated --> feedbackHeader, statusConnected, statusDisconnected
│
└── backend/
    ├── websocket_manager.py     : NEW --> ConnectionManager + shared manager instance
    ├── routers/
    │   ├── feedback.py          : updated --> WebSocket endpoint + async broadcast
    │   ├── projects.py
    │   └── users.py
    ├── main.py
    ├── database.py
    ├── models.p|
    |
    └── schemas.py
```

---

## Core Concept : HTTP vs WebSocket

**HTTP (what we used before):**
Every request needs the client to ask first. Client sends request, server responds, connection closes. The server can never push data unprompted.

**WebSocket:**
A persistent two-way connection. Once established, either side can send data at any time. The server can push data to the browser the instant something happens.

**Why not just poll the API every second?**
Polling means 60 requests per minute even when nothing changes. Wasteful on server resources and introduces up to 1 second delay. WebSockets maintain one persistent connection and deliver data the instant it is available.

---

## Core Concept : async/await

JavaScript and Python operations that take time (API calls, database queries, WebSocket broadcasts) return Promises/coroutines. Without async handling, the entire thread would freeze while waiting.

**async** : declares a function as asynchronous. Allows `await` inside it.

**await** : pauses execution of the current function until the operation completes, then gives the resolved value. Only pauses the current function, not the entire application.

```javascript
async function fetchProjects(userId) {
  const res = await api.get(`/projects/${userId}`);
  setProjects(res.data);
}
```

Without `await`, `res` would be a Promise object, not the actual data. `res.data` would be `undefined`.

**Functional setState for async callbacks:**

```javascript
ws.onmessage = (event) => {
  const newFeedback = JSON.parse(event.data);
  setFeedback((prev) => [newFeedback, ...prev]);
};
```

The `prev =>` form always receives the current state from React. Using `setFeedback([newFeedback, ...feedback])` would use a stale closure value captured when the callback was created.

---

## File Breakdown

### `backend/websocket_manager.py`

```python
from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str):
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = []
        self.active_connections[project_id].append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        if project_id in self.active_connections:
            self.active_connections[project_id].remove(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]

    async def broadcast(self, message: dict, project_id: str):
        if project_id not in self.active_connections:
            return
        disconnected = []
        for connection in self.active_connections[project_id]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.active_connections[project_id].remove(conn)

manager = ConnectionManager()
```

**`Dict[str, List[WebSocket]]`**
Dictionary keyed by project_id. Each value is a list of WebSocket connections watching that project. Enables broadcasting only to dashboards viewing a specific project.

**`await websocket.accept()`**
WebSocket connections start as HTTP requests. The server must explicitly upgrade them to the WebSocket protocol. Without accept() the connection is immediately rejected.

**Why collect `disconnected` separately during broadcast?**
Modifying a list while iterating over it causes Python to skip elements. Collecting failed connections in a separate list during the loop and removing after is the safe pattern.

**`manager = ConnectionManager()`**
One shared instance at module level. Every file that imports `manager` gets this exact object. If each file created its own instance, their connection dictionaries would be separate and broadcast would never reach any dashboard.

---

### `backend/routers/feedback.py` : WebSocket endpoint

```python
@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await manager.connect(websocket, project_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)
```

**`@router.websocket`**
Dedicated decorator for WebSocket routes. The URL becomes `ws://localhost:8000/feedback/ws/{project_id}`.

**`while True: await websocket.receive_text()`**
Keeps the function alive so the connection stays open. Without this loop the function would return immediately and close the connection. receive_text() blocks waiting for a client message.

**`except WebSocketDisconnect`**
FastAPI raises this when the browser disconnects. Catches it to cleanly remove the connection from the manager.

---

### `backend/routers/feedback.py` : updated create_feedback

```python
async def create_feedback(feedback: FeedbackCreate, db: Session = Depends(get_db)):
    # ... existing save logic ...

    await manager.broadcast(
        {
            "id": str(db_feedback.id),
            "project_id": str(db_feedback.project_id),
            "content": db_feedback.content,
            "created_at": db_feedback.created_at.isoformat(),
        },
        str(feedback.project_id)
    )
    return db_feedback
```

**Changed `def` to `async def`** because it now uses `await` inside.

**`str()` on UUIDs, `.isoformat()` on datetime**
Python's JSON serializer cannot handle UUID or datetime objects natively. str(uuid) and .isoformat() convert them to standard strings the browser can parse.

---

### `frontend/app/dashboard/page.js` : WebSocket additions

**`useRef` for WebSocket storage**

```javascript
const wsRef = useRef(null);
```

Stores the WebSocket object without causing re-renders. If stored in useState, every connection event would unnecessarily re-render the component.

**`connectWebSocket` function**

```javascript
function connectWebSocket(projectId) {
  if (wsRef.current) {
    wsRef.current.close();
  }

  const ws = new WebSocket(`ws://localhost:8000/feedback/ws/${projectId}`);

  ws.onopen = () => setWsStatus("connected");

  ws.onmessage = (event) => {
    const newFeedback = JSON.parse(event.data);
    setFeedback((prev) => [newFeedback, ...prev]);
  };

  ws.onclose = () => setWsStatus("disconnected");
  ws.onerror = () => setWsStatus("disconnected");

  wsRef.current = ws;
}
```

Close existing connection first to prevent multiple open connections when switching projects.

**Cleanup useEffect**

```javascript
useEffect(() => {
  return () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };
}, []);
```

The returned function runs when the component unmounts. Closes the WebSocket so it does not keep running in the background after the user navigates away.

---

### `Dashboard.module.css` : status badge classes

```css
.statusConnected {
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
  padding: 3px 10px;
  border-radius: 20px;
}

.statusDisconnected {
  color: var(--text-muted);
  background: rgba(107, 114, 128, 0.15);
  padding: 3px 10px;
  border-radius: 20px;
}
```

Pill-shaped badge. Green when connected, grey when offline.

---

## Complete Real-Time Flow

```
User clicks a project on the dashboard
        |
        |
        |
        | fetchFeedback() --> GET /feedback/{projectId} loads existing entries
        |
        | connectWebSocket(projectId) --> opens ws://localhost:8000/feedback/ws/{projectId}
        |
        |
        ▼
Server accepts connection --> manager.connect() adds to active_connections[project_id]
ws.onopen fires : LIVE badge turns green
        |
        |
        ▼
User on another site submits widget feedback
POST /feedback/ --> saves to database
await manager.broadcast({...}, project_id)
        |
        |
        ▼
broadcast() iterates connections for this project
send_json() sends to each dashboard
        |
        |
        ▼
ws.onmessage fires on dashboard
JSON.parse(event.data) converts to object
setFeedback(prev => [newFeedback, ...prev])
New feedback appears at top instantly
        |
        |
        ▼
User navigates away --> cleanup useEffect closes WebSocket
WebSocketDisconnect raised on server
manager.disconnect() removes connection from list
```

---

## Errors and Possible Issues

### Error 1 : create_feedback not async when using await

**Why it happens:** Python requires `async def` before `await` can be used inside a function.
**Solution:** Change `def create_feedback` to `async def create_feedback`.

---

### Error 2 : Possible : manager not shared : broadcast reaches no one

**Why it happens:** If ConnectionManager() is instantiated inside a router file, each import creates a separate instance. WebSocket endpoint and broadcast operate on different instances with different connection dictionaries.
**Solution:** Define `manager = ConnectionManager()` once in `websocket_manager.py` at module level. Import this same object everywhere.

---

### Error 3 : Possible : stale closure in onmessage callback

**Why it happens:** Using `setFeedback([newFeedback, ...feedback])` inside onmessage captures `feedback` from the closure at creation time. If feedback was empty when the WebSocket connected, it stays empty in the closure.
**Solution:** Always use the functional form: `setFeedback(prev => [newFeedback, ...prev])`.

---

### Error 4 : Possible : multiple open connections when switching projects

**Why it happens:** Without closing the previous WebSocket before opening a new one, clicking Project A then Project B leaves two connections open. Dashboard receives broadcasts for both projects.
**Solution:** `if (wsRef.current) { wsRef.current.close() }` at the start of connectWebSocket.

---

## Commands Reference

```bash
# No new dependencies needed for WebSockets
# FastAPI supports WebSockets natively

# Start backend
cd backend
venv\Scripts\activate
uvicorn main:app --reload

# Start frontend
cd frontend
npm run dev

# Test real-time :
# 1. Open dashboard, click a project, confirm LIVE badge
# 2. Open test.html with matching project_id
# 3. Submit feedback via widget
# 4. Watch dashboard update instantly
```
