from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class Chat(Base):
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"))
    title = Column(String, index=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    user = relationship("User", back_populates="chat")
    messages = relationship("Message", back_populates="chat")


class Message(Base):
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chat.id"))
    content = Column(String)
    role = Column(String)  # 'user' or 'assistant'
    created_at = Column(DateTime)

    chat = relationship("Chat", back_populates="message")
