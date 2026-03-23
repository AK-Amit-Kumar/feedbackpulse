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
        project_id = feedback.project_id,
        content = feedback.content
    )

    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback 

@router.get("/{project_id}", response_model=List[FeedbackResponse])
def get_feedback(project_id: UUID, db: Session = Depends(get_db)):
    feedback_list = db.query(Feedback).filter(Feedback.project_id == project_id).all()
    return feedback_list