"""Tests for content_parser module"""

import json

import pytest

from app.utils.content_parser import ParsedContent, parse_content


class TestParseContentV2:
    """v2 JSON 格式解析"""

    def test_basic_v2_with_text_and_images(self):
        raw = json.dumps(
            {
                "v": 2,
                "text": "look at this: ![image](img_key) and [视频: clip.mp4]",
                "items": [
                    {"type": "text", "value": "look at this: "},
                    {"type": "image", "value": "img_key"},
                    {"type": "text", "value": " and "},
                    {
                        "type": "media",
                        "value": "file_key",
                        "meta": {"file_name": "clip.mp4"},
                    },
                ],
            }
        )
        result = parse_content(raw)
        assert result.text == "look at this: ![image](img_key) and [视频: clip.mp4]"
        assert result.image_keys == ["img_key"]
        assert len(result.items) == 4

    def test_v2_text_only(self):
        raw = json.dumps(
            {
                "v": 2,
                "text": "hello world",
                "items": [{"type": "text", "value": "hello world"}],
            }
        )
        result = parse_content(raw)
        assert result.text == "hello world"
        assert result.image_keys == []
        assert len(result.items) == 1

    def test_v2_multiple_images(self):
        raw = json.dumps(
            {
                "v": 2,
                "text": "![image](img1)![image](img2)",
                "items": [
                    {"type": "image", "value": "img1"},
                    {"type": "image", "value": "img2"},
                ],
            }
        )
        result = parse_content(raw)
        assert result.image_keys == ["img1", "img2"]

    def test_v2_empty_items(self):
        raw = json.dumps({"v": 2, "text": "", "items": []})
        result = parse_content(raw)
        assert result.text == ""
        assert result.image_keys == []
        assert result.items == []

    def test_v2_missing_text_field(self):
        raw = json.dumps(
            {"v": 2, "items": [{"type": "text", "value": "hello"}]}
        )
        result = parse_content(raw)
        assert result.text == ""
        assert result.items == [{"type": "text", "value": "hello"}]


class TestParseContentV1:
    """v1 markdown 格式回退"""

    def test_plain_text(self):
        result = parse_content("hello world")
        assert result.text == "hello world"
        assert result.image_keys == []
        assert result.items == []

    def test_text_with_images(self):
        raw = "look at this: ![image](img_key) nice"
        result = parse_content(raw)
        assert result.text == "look at this:  nice"
        assert result.image_keys == ["img_key"]
        assert result.items == []

    def test_multiple_images(self):
        raw = "![image](img1) text ![image](img2)"
        result = parse_content(raw)
        assert result.image_keys == ["img1", "img2"]
        assert "img1" not in result.text
        assert "img2" not in result.text

    def test_only_images(self):
        raw = "![image](img_key)"
        result = parse_content(raw)
        assert result.text == ""
        assert result.image_keys == ["img_key"]

    def test_empty_string(self):
        result = parse_content("")
        assert result.text == ""
        assert result.image_keys == []
        assert result.items == []


class TestParseContentEdgeCases:
    """容错和边界情况"""

    def test_invalid_json(self):
        result = parse_content("{invalid json")
        assert result.text == "{invalid json"
        assert result.image_keys == []

    def test_json_without_v_field(self):
        raw = json.dumps({"text": "hello", "items": []})
        result = parse_content(raw)
        # v 字段缺失，回退到 v1
        assert result.items == []

    def test_json_with_wrong_v(self):
        raw = json.dumps({"v": 1, "text": "hello"})
        result = parse_content(raw)
        # v != 2，回退到 v1
        assert result.items == []

    def test_json_array(self):
        raw = json.dumps([1, 2, 3])
        result = parse_content(raw)
        # 非 dict，回退到 v1
        assert result.items == []

    def test_v2_with_non_image_items_only(self):
        raw = json.dumps(
            {
                "v": 2,
                "text": "[文件: doc.pdf]",
                "items": [
                    {
                        "type": "file",
                        "value": "file_key",
                        "meta": {"file_name": "doc.pdf"},
                    }
                ],
            }
        )
        result = parse_content(raw)
        assert result.text == "[文件: doc.pdf]"
        assert result.image_keys == []
        assert len(result.items) == 1
