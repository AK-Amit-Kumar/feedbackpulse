from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import UserCreate, UserResponse

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/sync", response_model=UserResponse)
def sync_user(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(
        User.clerk_id == user.clerk_id
    ).first()
    
    if existing_user:
        return existing_user
    
    db_user = User(
        clerk_id=user.clerk_id,
        email=user.email
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user