# Day 1 — Project Setup + Authentication

## What Was Built
- Next.js frontend running at `localhost:3000`
- FastAPI backend running at `localhost:8000`
- Clerk authentication integrated — login, signup, protected `/dashboard` route working

---

## Project Structure

```
feedbackpulse/
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── layout.js          # Root layout — ClerkProvider wraps entire app
│   │   ├── page.js            # Homepage
│   │   └── dashboard/
│   │       └── page.js        # Protected dashboard page
│   ├── middleware.js           # Route protection — runs before every page load
│   └── .env.local             # Clerk API keys (never commit)
│
└── backend/                   # FastAPI app
    ├── venv/                  # Python virtual environment (never commit)
    └── main.py                # Entry point
```

---

## File Breakdown

### `backend/main.py`

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "FeedbackPulse backend is running"}
```

**`from fastapi import FastAPI`**
Imports the FastAPI class. This brings in all the tools needed to build the API.

**`app = FastAPI()`**
Creates the application instance. This `app` object is what uvicorn runs — it is the entire backend.

**`@app.get("/")`**
A decorator that registers a route. When someone sends a GET request to `/`, run the function below. GET is the HTTP method used when a browser visits a URL.

**`def root()`**
Returns a Python dictionary which FastAPI automatically converts to JSON and sends back as the response.

---

### `frontend/app/layout.js`

```javascript
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
```

**`ClerkProvider`**
Wraps the entire app. React uses "context" to share data between components without passing it manually through props. `ClerkProvider` injects auth state (is user logged in? who are they?) into this context so any component anywhere in the app can access it.

**`{children}`**
Whatever page is currently being rendered inside this layout. The layout is the frame — children is the picture inside it. Every page in the app renders inside this wrapper.

**Why `layout.js`?**
In Next.js App Router, `layout.js` is the root wrapper of the entire app. Anything placed here applies to every page automatically. The perfect place for providers like Clerk.

---

### `frontend/middleware.js`

```javascript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
```

**`createRouteMatcher(['/dashboard(.*)'])`**
Creates a function that checks if the current URL matches `/dashboard` or anything under it. The `(.*)` is a regex pattern meaning "anything after /dashboard" — so `/dashboard/settings` is also protected.

**Why middleware instead of inside the page?**
Middleware runs on every request *before* the page loads — like a security guard at the door. If someone tries to visit `/dashboard` without being logged in, they are redirected before any page code runs. If the check lived inside the page, the page would partially load first.

**`auth.protect()`**
If the user is not logged in, automatically redirects to Clerk's login page. No manual redirect code needed.

**`config.matcher`**
Tells Next.js which routes to run this middleware on. The regex means: run on all routes except Next.js internal files (`_next`) and static assets like images and CSS. Without this, middleware would run wastefully on every asset request.

---

### `frontend/app/dashboard/page.js`

```javascript
import { UserButton } from '@clerk/nextjs'

export default function Dashboard() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>FeedbackPulse Dashboard</h1>
      <UserButton />
    </div>
  )
}
```

**`UserButton`**
Pre-built Clerk component. Shows the logged-in user's avatar. When clicked, opens a dropdown with profile settings and sign-out. Zero code required.

**`export default`**
Next.js requires every `page.js` file to have a default export. This is the component Next.js renders when someone visits the corresponding route.

**Why a `dashboard/` folder?**
In Next.js App Router, folders map directly to URL routes. A file at `app/dashboard/page.js` automatically becomes the page at `localhost:3000/dashboard`. No routing configuration needed.

---

## Core Concepts

### Next.js
A framework built on top of React. Adds file-based routing (folders = URLs), server-side capabilities, and built-in optimisations. Industry standard for SaaS frontends.

**Why Next.js over plain React?**
Plain React only handles UI. Next.js adds routing, server rendering, API routes, and performance optimisations out of the box. No separate router library needed.

### FastAPI
A modern Python framework for building APIs. When the frontend needs data, it sends a request to FastAPI. FastAPI processes it and sends back a response.

**Why FastAPI?**
Faster than Flask and Django for APIs. Auto-generates interactive documentation at `/docs`. Built for modern Python — async support, type hints, automatic validation.

### Clerk
Authentication as a service. Handles login pages, signup, sessions, password reset, and OAuth. Plug it in and it works.

**Why Clerk instead of building auth from scratch?**
Building auth is complex and risky — sessions, token rotation, hashed passwords, OAuth flows. Clerk solves all of this in minutes. Shows you know how to pick the right tools — which is exactly what employers look for.

---

## Environment Variables

### `frontend/.env.local`
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

**`NEXT_PUBLIC_` prefix** — makes the variable accessible in the browser. Without the prefix, the variable is server-only. The publishable key needs to be in the browser. The secret key must never be in the browser.

**Why `.env.local` and not hardcoded?**
If API keys are in the code and you push to GitHub, anyone can see and misuse them. `.env.local` is automatically ignored by Git.

---

## Errors Encountered

### Error 1 — Could not import module "main"
```
ERROR: Error loading ASGI app. Could not import module "main".
```

**Why it happened:**
`main.py` was created inside the `venv/` folder instead of directly in `backend/`. Uvicorn looks for `main.py` in the current directory — it was in the wrong place.

**Solution:**
Navigate back to `backend/` with `cd ..` and create `main.py` there. The `venv/` folder is only for Python packages — your code never goes inside it.

**Key lesson:**
Always check your terminal path before creating files. Your code lives in `backend/` — `venv/` is hands-off.

---

### Error 2 — Missing `src/` folder confusion
**Why it happened:**
`create-next-app` can generate projects with or without a `src/` folder depending on the options selected. This caused confusion about where to place files.

**Solution:**
If no `src/` folder exists, files go directly in `app/` and `middleware.js` goes in the `frontend/` root. The structure works identically either way.

**Key lesson:**
Always check your actual folder structure before placing files. Don't assume — verify.

---

## How Everything Connects

```
User visits localhost:3000/dashboard
        ↓
middleware.js runs — checks if user is logged in via Clerk
        ↓
Not logged in → redirected to Clerk login page
Logged in → dashboard page loads
        ↓
Dashboard renders with UserButton showing logged-in user's avatar
        ↓
Future: dashboard calls FastAPI (localhost:8000) to fetch data
```

---

## Commands Reference

```bash
# Start backend
cd backend
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux
uvicorn main:app --reload

# Start frontend
cd frontend
npm run dev
```
