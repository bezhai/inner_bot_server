"""向后兼容层 - Origin Client

重定向到 app.agents.clients 和 app.agents.infra.embedding
"""

import warnings

warnings.warn(
    "app.agents.basic.origin_client is deprecated. "
    "Please use app.agents.clients and app.agents.infra.embedding instead.",
    DeprecationWarning,
    stacklevel=2,
)

from app.agents.clients import (
    ArkClient,
    AzureHttpClient,
    BaseAIClient,
    ClientType,
    OpenAIClient,
    create_client,
)
from app.agents.infra.embedding import InstructionBuilder, Modality

__all__ = [
    "ClientType",
    "Modality",
    "InstructionBuilder",
    "BaseAIClient",
    "OpenAIClient",
    "ArkClient",
    "AzureHttpClient",
    "create_client",
]
