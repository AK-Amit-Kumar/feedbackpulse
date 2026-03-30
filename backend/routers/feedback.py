from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from websocket_manager import manager
import json
from sqlalchemy.orm import Session
from database import get_db
from models import Feedback, Project
from schemas import FeedbackCreate, FeedbackResponse
from typing import List
from uuid import UUID

router = APIRouter(prefix="/feedback", tags=["feedback"])

@router.post("/", response_model=FeedbackResponse)
async def create_feedback(feedback: FeedbackCreate, db: Session = Depends(get_db)):
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