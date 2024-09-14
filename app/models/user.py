from sqlalchemy import (
    Column,
    String,
    Boolean,
    ForeignKey,
    Text,
    Enum,
    JSON,
    UUID,
    Integer,
    TIMESTAMP,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
import enum

Base = declarative_base()


# Enum for message types
class MessageTypeEnum(enum.Enum):
    text = "text"
    image = "image"
    video = "video"
    audio = "audio"


# Enum for providers
class ProviderEnum(enum.Enum):
    google = "google"
    facebook = "facebook"


# User model
class User(Base):
    __tablename__ = "users"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    provider = Column(Enum(ProviderEnum), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    conversations = relationship("Conversation", back_populates="user")


# Custom Instructions model
class CustomInstruction(Base):
    __tablename__ = "custom_instructions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    instruction = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())


# Conversations model
class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    custom_instructions_id = Column(
        PGUUID(as_uuid=True), ForeignKey("custom_instructions.id"), nullable=True
    )
    summary = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

    user = relationship("User", back_populates="conversations")
    custom_instruction = relationship("CustomInstruction")
    messages = relationship("Message", back_populates="conversation")


# Message model
class Message(Base):
    __tablename__ = "messages"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    conversation_id = Column(
        PGUUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )
    message_type = Column(Enum(MessageTypeEnum), nullable=False)
    content = Column(Text, nullable=True)
    content_details_id = Column(
        PGUUID(as_uuid=True), ForeignKey("content_details.id"), nullable=True
    )
    parameters = Column(JSONB, nullable=True)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(TIMESTAMP, nullable=True)

    conversation = relationship("Conversation", back_populates="messages")
    message_versions = relationship("MessageVersion", back_populates="message")


# Message Version model
class MessageVersion(Base):
    __tablename__ = "message_versions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    message_id = Column(PGUUID(as_uuid=True), ForeignKey("messages.id"), nullable=False)
    content = Column(Text, nullable=False)
    version_number = Column(Integer, nullable=False)
    edited_at = Column(TIMESTAMP, server_default=func.now())

    message = relationship("Message", back_populates="message_versions")


# Content Details model
class ContentDetail(Base):
    __tablename__ = "content_details"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    url = Column(Text, nullable=False)
    file_type = Column(Enum(MessageTypeEnum), nullable=False)
    file_size = Column(Integer, nullable=True)  # Size in bytes
    content_hash = Column(String, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())


# Tags model
class Tag(Base):
    __tablename__ = "tags"

    id = Column(PGUUID(as_uuid=True), primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


# ConversationTags model (Many-to-many relationship)
class ConversationTag(Base):
    __tablename__ = "conversation_tags"

    conversation_id = Column(
        PGUUID(as_uuid=True), ForeignKey("conversations.id"), primary_key=True
    )
    tag_id = Column(PGUUID(as_uuid=True), ForeignKey("tags.id"), primary_key=True)
