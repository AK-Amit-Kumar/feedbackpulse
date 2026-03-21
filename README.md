# FeedbackPulse

A micro SaaS for product teams to collect, analyze, and act on user feedback - "in real time".

Drop a lightweight widget on your site. FeedbackPulse captures responses, summarizes them with AI, and surfaces insights on a live dashboard - no manual sifting required.

## Features

- **Embeddable widget** - one script tag, works on any site
- **AI summarization** - Gemini API condenses feedback into actionable insights
- **Real-time dashboard** - WebSockets push updates instantly as feedback arrives
- **Auth & team access** - secure login via Clerk
- **Usage-based billing** - Free (50 responses/mo) and Pro (unlimited) via Stripe

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Backend | FastAPI (Python) |
| Real time | WebSockets |
| AI | Gemini API |
| Database | PostgreSQL |
| Auth | Clerk |
| Payments | Stripe |

## Status

🚧 Active development — Day 2 of 10-day build sprint.

## Getting Started
```bash
# Clone the repo
git clone https://github.com/yourusername/feedbackpulse

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Roadmap

- [x] Project setup & architecture
- [x] Database schema & models
- [ ] Embeddable widget
- [ ] FastAPI feedback endpoints
- [ ] WebSocket real-time updates
- [ ] Gemini AI summarization
- [ ] Dashboard UI
- [ ] Clerk auth integration
- [ ] Stripe billing
- [ ] Deployment
