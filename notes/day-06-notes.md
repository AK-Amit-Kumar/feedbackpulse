# Day 6 : Gemini AI Feedback Summarization

## What Was Built

- Gemini API integrated using `google-generativeai` Python SDK
- `GET /feedback/summary/{project_id}` endpoint in `routers/feedback.py`
- Structured prompt engineering : themes, sentiment, actionable improvements
- Get AI Summary button on dashboard with loading state
- AI Summary card rendering on dashboard

---

## Gemini Model Reference : Important

**Model used in this project : `gemini-2.5-flash`**

This is the model that works on the current API plan. Keep this for reference.

| Model                     | Status                                                      |
| ------------------------- | ----------------------------------------------------------- |
| `gemini-2.5-flash`        | WORKING : fast, capable, available on current plan          |
| `gemini-2.0-flash`        | FAILED : 429 quota error, limit 0 on free tier (April 2026) |
| `gemini-2.0-flash-lite`   | Alternative free tier option                                |
| `gemini-1.5-flash-latest` | Alternative free tier option                                |
| `gemini-1.5-flash`        | FAILED : 404 model not found for v1beta API                 |

Always check https://ai.google.dev/gemini-api/docs/models for current available models. Google updates model availability regularly.

---

## Updated Project Structure

```
feedbackpulse/
└── backend/
    ├── routers/
    │   ├── feedback.py     : updated --> GET /feedback/summary/{project_id} added
    │   ├── projects.py
    │   └── users.py
    ├── websocket_manager.py
    ├── main.py
    ├── database.py
    ├── models.py
    ├── schemas.py
    └── .env               : updated --> GEMINI_API_KEY added

frontend/app/dashboard/
├── page.js                : updated --> fetchSummary, summary state, summaryLoading
└── Dashboard.module.css   : updated --> summaryCard, summaryLabel, summaryText
```

---

## Core Concepts

### LLM API

A Large Language Model API takes a text prompt as input and returns a generated text response. The model understands context, summarizes, analyzes sentiment, and generates coherent structured responses. We send all feedback as context and ask Gemini to analyze it.

**Why use an LLM instead of writing summarization logic?**
Writing code to detect themes, measure sentiment, and identify patterns in free-form text is an extremely hard NLP problem. LLMs are trained specifically to understand language. One API call does what would take weeks to build manually.

### Prompt Engineering

The quality of an LLM response depends on how well the prompt is written. A vague prompt produces vague output. A structured prompt with clear instructions and expected output format produces structured, actionable output.

**Prompt used:**

```
You are a product feedback analyst. Analyze the following user feedback and provide:
1. Main themes or patterns you notice
2. Overall sentiment (positive, mixed, or negative)
3. Top 3 actionable improvements users are asking for

Keep the response concise and structured.

Feedback:
{all feedback joined by newlines}
```

**Why assign a role ('You are a product feedback analyst')?**
Role assignment primes the model to respond in a domain-specific, professional way. Without a role, Gemini might write a general essay. With the role, it responds like an analyst : structured, concise, and actionable.

**Why specify the output format?**
Without specifying format, the response could be a paragraph, a poem, or a table. Enumerating exactly what you want ensures consistent structure that is easy to display in the UI.

---

## File Breakdown

### `backend/routers/feedback.py` : summary endpoint

```python
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

@router.get("/summary/{project_id}")
async def get_feedback_summary(project_id: str, db: Session = Depends(get_db)):
    from uuid import UUID

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    feedback_list = db.query(Feedback).filter(
        Feedback.project_id == project_uuid
    ).all()

    if not feedback_list:
        return {"summary": "No feedback collected yet for this project."}

    feedback_text = "\n".join([f.content for f in feedback_list])

    prompt = f"""You are a product feedback analyst. Analyze the following user feedback and provide:
1. Main themes or patterns you notice
2. Overall sentiment (positive, mixed, or negative)
3. Top 3 actionable improvements users are asking for

Keep the response concise and structured.

Feedback:
{feedback_text}"""

    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)

    return {"summary": response.text}
```

**`load_dotenv()` before `genai.configure()`**
Order is critical. `configure()` reads the API key immediately. If `load_dotenv()` has not run yet, `os.getenv()` returns `None` and Gemini configuration fails silently.

**`UUID(project_id)` validation**
Path parameters arrive as strings. Explicitly converting to UUID validates the format and raises a clear 400 error for invalid inputs instead of a cryptic database error.

**`"\n".join([f.content for f in feedback_list])`**
List comprehension extracts content from each Feedback object. `join()` combines them into one string with each piece on a new line. Gemini reads the entire block as context.

**`genai.GenerativeModel("gemini-2.5-flash")`**
Creates a model instance. Does not make an API call yet.

**`model.generate_content(prompt)`**
The actual API call. Sends the prompt to Gemini and waits for the response.

**`response.text`**
Plain text string extracted from Gemini's response object. Wrapping in `{"summary": ...}` makes it easy for the frontend to access as `res.data.summary`.

---

### `frontend/app/dashboard/page.js` : summary additions

```javascript
const [summary, setSummary] = useState(null);
const [summaryLoading, setSummaryLoading] = useState(false);

async function fetchSummary() {
  setSummaryLoading(true);
  try {
    const res = await api.get(`/feedback/summary/${selectedProject.id}`);
    setSummary(res.data.summary);
  } catch (err) {
    setSummary("Failed to generate summary. Please try again.");
  } finally {
    setSummaryLoading(false);
  }
}
```

**`finally` block**
Always runs regardless of success or failure. Guarantees `setSummaryLoading(false)` is called even if an unexpected error occurs. Prevents the button from being stuck in loading state permanently.

**`summary` starts as `null`**
The summary card only renders when `summary` is not null. On first load, no card shows. Only after clicking the button does the card appear.

---

## Complete AI Summary Flow

```
User clicks 'Get AI Summary' button
        |
        | setSummaryLoading(true) --> button disabled, shows 'Generating...'
        |
        ▼
GET /feedback/summary/{project_id} called via Axios
        |
        | Backend fetches all feedback from PostgreSQL
        | Joins into single text block
        |
        ▼
Prompt constructed with role + instructions + feedback text
genai.GenerativeModel('gemini-2.5-flash').generate_content(prompt) called
        |
        | Gemini API processes --> 2 to 5 seconds
        |
        ▼
Response returned --> themes, sentiment, top 3 improvements
Backend returns { summary: response.text }
        |
        ▼
setSummary(res.data.summary) --> summary card renders
finally block : setSummaryLoading(false) --> button re-enabled
```

---

## Errors Encountered

### Error 1 : 404 gemini-1.5-flash model not found

**Why it happened:** The model name `gemini-1.5-flash` was deprecated and removed from the v1beta API. Google regularly updates available models.
**Solution:** Updated to `gemini-2.5-flash` which is available on the current plan.
**Key lesson:** Always verify model names at https://ai.google.dev/gemini-api/docs/models before using.

---

### Error 2 : 429 quota exceeded on gemini-2.0-flash

**Why it happened:** `gemini-2.0-flash` has a free tier request limit of 0 as of April 2026. Requires a paid billing plan.
**Solution:** Switched to `gemini-2.5-flash` which is available on the current API plan.
**Key lesson:** 429 means quota exceeded, not a code error. Check billing tier requirements before using any model.

---

### Error 3 : AxiosError Network Error on summary fetch

**Why it happened:** The backend crashed on import when Gemini SDK failed to initialize. When the backend crashes on startup, all endpoints return network errors to the frontend.
**Solution:** Check uvicorn terminal for Python tracebacks. Ensure `GEMINI_API_KEY` is set in `.env`. Ensure `load_dotenv()` runs before `genai.configure()`.
**Key lesson:** Network Error in Axios often means the backend server crashed, not an actual network problem. Always check the uvicorn terminal first.

---

## Environment Variables

### `backend/.env` : add this

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your key from : https://aistudio.google.com/app/apikeys

---

## Commands Reference

```bash
# Install Gemini SDK
cd backend
venv\Scripts\activate
pip install google-generativeai

# Start backend
uvicorn main:app --reload

# Start frontend
cd frontend
npm run dev
```
