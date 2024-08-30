from sqlalchemy import Column, Integer, String, DateTime, Text
from app.db.base_class import Base


class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(Text)  # TODO: Add password hashing + authentication flow.
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
