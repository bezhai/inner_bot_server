from langfuse import Langfuse

langfuse = Langfuse()


def get_prompt(prompt_id: str):
    return langfuse.get_prompt(prompt_id)
