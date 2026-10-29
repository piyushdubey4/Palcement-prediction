from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..config import FACULTY_SIGNUP_CODE
from ..database import get_db
from ..models import Student
from ..schemas import LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _authenticate(db: Session, email: str, password: str) -> Student:
    user = db.scalar(select(Student).where(Student.email == email.lower()))
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    return user


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if body.role == "faculty" and body.faculty_code != FACULTY_SIGNUP_CODE:
        raise HTTPException(status_code=403, detail="Invalid faculty registration code")
    email = body.email.lower()
    if db.scalar(select(Student).where(Student.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = Student(
        name=body.name.strip(), email=email, hashed_password=hash_password(body.password), role=body.role,
        roll_no=body.roll_no, branch=body.branch, year=body.year,
    )
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = _authenticate(db, body.email, body.password)
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/token", include_in_schema=False)
def token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 form endpoint so the Swagger UI "Authorize" button works."""
    user = _authenticate(db, form.username, form.password)
    return {"access_token": create_access_token(user), "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def me(user: Student = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: Student = Depends(get_current_user), db: Session = Depends(get_db)):
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    return user
