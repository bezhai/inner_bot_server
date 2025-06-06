"""
自定义日志格式化器
"""

import json
import logging
from typing import Any, Dict
from pythonjsonlogger import jsonlogger


class CustomJSONFormatter(jsonlogger.JsonFormatter):
    """
    自定义JSON格式化器

    主要功能：
    1. 将 levelname 字段重命名为 level
    2. 将日志级别转换为小写（INFO -> info）
    3. 与 main-server 的日志格式保持一致
    """

    def add_fields(
        self,
        log_record: Dict[str, Any],
        record: logging.LogRecord,
        message_dict: Dict[str, Any],
    ) -> None:
        """添加字段到日志记录"""
        super().add_fields(log_record, record, message_dict)

        # 将 levelname 重命名为 level，并转换为小写
        if "levelname" in log_record:
            log_record["level"] = log_record["levelname"].lower()
            del log_record["levelname"]
        elif hasattr(record, "levelname"):
            log_record["level"] = record.levelname.lower()

        # 添加时间戳
        if "asctime" in log_record:
            log_record["timestamp"] = log_record.pop("asctime")
        elif hasattr(record, "created"):
            import datetime

            dt = datetime.datetime.fromtimestamp(record.created)
            log_record["timestamp"] = dt.strftime("%Y-%m-%d %H:%M:%S")

        # 添加logger名称
        if "name" not in log_record and hasattr(record, "name"):
            log_record["name"] = record.name

        # 确保message字段存在
        if "message" not in log_record and hasattr(record, "message"):
            log_record["message"] = record.message
