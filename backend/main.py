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
    allow_headers=["*"]
    
)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(feedback.router)
app.include_router(projects.router)

@app.get("/")
def root():
    return {"message": "FeedbackPulse backend is running"}