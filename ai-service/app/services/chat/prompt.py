from typing import TypedDict
from jinja2 import Template
from datetime import datetime
from pathlib import Path


prompt_path = Path(__file__).parent / "prompt.md"
original_prompt = prompt_path.read_text(encoding="utf-8")


class PromptGeneratorParam(TypedDict):
    after_web_search: bool


class PromptService:

    @staticmethod
    async def get_prompt(param: PromptGeneratorParam) -> str:
        template = Template(original_prompt)
        return template.render(
            {
                "currDate": datetime.now().strftime("%Y-%m-%d"),
                "currTime": datetime.now().strftime("%H:%M:%S"),
                **param,
            }
        )
