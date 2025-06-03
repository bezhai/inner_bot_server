from sqlalchemy import Column, String, Boolean, Integer, Text, TIMESTAMP, UniqueConstraint
from .base import Base

class FormatedMessage(Base):
    __tablename__ = "formated_message"
    __table_args__ = (UniqueConstraint("message_id", name="uq_message_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    user_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    is_mention_bot = Column(Boolean, nullable=False)
    role = Column(String, nullable=False)
    root_message_id = Column(String, nullable=True)
    reply_message_id = Column(String, nullable=True)
    message_id = Column(String, nullable=False)
    chat_id = Column(String, nullable=False)
    chat_type = Column(String, nullable=False)
    create_time = Column(TIMESTAMP, nullable=False) 