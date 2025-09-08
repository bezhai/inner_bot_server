from dataclasses import dataclass


@dataclass
class ContextSchema:
    curr_message_id: str
    image_url_list: list[str] | None = None
