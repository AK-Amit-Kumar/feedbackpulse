from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Project
from schemas import ProjectCreate, ProjectResponse
from typing import List
from uuid import UUID

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(
        name = project.name,
        user_id = project.user_id
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/{user_id}", response_model=List[ProjectResponse])
def get_projects(user_id: UUID, db: Session = Depends(get_db)):
    projects = db.query(Project).filter(Project.user_id == user_id).all()
    return projects


@router.get("/detail/{project_id}", response_model=ProjectResponse)
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
