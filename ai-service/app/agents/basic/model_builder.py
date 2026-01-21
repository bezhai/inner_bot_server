"""向后兼容层 - Model Builder

重定向到 app.agents.infra.model_builder
"""

import warnings

warnings.warn(
    "app.agents.basic.model_builder is deprecated. "
    "Please use app.agents.infra.model_builder instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.infra.model_builder import ModelBuilder

__all__ = ["ModelBuilder"]
