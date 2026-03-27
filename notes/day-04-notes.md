# Day 4 : Dashboard UI + User Sync

## What Was Built

- `lib/api.js` : centralized Axios API client with base URL
- `lib/useCurrentUser.js` : custom hook extracting Clerk user data
- `routers/users.py` : POST /users/sync endpoint for automatic user creation
- `schemas.py` updated : UserCreate and UserResponse schemas added
- `dashboard/page.js` : full dashboard UI connecting frontend to backend API
- `Dashboard.module.css` : complete purple dark theme matching FeedbackPulse logo
- Copy to clipboard button on embed snippet with checkmark visual feedback

---

## Updated Project Structure

```
feedbackpulse/
├── frontend/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js
│   │   └── dashboard/
│   │       ├── page.js              : full dashboard UI
│   │       └── Dashboard.module.css : purple dark theme
│   ├── lib/
│   │   ├── api.js                   : NEW : Axios instance with base URL
│   │   └── useCurrentUser.js        : NEW : custom Clerk user hook
│   ├── public/
│   │   └── FeedbackPulse_Logo.png
│   ├── middleware.js
│   └── .env.local
│
└── backend/
    ├── routers/
    │   ├── __init__.py
    │   ├── feedback.py
    │   ├── projects.py
    │   └── users.py                 : NEW : /users/sync endpoint
    ├── main.py
    ├── database.py
    ├── models.py
    ├── schemas.py                   : updated with UserCreate, UserResponse
    └── .env
```

---

## File Breakdown

### `frontend/lib/api.js`

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

export default api;
```

**Why a centralized API file?**
Every component that calls the backend imports this single instance. The base URL is defined once. When deploying to production, changing `NEXT_PUBLIC_API_URL` in the environment variables updates every API call automatically without touching any component.

**Why Axios over fetch()?**
Axios automatically parses JSON responses and throws errors for non-2xx status codes. fetch() requires manually calling `.json()` and manually checking `response.ok`. Axios is cleaner and has fewer footguns.

---

### `frontend/lib/useCurrentUser.js`

```javascript
import { useUser } from "@clerk/nextjs";

export function useCurrentUser() {
  const { user, isLoaded } = useUser();

  return {
    clerkId: user?.id,
    email: user?.emailAddresses[0]?.emailAddress,
    isLoaded,
  };
}
```

**Why a custom hook?**
Clerk's `useUser()` returns the full Clerk user object with dozens of fields. This hook extracts only `clerkId`, `email`, and `isLoaded` — the three values the dashboard needs. Components stay clean and the extraction logic is in one place.

**Why `user?.id` with optional chaining?**
Clerk loads asynchronously. On first render `user` is `null`. `?.` returns `undefined` instead of throwing `TypeError: Cannot read properties of null`. Safe access without try/catch.

---

### `backend/routers/users.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import UserCreate, UserResponse

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/sync", response_model=UserResponse)
def sync_user(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(
        User.clerk_id == user.clerk_id
    ).first()

    if existing_user:
        return existing_user

    db_user = User(
        clerk_id=user.clerk_id,
        email=user.email
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user
```

**Why `/sync` instead of a standard POST `/users/`?**
This endpoint is idempotent : calling it with the same `clerk_id` ten times produces the same result. Standard POST implies "always create a new record" which would fail on the second call due to the `unique=True` constraint on `clerk_id`. The name `sync` communicates the idempotent intent clearly.

**Why check for existing user before creating?**
The dashboard calls this endpoint every time it loads. Without the check, every page refresh would attempt to create a duplicate user and throw an `IntegrityError`.

---

### `frontend/app/dashboard/page.js` : Key Patterns

**`'use client'` directive**
Must be the first line. Marks the component as browser-rendered. Required because `useState`, `useEffect`, and event handlers are browser-only APIs. Next.js App Router renders components on the server by default.

**State declarations**

```javascript
const [user, setUser] = useState(null);
const [projects, setProjects] = useState([]);
const [selectedProject, setSelectedProject] = useState(null);
const [feedback, setFeedback] = useState([]);
const [newProjectName, setNewProjectName] = useState("");
const [copied, setCopied] = useState(false);
const [loading, setLoading] = useState(true);
```

Each piece of UI-affecting data has its own state. When any setter is called, React re-renders the component with the updated value.

**useEffect with dependency array**

```javascript
useEffect(() => {
  if (!isLoaded || !clerkId) return;
  syncUser();
}, [isLoaded, clerkId]);
```

Runs after render whenever `isLoaded` or `clerkId` changes. The guard clause prevents running before Clerk has loaded. Without the dependency array, this would run after every single render causing an infinite loop.

**Optimistic project list update**

```javascript
setProjects([...projects, res.data]);
```

Appends the new project to existing state using spread syntax instead of re-fetching all projects from the API. Faster UI, one fewer network request.

**Controlled input**

```javascript
value={newProjectName}
onChange={(e) => setNewProjectName(e.target.value)}
```

The input value is always driven by React state. React owns the input value. This pattern is called a controlled component.

**Copy to clipboard**

```javascript
async function copyEmbedCode(projectId) {
  const code = `...snippet...`;
  await navigator.clipboard.writeText(code);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}
```

`navigator.clipboard.writeText()` copies text to the system clipboard. `setCopied(true)` immediately shows the checkmark SVG. `setTimeout` resets it after 2 seconds.

**Conditional SVG rendering**

```javascript
{
  copied ? <checkmarkSVG /> : <copySVG />;
}
```

React swaps the icons automatically when `copied` state changes. No DOM manipulation needed.

**CSS Modules conditional classes**

```javascript
className={`${styles.projectCard} ${selectedProject?.id === project.id ? styles.projectCardActive : ''}`}
```

Template literal combines the base class with a conditional active class. CSS Modules scopes both to this component automatically.

---

### `Dashboard.module.css` : Theme Architecture

The stylesheet uses CSS custom properties defined in `:root` for every color value. This means the entire color theme can be changed by updating the variables section only.

**Color variables sourced from the FeedbackPulse logo:**

```css
--bg-base: #0d0b1e: deep dark background matching logo
  --bg-surface: #1a1530: card surfaces --primary: #7c3aed: main purple from logo
  icon --primary-light: #a855f7: lighter purple from logo gradient
  --primary-glow: rgba(124, 58, 237, 0.25): transparent purple for shadows;
```

**Key CSS patterns used:**

`radial-gradient` on `.container` : creates the atmospheric purple glow in corners matching the logo background.

`-webkit-background-clip: text` on `.logoArea h1` : makes the text itself display the gradient rather than filling a background behind text.

`:focus-within` on `.createSection` : the entire card border glows when the input inside receives focus. No JavaScript needed.

`::before` pseudo-element on `.projectCard` : the left purple accent bar. Always present in DOM but `opacity: 0` makes it invisible. `opacity: 1` on active state reveals it without layout shift.

`currentColor` on SVG strokes : SVG icons inherit the parent button's `color` CSS property, so icon color changes are controlled purely from CSS hover states.

---

## Core Concepts

### useState

Stores a value inside a React component that persists between renders. Calling the setter triggers a re-render with the new value. Regular JavaScript variables reset on every render.

### useEffect

Runs code after render. The dependency array controls when it re-runs. Empty array `[]` : runs once after first render. Populated array : runs when those values change. No array : runs every render (almost never wanted).

### CSS Modules

Scoped CSS files. Each class becomes a property on the imported styles object. Next.js transforms class names to unique identifiers at build time preventing conflicts across components.

### Idempotent endpoint

An endpoint that produces the same result regardless of how many times it is called with the same input. The `/users/sync` endpoint either creates a user or returns the existing one.

### Controlled input

An HTML input whose value is always driven by React state via `value` and `onChange`. React owns the input value completely.

### Clipboard API

`navigator.clipboard.writeText(string)` : browser built-in that copies text to the system clipboard. Returns a Promise. Works on HTTPS or localhost only.

---

## Data Flow

```
User visits /dashboard
        |
        | middleware.js checks Clerk auth
        |
        ▼
Dashboard renders --> loading=true shows loading screen
        |
        | useCurrentUser hook waits for Clerk
        |
        ▼
isLoaded becomes true, clerkId populated
useEffect fires --> calls syncUser()
        |
        ▼
POST /users/sync --> backend checks existing user
Creates or returns existing database user
        |
        ▼
setUser(res.data) --> user in state
fetchProjects(res.data.id) called
        |
        ▼
GET /projects/{userId} --> returns user's projects
setProjects --> projects list renders
setLoading(false) --> loading screen removed
        |
        ▼
User clicks project --> fetchFeedback(project) called
GET /feedback/{projectId} --> feedback list renders
Embed snippet shows with copy button
        |
        ▼
User clicks copy button
navigator.clipboard.writeText() copies snippet
setCopied(true) --> checkmark shows for 2 seconds
```

---

## Errors Encountered

### Error 1 : className confusion : curly braces vs plain string

**Why it happens:**
CSS Modules requires `className={styles.container}` (JavaScript expression in curly braces) because `styles` is a JavaScript object. Writing `className="container"` passes a literal string that has no corresponding scoped CSS class.

**Solution:**
Always use curly braces with CSS Modules. Plain strings work only with global CSS or Tailwind where class names are literal strings.

**Key lesson:**
In JSX, curly braces mean "evaluate this as JavaScript". Text outside curly braces is treated as a literal string.

---

### Error 2 : Possible : useEffect running before Clerk loads

**Why it happens:**
Clerk loads asynchronously. On first render `clerkId` is `undefined`. Without a guard, `syncUser()` runs with `undefined` as the clerk_id and the API call fails.

**Solution:**
Add `if (!isLoaded || !clerkId) return` at the start of the useEffect callback.

**Key lesson:**
Never assume async data is ready on first render. Always guard with loading state checks.

---

### Error 3 : Possible : infinite re-render loop

**Why it happens:**
Calling a setState function directly in the component body (outside useEffect) triggers a re-render which calls setState again, infinitely.

**Solution:**
Always put API calls and state updates inside useEffect with a proper dependency array.

**Key lesson:**
useEffect with an empty dependency array `[]` runs once. Without any array it runs every render. With a dependency array it runs when those values change.

---

## Commands Reference

```bash
# Install Axios in frontend
cd frontend
npm install axios

# Start backend
cd backend
venv\Scripts\activate
uvicorn main:app --reload

# Start frontend
cd frontend
npm run dev
```
