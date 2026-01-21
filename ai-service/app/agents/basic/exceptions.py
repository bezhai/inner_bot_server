"""向后兼容层 - Exceptions

重定向到 app.agents.infra.exceptions
"""

import warnings

warnings.warn(
    "app.agents.basic.exceptions is deprecated. "
    "Please use app.agents.infra.exceptions instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.infra.exceptions import (
    BannedWordError,
    ModelBuilderError,
    ModelConfigError,
    UnsupportedModelError,
)

__all__ = [
    "ModelBuilderError",
    "UnsupportedModelError",
    "ModelConfigError",
    "BannedWordError",
]
