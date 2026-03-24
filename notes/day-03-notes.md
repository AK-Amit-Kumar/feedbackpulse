# Day 3 : Feedback API + Embeddable Widget

## What Was Built

- `schemas.py` : Pydantic validation schemas for API input and output
- `routers/feedback.py` : POST /feedback/ and GET /feedback/{project_id} endpoints
- `routers/projects.py` : POST /projects/, GET /projects/{user_id}, GET /projects/detail/{project_id}
- `main.py` updated : CORS middleware, static file serving, routers registered
- `static/widget.js` : embeddable feedback widget working on external HTML pages
- Full API tested via auto-generated docs at `/docs`

---

## Updated Project Structure

```
feedbackpulse/
├── frontend/
│   └── (unchanged from Day 1)
│
└── backend/
    ├── static/
    │   └── widget.js          : embeddable widget served at /static/widget.js
    ├── routers/
    │   ├── __init__.py        : makes routers/ a Python package
    │   ├── feedback.py        : POST /feedback/, GET /feedback/{project_id}
    │   └── projects.py        : POST /projects/, GET /projects/{user_id}, GET /projects/detail/{project_id}
    ├── main.py                : updated with CORS, static files, routers
    ├── database.py            : unchanged
    ├── models.py              : unchanged
    ├── schemas.py             : NEW : Pydantic input/output schemas
    └── .env                   : unchanged
```

---

## API Endpoints

```
POST   /projects/                    : create a new project
GET    /projects/{user_id}           : get all projects for a user
GET    /projects/detail/{project_id} : get a single project by id

POST   /feedback/                    : submit feedback for a project
GET    /feedback/{project_id}        : get all feedback for a project

GET    /static/widget.js             : serves the embeddable widget file
GET    /docs                         : auto-generated interactive API documentation
```

---

## File Breakdown

### `backend/schemas.py`

```python
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

class FeedbackCreate(BaseModel):
    project_id: UUID
    content: str

class FeedbackResponse(BaseModel):
    id: UUID
    project_id: UUID
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    name: str
    user_id: UUID

class ProjectResponse(BaseModel):
    id: UUID
    name: str
    user_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True
```

**Why `schemas.py` separate from `models.py`?**
`models.py` defines database structure : how data is stored. `schemas.py` defines API structure : how data travels in and out. A database model may have 20 columns but the API might only expose 5. Keeping them separate gives full control over what is accepted as input and what is returned as output without leaking internal database structure.

**`BaseModel`**
All Pydantic schemas inherit from `BaseModel`. This gives automatic validation, type checking, and JSON serialization for free.

**Two schema types per resource:**
`FeedbackCreate` : what the API accepts as INPUT (project_id + content only).
`FeedbackResponse` : what the API returns as OUTPUT (all fields including auto-generated id and created_at).

**`class Config: from_attributes = True`**
By default Pydantic only reads from dictionaries. SQLAlchemy returns objects not dicts. This setting tells Pydantic to read from object attributes too so it can convert a SQLAlchemy `Feedback` object directly into a `FeedbackResponse` schema without any manual conversion.

---

### `backend/routers/__init__.py`

An empty file. Its presence tells Python to treat the `routers/` folder as a package. Without it, `from routers import feedback` in `main.py` fails because Python does not recognise `routers` as an importable module.

---

### `backend/routers/feedback.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Feedback, Project
from schemas import FeedbackCreate, FeedbackResponse
from typing import List
from uuid import UUID

router = APIRouter(prefix="/feedback", tags=["feedback"])

@router.post("/", response_model=FeedbackResponse)
def create_feedback(feedback: FeedbackCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == feedback.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_feedback = Feedback(
        project_id=feedback.project_id,
        content=feedback.content
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback

@router.get("/{project_id}", response_model=List[FeedbackResponse])
def get_feedback(project_id: UUID, db: Session = Depends(get_db)):
    feedback_list = db.query(Feedback).filter(
        Feedback.project_id == project_id
    ).all()
    return feedback_list
```

**`router = APIRouter(prefix="/feedback", tags=["feedback"])`**
Creates the router. `prefix="/feedback"` means every route in this file automatically gets `/feedback` prepended. `@router.post("/")` becomes `POST /feedback/`. `tags=["feedback"]` groups these endpoints under a feedback section in the `/docs` page.

**`@router.post("/", response_model=FeedbackResponse)`**
Registers a POST route at `/feedback/`. `response_model=FeedbackResponse` tells FastAPI to filter the return value through the schema before sending. Only fields defined in the schema are returned and the response is automatically serialized to JSON.

**`feedback: FeedbackCreate`**
FastAPI reads the incoming JSON body and validates it against `FeedbackCreate` automatically. If `content` is missing or `project_id` is not a valid UUID, FastAPI returns a 422 error before this function runs.

**`db: Session = Depends(get_db)`**
Dependency injection. FastAPI calls `get_db()`, gets a database session, and passes it as `db`. The session is automatically closed after the endpoint finishes even if an error occurs.

**`db.query(Project).filter(Project.id == feedback.project_id).first()`**
Builds and executes: `SELECT * FROM projects WHERE id = 'uuid' LIMIT 1`. Returns one project object or `None`. Checking for the project before inserting gives a human-readable 404 instead of a cryptic database foreign key error.

**`db.add(db_feedback)`**
Stages the object. Tells SQLAlchemy to queue this row for insertion. Nothing is written to the database yet.

**`db.commit()`**
Executes the actual INSERT SQL. This is the exact moment the data is permanently saved in PostgreSQL.

**`db.refresh(db_feedback)`**
After committing, the Python object in memory is stale. The database assigned it an auto-generated `id` and `created_at` but the Python object does not know this yet. `refresh()` re-fetches the row so the returned object has all fields populated.

**`@router.get("/{project_id}", response_model=List[FeedbackResponse])`**
`{project_id}` is a path parameter. Whatever UUID appears in the URL is captured and passed to the function. `List[FeedbackResponse]` tells FastAPI the response is a list of feedback objects. `.all()` returns every matching row unlike `.first()` which returns only one.

---

### `backend/routers/projects.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Project
from schemas import ProjectCreate, ProjectResponse
from typing import List
from uuid import UUID

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(
        name=project.name,
        user_id=project.user_id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/{user_id}", response_model=List[ProjectResponse])
def get_projects(user_id: UUID, db: Session = Depends(get_db)):
    projects = db.query(Project).filter(
        Project.user_id == user_id
    ).all()
    return projects

@router.get("/detail/{project_id}", response_model=ProjectResponse)
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
```

**`project.name` and `project.user_id` (lowercase p)**
`project` (lowercase) is the Pydantic schema instance carrying values from the request body. `Project` (uppercase) is the SQLAlchemy model class. A very common mistake is using `Project.name` (the class attribute) instead of `project.name` (the instance value) which results in `None` being passed to the database and broken SQL being generated.

**`GET /projects/detail/{project_id}` instead of `GET /projects/{project_id}`**
`GET /projects/{user_id}` already exists on this router. Both `/{user_id}` and `/{project_id}` look identical to the router : they are both `/{uuid}`. FastAPI would not know which one to call. Adding `/detail/` makes the patterns distinct. Route patterns on the same router must never conflict.

---

### `backend/main.py` (updated)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine
import models
from routers import feedback, projects

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FeedbackPulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(feedback.router)
app.include_router(projects.router)

@app.get("/")
def root():
    return {"message": "FeedbackPulse API is running"}
```

**`CORSMiddleware`**
CORS stands for Cross-Origin Resource Sharing. Browsers block requests between different origins by default. This middleware tells the browser which origins are allowed to call the API. Without it the Next.js frontend at `localhost:3000` cannot call the FastAPI backend at `localhost:8000`.

**`allow_origins=["*"]`**
Allows any origin to call the API. Required because the widget runs on third-party websites whose domains are unknown in advance.

**`app.mount("/static", StaticFiles(directory="static"), name="static")`**
For any request starting with `/static`, FastAPI skips all Python code and returns the file directly from the `static/` folder. Requires `aiofiles` installed because FastAPI uses async file reading.

**`app.include_router(feedback.router)`**
Registers all routes defined in `feedback.py` with the main app. Without this line FastAPI does not know those endpoints exist.

---

### `backend/static/widget.js`

```javascript
(function () {
  const API_URL = "http://localhost:8000";

  function createWidget(projectId) {
    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      background: white; border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      padding: 20px; width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 9999; border: 1px solid #f0f0f0;
    `;

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <p style="margin:0; font-weight:600; font-size:15px;">Share your feedback</p>
        <button id="fp-close" style="background:none; border:none; font-size:18px; cursor:pointer;">x</button>
      </div>
      <textarea id="fp-content" rows="3" placeholder="What's on your mind?"
        style="width:100%; padding:10px; border:1px solid #e0e0e0; border-radius:8px;
        font-size:14px; resize:none; box-sizing:border-box;"></textarea>
      <button id="fp-submit"
        style="margin-top:10px; width:100%; padding:10px; background:#4F46E5;
        color:white; border:none; border-radius:8px; font-size:14px; cursor:pointer;">
        Submit feedback
      </button>
      <p id="fp-msg" style="margin:8px 0 0; font-size:13px; color:#0F6E56; display:none;">
        Thanks for your feedback!
      </p>
      <p id="fp-err" style="margin:8px 0 0; font-size:13px; color:#A32D2D; display:none;">
        Something went wrong. Please try again.
      </p>
    `;

    document.body.appendChild(container);

    document.getElementById("fp-close").addEventListener("click", function () {
      container.style.display = "none";
    });

    document
      .getElementById("fp-submit")
      .addEventListener("click", async function () {
        const content = document.getElementById("fp-content").value.trim();
        const successMsg = document.getElementById("fp-msg");
        const errorMsg = document.getElementById("fp-err");
        const submitBtn = document.getElementById("fp-submit");

        if (!content) {
          document.getElementById("fp-content").style.borderColor = "#E24B4A";
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";

        try {
          const response = await fetch(`${API_URL}/feedback/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: projectId, content: content }),
          });

          if (response.ok) {
            successMsg.style.display = "block";
            errorMsg.style.display = "none";
            document.getElementById("fp-content").value = "";
            submitBtn.textContent = "Submit feedback";
            submitBtn.disabled = false;
          } else {
            throw new Error("Server returned " + response.status);
          }
        } catch (err) {
          errorMsg.style.display = "block";
          successMsg.style.display = "none";
          submitBtn.textContent = "Submit feedback";
          submitBtn.disabled = false;
          console.error("FeedbackPulse error:", err);
        }
      });
  }

  window.FeedbackPulse = { init: createWidget };
})();
```

**`(function () { ... })()`**
IIFE : Immediately Invoked Function Expression. Creates a private scope. All variables inside are invisible to the outside world. Prevents naming conflicts with the host website's existing JavaScript. Standard pattern for all third-party embeddable scripts including Google Analytics, Intercom, and Hotjar.

**`document.createElement("div")`**
Creates a new HTML element in memory. Does not appear on the page yet.

**`document.body.appendChild(container)`**
The exact moment the widget appears visually on the page. Before this line it exists only in memory.

**`position: fixed`**
Keeps the widget in the corner even when the user scrolls the page.

**`z-index: 9999`**
Renders the widget on top of everything else on the host page.

**`container.innerHTML`**
Injects the complete HTML structure in one step. All styles are inline so the widget looks consistent regardless of the host website's own CSS.

**`submitBtn.disabled = true`**
Prevents double submits. Without this a user could click submit multiple times and create duplicate feedback entries before the API responds.

**`fetch(API_URL + "/feedback/", { method: "POST", ... })`**
The browser's built-in function for HTTP requests. Sends the feedback to the FastAPI endpoint asynchronously. `await` pauses execution until the response comes back.

**`JSON.stringify({ project_id: projectId, content: content })`**
Converts a JavaScript object to a JSON string. `fetch` only sends strings not objects.

**`response.ok`**
`true` for HTTP status codes 200 to 299. If the API returns an error code it throws an Error caught by the `catch` block.

**`window.FeedbackPulse = { init: createWidget }`**
Exposes the widget globally. Without this line `createWidget` is locked inside the IIFE's private scope and inaccessible from external scripts.

**How users embed the widget:**

```html
<script src="https://yourapp.com/static/widget.js"></script>
<script>
  FeedbackPulse.init("their-project-id");
</script>
```

---

## Core Concepts

### Pydantic Schemas

Validates incoming request data before your code runs. If a required field is missing or the wrong type, automatically returns a 422 error. No manual validation code needed.

### APIRouter

A mini FastAPI app with its own routes registered into the main app via `include_router()`. Splits a large API into manageable feature files.

### Dependency Injection with Depends()

FastAPI calls `get_db()` and passes the session automatically. The session closes after the endpoint finishes regardless of success or failure.

### CORS Middleware

Tells the browser which origins can call the API. Required for the widget to work on third-party websites and for the frontend to call the backend.

### Static File Serving

`app.mount()` tells FastAPI to serve files from a folder directly at a URL prefix. No Python code runs for static file requests.

### IIFE Pattern

Wrapping widget code in an immediately invoked function creates private scope. Prevents naming conflicts with the host website. Standard for all third-party embeddable scripts.

---

## Request Flow : Widget to Database

```
User submits feedback on a third-party website
        |
        |
Widget calls POST /feedback/ via fetch()
        |
        |
Browser checks CORS --> CORSMiddleware permits the request
        |
        |
FastAPI routes to feedback.router --> calls create_feedback()
        |
        |
Pydantic validates request body against FeedbackCreate
        |
        |
FastAPI injects database session via Depends(get_db)
        |
        |
create_feedback() checks project exists --> raises 404 if not
        |
        |
Feedback object created --> db.add() --> db.commit() --> db.refresh()
        |
        |
FastAPI serializes through FeedbackResponse --> returns JSON 200
        |
        |
Widget shows success message to user
        |
        |
Database session closed in finally block
```

---

## Errors Encountered

### Error 1 : 500 Internal Server Error : invalid reference to FROM-clause entry

```
sqlalchemy.exc.ProgrammingError: invalid reference to FROM-clause entry for table "projects"
INSERT INTO projects VALUES (%(id)s::UUID, projects.user_id, projects.name, ...)
```

**Why it happened:**
`DateTime` columns were not timezone-aware. When SQLAlchemy inserted a timezone-aware Python datetime into a `DateTime` (no timezone) column it generated broken SQL referencing the table name instead of the actual values.

**Solution:**
Change all `DateTime` columns to `DateTime(timezone=True)`. Drop and recreate all tables in Supabase since the column type changed.

**Key lesson:**
Always use `DateTime(timezone=True)`. Timezone mismatch errors are deceptive because the error message points to SQL syntax rather than the root cause.

---

### Error 2 : 500 Internal Server Error : ForeignKeyViolation

```
sqlalchemy.exc.IntegrityError: insert or update on table "projects" violates
foreign key constraint. Key (user_id) is not present in table "users".
```

**Why it happened:**
A fake test UUID was used as `user_id`. That user did not exist in the users table. The foreign key constraint correctly rejected the insert.

**Solution:**
Insert a real test user into Supabase first, then use that user's actual id when creating a project.

**Key lesson:**
Always create parent records before child records. Users before projects. Projects before feedback.

---

### Error 3 : null value in column "id" violates not-null constraint

```
ERROR: 23502: null value in column "id" of relation "users" violates not-null constraint
```

**Why it happened:**
`default=uuid.uuid4` in the SQLAlchemy model runs in Python. When inserting directly via Supabase UI, Python is bypassed and PostgreSQL receives no instruction to generate a UUID.

**Solution:**
When inserting test data via Supabase UI, manually generate and paste a UUID from uuidgenerator.net into the id field.

**Key lesson:**
Python defaults only run through SQLAlchemy. PostgreSQL `server_default` runs everywhere. For fields that need auto-generation outside of SQLAlchemy, set both.

---

### Error 4 : server closed the connection unexpectedly

```
sqlalchemy.exc.OperationalError: server closed the connection unexpectedly
```

**Why it happened:**
Supabase free tier closes idle connections. SQLAlchemy tried to reuse a pooled connection that had been silently closed.

**Solution:**
Add `pool_pre_ping=True`, `pool_recycle=300`, `pool_size=5`, `max_overflow=0` to `create_engine()` in `database.py`.

**Key lesson:**
Always configure connection pool settings for hosted cloud databases. `pool_pre_ping` is essential.

---

### Error 5 : Project.name vs project.name

```
INSERT INTO projects VALUES (%(id)s::UUID, projects.user_id, projects.name, ...)
```

**Why it happened:**
`Project.name` (the class) was used instead of `project.name` (the Pydantic instance). SQLAlchemy received `None` for both fields.

**Solution:**
Change `Project.name` to `project.name` and `Project.user_id` to `project.user_id` inside `create_project()`.

**Key lesson:**
`Project` (capital P) is the class. `project` (lowercase p) is the instance carrying request data. Always verify which one you are reading from.

---

## Commands Reference

```bash
# Install new dependency for static files
pip install aiofiles

# Start backend
cd backend
venv\Scripts\activate
uvicorn main:app --reload

# View auto-generated API docs
# Visit http://localhost:8000/docs in browser
```
