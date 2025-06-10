# 引用角标转换功能实现

## 概述

为了改善模型引用搜索结果的效果，我们设计了一个简单直观的引用语法方案：

1. **模型层**：使用新设计的引用语法 `(ref:URL)`
2. **适配层**：自动将引用语法转换为数字角标 `<number_tag>数字</number_tag>`

## 设计理念

### 问题分析

- **原始方案**：直接让模型输出数字角标语法 `<number_tag>`
- **问题**：模型对非标准语法支持不佳，效果不稳定
- **用户反馈**：
  - 标准链接转换会失去引用的本质，变成文本+链接的组合
  - 流式输出中格式突然变化影响体验

### 解决方案

- **新语法**：`(ref:URL)` - 简洁明了，语义明确表示"引用"
- **优势**：
  - 模型容易理解这是引用而不是链接
  - 语法简洁，不与现有 Markdown 语法冲突
  - 流式转换，用户体验流畅
  - 自动编号，无需模型关心序号

## 实现细节

### 1. Prompt 模板修改

**文件**: `ai-service/app/services/chat/prompt.md`

**新规则**:

```markdown
- 回答时如需引用链接，请在相关文本后直接使用引用语法 `(ref:URL)`，系统会自动转换为数字角标。
```

**示例输出**:

```
反田叶月是一位日本艺人(ref:https://example.com)，她很有才华。
```

### 2. 转换器实现

**文件**: `ai-service/app/utils/text_processor.py`

**核心组件**:

- `RefLinkToNumberTagConverter`: 引用语法转换器
- `StreamingRefProcessor`: 流式引用处理器
- `convert_ref_links_to_number_tags()`: 便捷转换函数

**转换规则**:

- 输入: `文本(ref:URL)`
- 输出: `文本<number_tag url='URL'>数字</number_tag>`
- 自动编号: 按出现顺序自动分配 1, 2, 3...

### 3. 服务集成

**文件**: `ai-service/app/services/chat_service.py`

**集成方式**:

- 使用 `StreamingRefProcessor` 进行流式转换
- 每个 chunk 都实时处理，确保用户看到一致的格式
- 无副作用转换，不修改原始数据流

## 使用示例

### 输入（模型输出）

```
主人，经过小尾的搜索，反田叶月是一位日本艺人(ref:https://example.com)、偶像和歌手哦~她来自广岛县，曾是偶像团体palet的一员(ref:https://palet.info)。她以多才多艺的形象活跃在多个领域呢~（微笑）
```

### 输出（用户看到）

```
主人，经过小尾的搜索，反田叶月是一位日本艺人¹、偶像和歌手哦~她来自广岛县，曾是偶像团体palet的一员²。她以多才多艺的形象活跃在多个领域呢~（微笑）
```

*注: ¹² 表示可点击的数字角标*

**效果特点**:

- ✅ **纯文本+角标**: 不是链接文本，而是纯文本后跟数字角标
- ✅ **角标可点击**: 点击数字角标跳转到引用URL
- ✅ **自动编号**: 系统自动按顺序分配 1, 2, 3...
- ✅ **流式一致**: 用户全程看到转换后的一致格式

## 技术特性

- ✅ 语法简洁：`(ref:URL)`
- ✅ 语义明确：明确表示"引用"概念
- ✅ 自动编号：按出现顺序 1-99
- ✅ 流式转换：实时处理，无格式突变
- ✅ 无副作用：纯展示层转换
- ✅ 错误容错：转换失败时保持原文
- ✅ 性能优异：基于正则表达式，开销极小

## 语法设计优势

### vs 标准 Markdown 链接

- **问题**: `[文本](URL)` 语义是"链接"，不是"引用"
- **优势**: `(ref:URL)` 语义明确是"引用"

### vs Reference Links

- **问题**: `[文本][1]` + `[1]: URL` 复杂，且仍是链接概念
- **优势**: `(ref:URL)` 简洁直观，明确是引用标记

### vs 其他语法

- **大括号**: `{URL}` 可能与模板语法冲突
- **双方括号**: `[[URL]]` 可能与wiki语法冲突  
- **引用语法**: `(ref:URL)` 不冲突，语义最明确

## 维护说明

### 修改角标样式

修改 `RefLinkToNumberTagConverter._create_number_tag()` 方法：

```python
def _create_number_tag(self, number: int, url: str) -> str:
    return f"<number_tag background_color='grey-50' font_color='grey-600' url='{url}'>{number}</number_tag>"
```

### 扩展功能

- 可以添加更多引用类型：`(note:内容)`, `(quote:来源)` 等
- 可以扩展自动编号规则：支持字母、罗马数字等

### 测试验证

```python
from app.utils.text_processor import convert_ref_links_to_number_tags

test_text = "反田叶月是一位日本艺人(ref:https://example.com)。"
result = convert_ref_links_to_number_tags(test_text)
# 输出: "反田叶月是一位日本艺人<number_tag url='https://example.com'>1</number_tag>。"
```

## 性能分析

- **正则匹配**: O(n) 时间复杂度，n为文本长度
- **内存使用**: 流式处理器仅保存必要状态，内存高效
- **转换开销**: 仅在检测到引用语法时执行，无引用时几乎零开销
- **响应延迟**: 对整体响应时间影响可忽略不计

## 未来扩展

- **多类型引用**: 支持不同类型的引用标记
- **自定义样式**: 支持用户自定义角标样式
- **批量处理**: 支持批量文档的引用转换
- **分析统计**: 支持引用使用情况的统计分析
