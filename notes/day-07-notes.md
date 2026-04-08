# Day 7 : Stripe Billing

## What Was Built

- Stripe account created and configured in test mode
- FeedbackPulse Pro product created in Stripe Product Catalog at $9.00 USD per month
- Stripe CLI installed and configured to forward webhook events to localhost
- stripe Python SDK installed in backend venv
- backend/models.py updated : plan and feedback_count columns added to User model
- Supabase SQL updated : plan and feedback_count columns added to users table via ALTER TABLE
- backend/schemas.py updated : plan and feedback_count added to UserResponse
- backend/routers/stripe_routes.py created : checkout session endpoint and webhook endpoint
- backend/routers/feedback.py updated : Gate 1 (50 response free limit) and Gate 2 (AI Summary pro only) added
- backend/main.py updated : stripe_routes router registered
- frontend/app/dashboard/page.js updated : userPlan state, upgrading state, handleUpgrade function, success/cancel URL handler, plan badge JSX
- frontend/app/dashboard/Dashboard.module.css updated : planBadge, proBadge, freeBadge, freeSection, upgradeButton classes added

---

## Updated Project Structure

```
feedbackpulse/
├── frontend/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js
│   │   └── dashboard/
│   │       ├── page.js              : updated : plan badge, upgrade button, handleUpgrade, success handler
│   │       └── Dashboard.module.css : updated : planBadge, proBadge, freeBadge, upgradeButton
│   ├── lib/
│   │   ├── api.js
│   │   └── useCurrentUser.js
│   ├── public/
│   │   └── FeedbackPulse_Logo.png
│   ├── middleware.js
│   └── .env.local                   : updated : NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY added
│
└── backend/
    ├── static/
    │   └── widget.js
    ├── routers/
    │   ├── __init__.py
    │   ├── feedback.py              : updated : Gate 1 and Gate 2 added
    │   ├── projects.py
    │   ├── users.py
    │   └── stripe_routes.py         : NEW : checkout session + webhook endpoints
    ├── websocket_manager.py
    ├── main.py                      : updated : stripe_routes router registered
    ├── database.py
    ├── models.py                    : updated : plan, feedback_count added to User
    ├── schemas.py                   : updated : plan, feedback_count added to UserResponse
    └── .env                         : updated : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET added
```

---

## Core Concepts

### Stripe Checkout

Stripe provides a fully hosted payment page. The backend creates a checkout session and returns a URL. The frontend redirects the user to that URL. Stripe handles card entry, security, and PCI compliance entirely.

WHY : Building a custom payment form requires PCI DSS compliance, secure card tokenization, and handling dozens of edge cases. Stripe Checkout provides all of this for free. The only job is to create a session and redirect the user.

### Webhooks

After a user pays on Stripe's hosted page, Stripe sends an HTTP POST request to a URL registered on your server. Your backend listens at POST /stripe/webhook and processes the event.

WHY : The frontend redirect cannot be trusted. The user could close the tab, lose internet, or manually construct the redirect URL. Webhooks are server-to-server events Stripe sends directly to the backend regardless of client behavior. They are the only reliable confirmation of payment.

### Webhook Signature Verification

Every webhook Stripe sends is signed using the STRIPE_WEBHOOK_SECRET. The backend verifies this signature before processing the event. Requests with invalid signatures are rejected with 400.

WHY : Without verification, anyone could send a fake POST to /stripe/webhook pretending a payment happened and upgrade their account for free. Signature verification ensures only Stripe can trigger upgrade logic.

### Plan Gating

The User model has a plan column storing 'free' or 'pro'. Every protected endpoint checks this column. Free users hitting protected endpoints receive 403 Forbidden.

WHY : Gating must happen on the backend. Frontend checks can be bypassed by calling the API directly. The backend must enforce plan restrictions independently on every request.

### Stripe CLI

The Stripe CLI forwards webhook events from Stripe's servers to localhost during development.

WHY : localhost:8000 is not publicly accessible. Stripe cannot reach it directly. The CLI bridges this gap in development. In production, Stripe sends webhooks directly to the deployed server URL.

---

## File by File Code Breakdown with WHY

### backend/models.py : User model additions

```python
plan = Column(String, default="free", nullable=False)
```

WHY : Stores 'free' or 'pro' per user. Updated to 'pro' when webhook confirms payment. Default is 'free' so every new signup starts on the free plan automatically. nullable=False ensures the column always has a value.

```python
feedback_count = Column(Integer, default=0, nullable=False)
```

WHY : Tracks how many feedback responses a free user has submitted. Enforces the 50 response monthly limit. Only meaningful for free users since pro users have unlimited responses.

---

### backend/routers/stripe_routes.py

```python
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
```

WHY : Sets the secret key at module level so every Stripe function call uses it automatically. Runs once on import, not on every request. The secret key must never be sent to the frontend.

```python
metadata={"clerk_id": clerk_id}
```

WHY : Attaches the user's clerkId to the Stripe session. When the webhook fires after payment, the session data includes this metadata. This is the only way the webhook handler knows which user paid and whose plan to upgrade.

```python
payload = await request.body()
```

WHY : Must use request.body() and NOT request.json(). Stripe signature verification requires the raw bytes. Parsing JSON first destroys the raw bytes and makes verification fail every time.

```python
stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
```

WHY : Verifies the webhook signature and parses the event in one call. Raises SignatureVerificationError if the signature is invalid, which is caught and returned as 400. This is the security gate against fake webhook calls.

```python
if event["type"] == "checkout.session.completed":
```

WHY : Stripe sends many event types. Only checkout.session.completed means a payment was successfully completed. Checking the type prevents running upgrade logic on other events like failed payments or cancellations.

```python
return JSONResponse({"status": "success"})
```

WHY : Always returns 200 to Stripe even if the user is not found. Stripe retries webhooks that return errors. Returning success tells Stripe the event was received and processed.

---

### backend/routers/feedback.py : Gate 1

```python
owner = db.query(User).filter(User.id == project.user_id).first()
```

WHY : The widget sends only project_id. We look up the project to get user_id, then look up the user to check their plan. Two queries are necessary because the widget intentionally sends minimal data. User.id and project.user_id are both UUID type so PostgreSQL can compare them correctly.

```python
if owner and owner.plan == "free" and owner.feedback_count >= 50:
    raise HTTPException(status_code=403, ...)
```

WHY : >= 50 means at exactly 50 responses the next submission is blocked. 403 Forbidden is the correct status because the request is valid but the user lacks permission due to their plan.

```python
if owner and owner.plan == "free":
    owner.feedback_count += 1
    db.commit()
```

WHY : Only increments for free users. Pro users have unlimited responses so tracking their count wastes a database write on every submission. db.commit() persists the count immediately so the next submission sees the accurate value.

---

### backend/routers/feedback.py : Gate 2

```python
if owner and owner.plan == "free":
    raise HTTPException(status_code=403, detail="AI Summary is a Pro feature.")
```

WHY : AI Summary is completely unavailable on the free plan. All free users are blocked regardless of their response count. This is what makes the Pro plan valuable. If free users could access AI summaries there would be little reason to upgrade.

---

### frontend/app/dashboard/page.js

```javascript
const [userPlan, setUserPlan] = useState("free");
```

WHY : Stores the user's plan in state. React re-renders when state changes. Default 'free' shows the correct UI immediately before the API response arrives.

```javascript
setUserPlan(res.data.plan);
```

WHY : Called inside syncUser after the user object is returned. Since plan is now in UserResponse, this sets the correct plan state on every dashboard load without a separate API call.

```javascript
const params = new URLSearchParams(window.location.search)
if (params.get("success") === "true") { ... }
window.history.replaceState({}, "", "/dashboard")
```

WHY : Reads the ?success=true query param Stripe appends after redirect. replaceState cleans the URL without triggering a page reload. Without this, the user would see the success alert again on every page refresh.

```javascript
window.location.href = data.url;
```

WHY : Redirects the entire browser tab to Stripe's hosted checkout page. This is the standard pattern for redirecting to an external payment provider from a React app.

```javascript
const errorMessage =
  err.response?.data?.detail || "Failed to generate summary.";
```

WHY : Reads the actual error message from the FastAPI HTTPException detail field. Optional chaining ?. prevents crashes if the response structure is different. Falls back to a generic message only if the backend detail is not available.

---

## Complete Flow Explanation

```
User clicks Upgrade to Pro
        ↓
Frontend : POST /stripe/create-checkout-session with clerkId
        ↓
Backend : verifies user exists in database
        ↓
Backend : stripe.checkout.Session.create() with Price ID and clerk_id in metadata
        ↓
Backend : returns Stripe hosted checkout URL
        ↓
Frontend : window.location.href = data.url
        ↓
User : enters 4242 4242 4242 4242 on Stripe checkout page
        ↓
Stripe : processes payment
        ↓
Stripe CLI : forwards checkout.session.completed event to localhost:8000/stripe/webhook
        ↓
Backend : stripe.Webhook.construct_event() verifies signature
        ↓
Backend : reads clerk_id from session metadata
        ↓
Backend : updates user.plan = "pro" and db.commit()
        ↓
Stripe : redirects user to localhost:3000/dashboard?success=true
        ↓
Frontend : reads ?success=true, shows alert, cleans URL
        ↓
syncUser runs and returns plan="pro"
        ↓
Dashboard shows PRO Plan badge, hides Upgrade button
```

---

## Errors Encountered

### Error 1 : ModuleNotFoundError: No module named 'stripe'

Message : `ModuleNotFoundError: No module named 'stripe'`
WHY : pip install stripe was run without activating venv. Package installed globally instead of in project venv.
Solution : Activate venv first with `venv\Scripts\activate`, then run `pip install stripe`. Verify with `pip show stripe` and confirm Location contains feedbackpulse\backend\venv.
Key lesson : Always activate venv before pip install. The Location field in pip show confirms where the package was installed.

### Error 2 : operator does not exist: character varying = uuid

Message : `sqlalchemy.exc.ProgrammingError: operator does not exist: character varying = uuid`
WHY : Gate query used User.clerk_id == project.user_id. clerk_id is String but project.user_id is UUID. PostgreSQL refuses to compare different types.
Solution : Changed to User.id == project.user_id. Both are UUID type so PostgreSQL can compare them.
Key lesson : Always match column types in SQLAlchemy filter conditions. The join must use the foreign key: project.user_id references users.id not users.clerk_id.

### Error 3 : POST /stripe/webhookw 404 Not Found

Message : `POST /stripe/webhookw HTTP/1.1 404 Not Found`
WHY : Stripe CLI forward URL had a typo. It was forwarding to /stripe/webhookw with an extra 'w'. FastAPI endpoint is /stripe/webhook without it.
Solution : Rerun Stripe CLI with correct command : `.\stripe listen --forward-to localhost:8000/stripe/webhook`
Key lesson : Check uvicorn logs when plan does not update after payment. 404 on webhook means wrong URL. Always paste the CLI command carefully.

### Error 4 : Gate working but showing wrong message on frontend

Message : 'Failed to generate summary. Please try again.' shown for all errors including 403
WHY : fetchSummary catch block was hardcoded to a generic message and ignored the actual backend error.
Solution : Updated catch to read err.response?.data?.detail first and fall back to generic message only if undefined.
Key lesson : Always read err.response.data.detail in Axios catch blocks. FastAPI HTTPException details are accessible there. Generic catch messages hide important backend information.

---

## Testing Steps

Start all three simultaneously in separate terminals :

Terminal 1 : Backend

```
cd D:\githubProj\Projects\feedbackpulse\backend
venv\Scripts\activate
uvicorn main:app --reload
```

Terminal 2 : Stripe CLI

```
cd C:\stripe-cli
.\stripe listen --forward-to localhost:8000/stripe/webhook
```

Terminal 3 : Frontend

```
cd D:\githubProj\Projects\feedbackpulse\frontend
npm run dev
```

Test sequence :

1. Open dashboard : FREE Plan badge and Upgrade to Pro button should be visible
2. Click Get AI Summary as free user : should show "AI Summary is a Pro feature. Upgrade to Pro to unlock."
3. Click Upgrade to Pro : button shows "Redirecting...", browser redirects to Stripe checkout
4. Enter test card 4242 4242 4242 4242 with any future expiry and any CVC
5. After payment : dashboard shows success alert and PRO Plan badge
6. Click Get AI Summary as pro user : summary generates successfully

---

## Commands Reference

```bash
# Verify stripe is installed in correct venv
pip show stripe

# Install stripe in venv
venv\Scripts\activate
pip install stripe

# Start Stripe CLI forwarding
cd C:\stripe-cli
.\stripe listen --forward-to localhost:8000/stripe/webhook

# Login to Stripe CLI
.\stripe login

# Start backend
cd D:\githubProj\Projects\feedbackpulse\backend
venv\Scripts\activate
uvicorn main:app --reload

# Start frontend
cd D:\githubProj\Projects\feedbackpulse\frontend
npm run dev

# Supabase : add plan columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'free' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0 NOT NULL;
```
