"""向后兼容层 - Main Agent

重定向到 app.agents.domains.main
"""

import warnings

warnings.warn(
    "app.agents.main is deprecated. "
    "Please use app.agents.domains.main instead.",
    DeprecationWarning,
    stacklevel=2,
)

# 保留空的__init__，让子模块的导入继续工作
