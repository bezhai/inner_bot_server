"""向后兼容层 - Image Generation Agent

重定向到 app.agents.tools.image
"""

import warnings

warnings.warn(
    "app.agents.img_gen.agent is deprecated. "
    "Please use app.agents.tools.image instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.tools.image import generate_image
from app.agents.tools.image.generate import batch_upload_images

__all__ = ["generate_image", "batch_upload_images"]
