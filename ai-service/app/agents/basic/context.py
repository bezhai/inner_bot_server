from dataclasses import dataclass

from bidict import bidict


@dataclass
class ContextSchema:
    curr_message_id: str | None = None
    curr_chat_id: str | None = None
    image_url_list: list[str] | None = None
    user_id_map: bidict[str, str] | None = None
