from app.agents.bangumi.react_agent import bangumi_search
from app.agents.img_gen.agent import generate_image

from .allcpp import search_donjin_event
from .web import search_web

MAIN_TOOLS = [
    search_donjin_event,
    search_web,
    bangumi_search,
    generate_image,
]
