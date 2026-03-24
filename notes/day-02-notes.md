# Day 2 : Database Setup + SQLAlchemy

## What Was Built
- PostgreSQL database created on Supabase (cloud hosted)
- Three tables created : users, projects, feedback
- FastAPI connected to database via SQLAlchemy
- `database.py` and `models.py` created with full relational schema

---

## Updated Project Structure

```
feedbackpulse/
├── frontend/
│   └── (unchanged from Day 1)
│
└── backend/
    ├── venv/
    ├── main.py                # Updated : imports models, creates tables on startup
    ├── database.py            # NEW : DB connection, engine, session factory
    ├── models.py              # NEW : SQLAlchemy table definitions
    └── .env                   # NEW : DATABASE_URL stored here (never commit)
```

---

## Database Schema

```
USERS                    PROJECTS                 FEEDBACK
:::::::::::::::::        :::::::::::::::::        :::::::::::::::::
id (PK, UUID)    ::┐     id (PK, UUID)    ::┐    id (PK, UUID)
clerk_id              └::► user_id (FK)        └::► project_id (FK)
email                    name                     content
created_at               created_at               created_at
```

PK : Primary Key (unique identifier for each row)
FK : Foreign Key (points to the primary key of another table)
One user can have many projects. One project can have many feedback entries.

---

## File Breakdown

### `backend/.env`

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@[host]:6543/postgres
```

**Why a `.env` file?**
The database URL contains your password. Storing it in code and pushing to GitHub exposes it to everyone. Python's `python-dotenv` library reads this file and makes the value available to your code at runtime without it ever appearing in source files.

**Why no quotes around the value?**
`python-dotenv` reads values literally. Quotes become part of the value and break the connection string.

---

### `backend/database.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=0
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**`load_dotenv()`**
Reads the `.env` file and loads all variables into the environment. Must be called before `os.getenv()` or the values will be `None`.

**`os.getenv("DATABASE_URL")`**
Fetches the value of `DATABASE_URL` from the environment. The actual connection string never appears in the code itself.

**`create_engine(DATABASE_URL, ...)`**
Creates the connection bridge between Python and PostgreSQL. Manages a connection pool internally so the server reuses existing connections instead of opening a new one for every request.

**`pool_pre_ping=True`**
Before using any connection from the pool, SQLAlchemy sends a quick ping to the database. If the connection was dropped (Supabase closes idle connections on the free tier), it automatically creates a fresh one. This is the most critical setting for hosted databases.

**`pool_recycle=300`**
Recycles connections every 300 seconds (5 minutes). Prevents SQLAlchemy from ever holding a connection longer than Supabase's idle timeout.

**`SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)`**
A factory for creating database sessions. A session is a unit of work : open it, do operations, commit or rollback, then close it. `autocommit=False` means changes must be explicitly committed. This gives you control : if something goes wrong midway, you can roll back everything.

**`Base = declarative_base()`**
Creates the base class that all database model classes inherit from. This is how SQLAlchemy knows which Python classes represent database tables.

**`def get_db()`**
A dependency function used by FastAPI endpoints. Creates a session, yields it to the endpoint via `yield`, and closes it automatically in the `finally` block when the endpoint finishes. The `finally` block runs even if an error occurs, preventing connection leaks.

---

### `backend/models.py`

```python
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from database import Base
import uuid
from datetime import datetime, timezone

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

**`class User(Base)`**
Declaring a Python class that inherits from `Base` tells SQLAlchemy : this class represents a database table.

**`__tablename__ = "users"`**
The exact name of the table in PostgreSQL. Required. Without it SQLAlchemy cannot map the class to the correct table.

**`Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`**
UUID is a type of ID that looks like `a3f8c2d1-4b5e-...`. Globally unique, impossible to guess. Better than auto-incrementing integers for SaaS apps where IDs may be exposed in URLs. `default=uuid.uuid4` tells SQLAlchemy to auto-generate a new UUID in Python when a new row is created.

**`unique=True`**
No two rows can have the same value in this column. The database rejects any insert that violates this.

**`nullable=False`**
This column cannot be empty. The database rejects any insert that omits this field.

**`ForeignKey("users.id")`**
Creates a relationship between tables. `user_id` in the Project table points to `id` in the users table. PostgreSQL enforces this : you cannot create a project with a `user_id` that does not exist in the users table. This protects data integrity at the database level.

**`DateTime(timezone=True)`**
Timezone-aware datetime column. PostgreSQL is strict about this. Using `DateTime` without `timezone=True` and inserting a timezone-aware Python datetime causes SQLAlchemy to generate broken SQL that references the table name instead of the actual value.

**`default=lambda: datetime.now(timezone.utc)`**
Automatically sets the timestamp to the current UTC time when a row is created. Using UTC is best practice : users can be anywhere in the world. Always store in UTC, convert to local time only when displaying.

---

### `backend/main.py` (updated)

```python
from fastapi import FastAPI
from database import engine
import models

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

@app.get("/")
def root():
    return {"message": "FeedbackPulse backend is running"}
```

**`models.Base.metadata.create_all(bind=engine)`**
Runs on every server start. Reads all model classes registered with `Base`, generates `CREATE TABLE` SQL for any missing tables, and executes them against the database. Safe to run repeatedly : it never drops or modifies existing tables.

**`import models`**
Even though `models` is not used directly in this file, importing it causes Python to execute `models.py`, which registers all three model classes with `Base`. Without this import, `Base.metadata` would be empty and no tables would be created.

---

## Core Concepts

### PostgreSQL
A relational database where data is stored in tables with rows and columns. Tables are linked using foreign keys. The most widely used open-source relational database. Industry standard for production SaaS applications.

**Why PostgreSQL?**
Battle-tested, handles large scale, free, and supported by virtually every cloud platform. Supabase hosts it so no server management is needed.

### SQLAlchemy ORM
ORM stands for Object Relational Mapper. Converts Python classes to database tables and Python objects to rows. You write Python : SQLAlchemy generates and runs the SQL.

**Why ORM instead of raw SQL?**
Raw SQL is prone to errors and injection vulnerabilities. With SQLAlchemy, your database structure is Python code. Type safety, autocomplete, and refactoring all work naturally. Changes to models are tracked in code.

### One-to-Many Relationships
One user can have many projects. One project can have many feedback entries. Foreign keys enforce this at the database level, not just in application code.

**Why normalize into separate tables?**
Storing everything in one table means repeating the user's email on every single feedback row. Separate related tables eliminate repetition, reduce errors, and make queries faster.

### Supabase
A service that hosts PostgreSQL in the cloud. Provides a connection URL, a visual table editor, and a free tier sufficient for any side project or portfolio piece.

**Why the pooler connection string?**
Supabase has two connection modes : direct (legacy, `db.xxxx.supabase.co`) and pooler (current, `aws-0-region.pooler.supabase.com`). Always use the pooler connection string obtained from the Connect button in the Supabase dashboard. The direct connection format may be blocked or deprecated.

---

## Errors Encountered

### Error 1 : pip install failed — Fatal error in launcher
```
Fatal error in launcher: Unable to create process using
'D:\githubProj\feedbackpulse\backend\venv\Scripts\python.exe'
```

**Why it happened:**
The `venv` was created in an old project location (`D:\githubProj\feedbackpulse`) but the project was being worked on at a new location (`D:\githubProj\Projects\feedbackpulse`). A venv stores absolute paths internally. When activated from a different location, it tried to use `python.exe` from a path that no longer existed.

**Solution:**
Deactivate the broken venv with `deactivate`. Delete it with `Remove-Item -Recurse -Force venv`. Create a fresh one with `python -m venv venv`. Activate it and reinstall all packages including `fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv`.

**Key lesson:**
A venv is tied to the folder it was created in. If the project moves, always delete and recreate the venv. Never copy or move a venv folder.

---

### Error 2 : utcnow deprecation warning
```
datetime.utcnow() is deprecated and scheduled for removal in a future version.
```

**Why it happened:**
Python 3.12 deprecated `datetime.utcnow()` because it returns a naive datetime with no timezone information attached. Code processing dates cannot tell if the time is UTC or local time, causing potential bugs.

**Solution:**
Replace `default=datetime.utcnow` with `default=lambda: datetime.now(timezone.utc)` in all model columns. Update the import to `from datetime import datetime, timezone`.

**Key lesson:**
Always use timezone-aware datetimes. Store everything in UTC. The `lambda:` wrapper is needed because SQLAlchemy calls the default function each time a row is created, not once at startup.

---

### Error 3 : could not translate host name to address
```
psycopg2.OperationalError: could not translate host name
"db.yghavpowqftbfsvcmcpb.supabase.co" to address: Name or service not known
```

**Why it happened:**
The old Supabase direct connection format (`db.xxxx.supabase.co`) was used. Supabase now uses a pooler-based connection string. The host could not be resolved because the old format is being phased out.

**Solution:**
Go to Supabase dashboard and click the green Connect button at the top. Copy the Transaction pooler URI. It looks like: `postgresql://postgres.xxxx:[PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres`. Update the `.env` file with this URL.

**Key lesson:**
Always get the connection string from the Connect button in Supabase, not from Settings. The Connect button always provides the current recommended format.

---

### Error 4 : embedded git repository warning
```
warning: adding embedded git repository: frontend
hint: You've added another git repository inside your current repository.
```

**Why it happened:**
`create-next-app` automatically ran `git init` inside the `frontend/` folder when the project was created. This resulted in two git repositories : one at the root `feedbackpulse/` level and one inside `feedbackpulse/frontend/`. Git cannot properly track files inside a nested repository.

**Solution:**
Run `git rm --cached -f frontend` (the `-f` flag forces removal when staged content exists). Then delete the nested git folder with `Remove-Item -Recurse -Force frontend\.git`. Then run `git add .` again.

**Key lesson:**
Project scaffolding tools like `create-next-app` often auto-initialize git. Always check for a `.git` folder inside any generated project before running `git add .` from the parent folder.

---

## How Everything Connects

```
Python model class (User, Project, Feedback)
        :
        : SQLAlchemy reads class definitions
        :
        ▼
CREATE TABLE SQL generated and sent to PostgreSQL on server start
        :
        : Tables created in Supabase if they do not exist
        :
        ▼
FastAPI endpoint receives a request
        :
        : get_db() creates a session via Depends()
        :
        ▼
SQLAlchemy ORM executes queries (SELECT, INSERT, UPDATE)
        :
        : Results returned as Python objects
        :
        ▼
FastAPI serializes response and sends JSON back to client
```

---

## Commands Reference

```bash
# Install dependencies
pip install sqlalchemy psycopg2-binary python-dotenv

# Start backend (tables auto-created on startup)
cd backend
venv\Scripts\activate
uvicorn main:app --reload
```
