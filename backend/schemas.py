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
        
class UserCreate(BaseModel):
    clerk_id: str
    email: str
    
class UserResponse(BaseModel):
    id: UUID
    clerk_id: str
    email: str
    created_at: datetime
    plan: str
    feedback_count: int
    
    class Config:
        from_attributes = True
    