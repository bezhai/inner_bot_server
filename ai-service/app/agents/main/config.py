"""
Main agent routing configuration (placeholders).

Note: model_id and prompt_id are placeholders consistent with actual names; prompts are stored externally.
"""

# Classifier A (two-step): deep research? simple task?
CLASSIFIER_DEEP_MODEL = "classifier-deep-research"
CLASSIFIER_DEEP_PROMPT = "classifier-deep"

CLASSIFIER_SIMPLE_MODEL = "classifier-simple-task"
CLASSIFIER_SIMPLE_PROMPT = "classifier-simple"

# Classifier B (safety): political sensitivity yes/no
CLASSIFIER_SAFETY_MODEL = "classifier-safety"
CLASSIFIER_SAFETY_PROMPT = "classifier-safety"

# Reject node
REJECT_MODEL = "chat-reject"
REJECT_PROMPT = "chat-reject"

# Target routes
NORMAL_MODEL = "chat-normal"
NORMAL_PROMPT = "main"  # persona-rich prompt id
DEEP_MODEL = "chat-deep-research"
DEEP_PROMPT = "deep-research"
SIMPLE_MODEL = "chat-simple-task"
SIMPLE_PROMPT = "simple-task"

# Tools placeholders
NORMAL_TOOLS: list = []
DEEP_TOOLS: list = []
SIMPLE_TOOLS: list = []

