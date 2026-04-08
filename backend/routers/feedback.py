from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from websocket_manager import manager
import json
from sqlalchemy.orm import Session
from database import get_db
from models import Feedback, Project, User
from schemas import FeedbackCreate, FeedbackResponse
from typing import List
from uuid import UUID
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

router = APIRouter(prefix="/feedback", tags=["feedback"])

@router.post("/", response_model=FeedbackResponse)
async def create_feedback(feedback: FeedbackCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == feedback.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    owner = db.query(User).filter(User.id == project.user_id).first()
    
    if owner and owner.plan == "free" and owner.feedback_count >= 50:
        raise HTTPException(
            status_code=403,
            detail="Free plan limit reached. Upgrade to Pro for unlimited feedback."
        )
    
    if owner and owner.plan == "free":
        owner.feedback_count += 1
        db.commit()
    
    
    
    db_feedback = Feedback(
        project_id = feedback.project_id,
        content = feedback.content
    )

    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    
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

@router.get("/{project_id}", response_model=List[FeedbackResponse])
def get_feedback(project_id: UUID, db: Session = Depends(get_db)):
    feedback_list = db.query(Feedback).filter(Feedback.project_id == project_id).all()
    return feedback_list

@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await manager.connect(websocket, project_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)
        
@router.get("/summary/{project_id}")
async def get_feedback_summary(project_id: str, db: Session = Depends(get_db)):
    from uuid import UUID
    
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Project ID")
    
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    owner = db.query(User).filter(User.id == project.user_id).first()
    
    if owner and owner.plan == "free":
        raise HTTPException(
            status_code=403,
            detail="AI Summary is a Pro feature. Upgrade     to Pro to unlock."
        )
    
    
    feedback_list = db.query(Feedback).filter(
        Feedback.project_id == project_uuid
    ).all()
    
    if not feedback_list:
        return {
            "summary": "No feedback collected yet for this project."
        }
        
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
    