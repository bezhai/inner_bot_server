# Bangumi Agent 独立化设计方案

## 概述

本文档描述了将现有的bangumi相关工具重构为独立Agent的完整设计方案。新的Agent将作为单一的`@tool`工具对外暴露，内部实现智能的深度搜索和关联查询功能。

## 项目结构

```
ai-service/app/agents/
└── bangumi/
    ├── __init__.py              # 模块初始化，导出bangumi_search工具
    ├── agent.py                 # 主Agent类，包含bangumi_search工具函数
    ├── api_client.py            # Bangumi API客户端，统一API调用接口
    ├── models.py                # Pydantic模型定义，数据结构
    ├── result_formatter.py      # 结果格式化，生成易读的回答
    ├── langgraph/               # LangGraph工作流实现
    │   ├── __init__.py          # LangGraph模块初始化
    │   ├── graph.py             # 图构建和执行器
    │   ├── state.py             # 状态定义和管理
    │   ├── nodes.py             # 图节点实现
    │   └── conditions.py        # 条件判断函数
    └── autogpt/                 # AutoGPT式自主搜索逻辑
        ├── __init__.py          # AutoGPT模块初始化
        ├── planner.py           # 搜索计划制定器
        ├── executor.py          # 计划执行器
        ├── evaluator.py         # 结果评估器
        └── reflector.py         # 反思和计划调整器
```

## 核心设计

### 1. 对外接口

```python
@tool()
async def bangumi_search(query: str) -> str:
    """
    Bangumi综合搜索工具，支持ACG条目、角色、人物的搜索和关联查询
    
    功能特性：
    - 支持自然语言查询
    - 自动识别查询意图和深度
    - 智能关联查询，获取相关信息
    - 格式化输出，生成易读回答
    
    Args:
        query: 自然语言查询，支持多种查询类型：
            - 条目搜索："查找进击的巨人相关信息"
            - 人物搜索："新海诚导演的作品有哪些"
            - 角色搜索："鬼灭之刃的主要角色"
            - 关联查询："进击的巨人的声优信息"
            - 深度分析："分析宫崎骏的动画风格特点"
            
    Returns:
        str: 格式化的搜索结果文本，包含：
            - 基础信息（名称、类型、评分等）
            - 关联信息（角色、声优、制作人员等）
            - 详细描述（剧情简介、制作信息等）
    
    示例：
        >>> result = await bangumi_search("进击的巨人第一季的详细信息")
        >>> print(result)
        
        ## 进击的巨人 第一季
        
        **基本信息**
        - 类型：动画
        - 播出时间：2013年4月
        - 集数：25集
        - 评分：8.7/10
        
        **剧情简介**
        在被巨大的城墙包围的城市中，人类与巨人展开生死搏斗...
        
        **主要角色**
        - 艾伦·耶格尔 (CV: 梶裕贵)
        - 三笠·阿克曼 (CV: 石川由依)
        - 阿明·阿诺德 (CV: 井上麻里奈)
        
        **制作信息**
        - 制作公司：WIT STUDIO
        - 监督：荒木哲郎
        - 原作：諫山創
    """
```

### 2. 内部架构

#### 2.1 BangumiAgent 主类

```python
class BangumiAgent:
    """Bangumi Agent 主类，使用LangGraph实现AutoGPT式工作流"""
    
    def __init__(self):
        self.api_client = BangumiAPIClient()
        self.formatter = ResultFormatter()
        self.graph_executor = BangumiGraphExecutor()
    
    async def search(self, query: str) -> str:
        """
        执行搜索的主入口方法
        
        使用LangGraph执行AutoGPT式的自主搜索工作流：
        1. 计划制定 - 分析查询，制定搜索计划
        2. 计划执行 - 执行搜索操作，收集数据
        3. 结果评估 - 评估搜索结果是否满足需求
        4. 反思调整 - 根据评估结果调整计划
        5. 循环迭代 - 直到获得满意的结果
        6. 结果整理 - 格式化最终输出
        """
        # 执行LangGraph工作流
        result = await self.graph_executor.execute_search(query)
        return result
```

#### 2.2 API客户端设计

```python
class BangumiAPIClient:
    """Bangumi API 统一客户端"""
    
    # 搜索类API
    async def search_subjects(self, keyword: str, **kwargs) -> SubjectSearchResult:
        """搜索条目"""
        
    async def search_characters(self, keyword: str, **kwargs) -> CharacterSearchResult:
        """搜索角色"""
        
    async def search_persons(self, keyword: str, **kwargs) -> PersonSearchResult:
        """搜索人物"""
    
    # 详情获取API
    async def get_subject_detail(self, subject_id: int) -> Subject:
        """获取条目详情"""
        
    async def get_character_detail(self, character_id: int) -> Character:
        """获取角色详情"""
        
    async def get_person_detail(self, person_id: int) -> Person:
        """获取人物详情"""
    
    # 关联查询API
    async def get_subject_persons(self, subject_id: int) -> List[RelatedPerson]:
        """获取条目关联人员"""
        
    async def get_subject_characters(self, subject_id: int) -> List[RelatedCharacter]:
        """获取条目关联角色"""
        
    async def get_subject_relations(self, subject_id: int) -> List[RelatedSubject]:
        """获取条目关联条目"""
        
    async def get_character_subjects(self, character_id: int) -> List[RelatedSubject]:
        """获取角色关联条目"""
        
    async def get_character_persons(self, character_id: int) -> List[RelatedPerson]:
        """获取角色关联人物（声优等）"""
        
    async def get_person_subjects(self, person_id: int) -> List[RelatedSubject]:
        """获取人物关联条目"""
        
    async def get_person_characters(self, person_id: int) -> List[RelatedCharacter]:
        """获取人物关联角色"""
```

#### 2.3 LangGraph工作流系统

```python
# 2.3.1 状态定义
class BangumiSearchState(TypedDict):
    """Bangumi搜索状态"""
    
    # 输入信息
    original_query: str
    
    # 计划阶段
    search_plan: Optional[SearchPlan]
    current_step: int
    max_iterations: int
    
    # 执行阶段
    api_calls_made: List[Dict[str, Any]]
    collected_data: Dict[str, Any]
    
    # 评估阶段
    evaluation_result: Optional[EvaluationResult]
    satisfaction_score: float
    
    # 反思阶段
    reflection_notes: List[str]
    plan_adjustments: List[str]
    
    # 最终结果
    final_answer: Optional[str]
    error_message: Optional[str]


# 2.3.2 图执行器
class BangumiGraphExecutor:
    """Bangumi图执行器"""
    
    def __init__(self):
        self.graph = self.create_bangumi_graph()
    
    def create_bangumi_graph(self):
        """创建Bangumi搜索工作流图"""
        graph = StateGraph(BangumiSearchState)
        
        # 添加节点
        graph.add_node("plan", plan_node)
        graph.add_node("execute", execute_node)
        graph.add_node("evaluate", evaluate_node)
        graph.add_node("reflect", reflect_node)
        graph.add_node("format", format_node)
        
        # 设置流程
        graph.set_entry_point("plan")
        graph.add_edge("plan", "execute")
        graph.add_conditional_edges(
            "execute",
            should_continue_execution,
            {
                "evaluate": "evaluate",
                "error": END
            }
        )
        graph.add_conditional_edges(
            "evaluate",
            should_continue_search,
            {
                "reflect": "reflect",
                "format": "format"
            }
        )
        graph.add_edge("reflect", "plan")
        graph.add_edge("format", END)
        
        return graph.compile()
```

#### 2.4 AutoGPT式自主搜索系统

```python
# 2.4.1 搜索计划制定器
class SearchPlanner:
    """搜索计划制定器，借鉴AutoGPT的规划思路"""
    
    async def create_plan(self, query: str, context: Dict = None) -> SearchPlan:
        """
        创建搜索计划
        
        AutoGPT式规划策略：
        1. 分析用户查询意图
        2. 分解为可执行的子任务
        3. 确定API调用序列
        4. 设置成功标准
        """
        
    async def adjust_plan(self, 
                         current_plan: SearchPlan, 
                         evaluation: EvaluationResult) -> SearchPlan:
        """根据评估结果调整计划"""


# 2.4.2 计划执行器
class PlanExecutor:
    """计划执行器，执行搜索计划中的各个步骤"""
    
    async def execute_step(self, step: SearchStep, state: BangumiSearchState) -> ExecutionResult:
        """执行单个搜索步骤"""
        
    async def batch_execute_apis(self, api_calls: List[APICall]) -> List[APIResult]:
        """批量执行API调用"""


# 2.4.3 结果评估器
class ResultEvaluator:
    """结果评估器，评估搜索结果是否满足用户需求"""
    
    async def evaluate_results(self, 
                              query: str, 
                              collected_data: Dict) -> EvaluationResult:
        """
        评估搜索结果质量
        
        评估维度：
        1. 完整性 - 是否回答了用户的问题
        2. 相关性 - 结果与查询的相关程度
        3. 准确性 - 信息的准确性
        4. 丰富性 - 信息的详细程度
        """


# 2.4.4 反思器
class SearchReflector:
    """搜索反思器，分析失败原因并提出改进建议"""
    
    async def reflect_on_failure(self, 
                                evaluation: EvaluationResult,
                                executed_plan: SearchPlan) -> ReflectionResult:
        """分析搜索失败的原因"""
        
    async def suggest_improvements(self, reflection: ReflectionResult) -> List[str]:
        """提出改进建议"""
```

#### 2.5 结果格式化器

```python
class ResultFormatter:
    """结果格式化器，生成易读的文本输出"""
    
    def format(self, results: SearchResults, intent: SearchIntent) -> str:
        """
        根据搜索结果和意图生成格式化文本
        
        输出格式：
        - Markdown格式
        - 层次化结构
        - 重要信息突出显示
        - 适当的信息密度
        """
        
    def _format_subject(self, subject: Subject) -> str:
        """格式化条目信息"""
        
    def _format_character(self, character: Character) -> str:
        """格式化角色信息"""
        
    def _format_person(self, person: Person) -> str:
        """格式化人物信息"""
```

## 支持的API接口

### 基于现有OpenAPI规范的完整实现

| API端点 | 功能描述 | 实现状态 |
|---------|----------|----------|
| `/v0/search/subjects` | 搜索条目 | ✅ 已有 |
| `/v0/search/characters` | 搜索角色 | ✅ 已有 |
| `/v0/search/persons` | 搜索人物 | 🆕 新增 |
| `/v0/subjects/{id}` | 获取条目详情 | 🆕 新增 |
| `/v0/subjects/{id}/persons` | 条目关联人员 | 🆕 新增 |
| `/v0/subjects/{id}/characters` | 条目关联角色 | 🆕 新增 |
| `/v0/subjects/{id}/subjects` | 条目关联条目 | 🆕 新增 |
| `/v0/characters/{id}` | 获取角色详情 | 🆕 新增 |
| `/v0/characters/{id}/subjects` | 角色关联条目 | 🆕 新增 |
| `/v0/characters/{id}/persons` | 角色关联人物 | 🆕 新增 |
| `/v0/persons/{id}` | 获取人物详情 | 🆕 新增 |
| `/v0/persons/{id}/subjects` | 人物关联条目 | 🆕 新增 |
| `/v0/persons/{id}/characters` | 人物关联角色 | 🆕 新增 |

## AutoGPT式智能搜索策略

### 1. 自主计划制定

使用LLM分析用户查询并制定详细的搜索计划：

```python
class SearchPlan:
    """搜索计划数据结构"""
    
    goal: str  # 搜索目标
    steps: List[SearchStep]  # 搜索步骤
    success_criteria: List[str]  # 成功标准
    max_iterations: int = 5  # 最大迭代次数
    
class SearchStep:
    """单个搜索步骤"""
    
    action: str  # 动作类型：search_subjects, get_details, etc.
    parameters: Dict[str, Any]  # 参数
    expected_outcome: str  # 预期结果
    priority: int  # 优先级
    depends_on: List[int] = []  # 依赖的步骤

# 支持的查询类型和自动规划策略：

# 基础信息查询
"查找进击的巨人相关信息"
→ 计划：[搜索条目] → [获取详情] → [格式化输出]

# 关联信息查询  
"进击的巨人第一季的声优阵容"
→ 计划：[搜索条目] → [获取角色列表] → [获取声优信息] → [整理输出]

# 人物作品查询
"宫崎骏导演的所有作品"
→ 计划：[搜索人物] → [获取关联作品] → [获取作品详情] → [按时间排序]

# 比较分析查询
"比较不同版本的攻壳机动队"
→ 计划：[搜索相关条目] → [获取详细信息] → [对比分析] → [生成比较报告]
```

### 2. 自适应执行策略

根据执行结果动态调整搜索策略：

```python
class AdaptiveSearchStrategy:
    """自适应搜索策略"""
    
    async def execute_with_adaptation(self, plan: SearchPlan) -> SearchResults:
        """
        自适应执行搜索计划
        
        策略：
        1. 按优先级执行步骤
        2. 实时评估执行结果
        3. 根据结果调整后续步骤
        4. 处理API调用失败和数据缺失
        5. 动态添加补充搜索步骤
        """
        
    async def handle_execution_failure(self, 
                                     failed_step: SearchStep,
                                     error: Exception) -> List[SearchStep]:
        """处理执行失败，生成替代方案"""
        
    async def detect_missing_information(self,
                                       current_results: Dict,
                                       target_goal: str) -> List[SearchStep]:
        """检测缺失信息，生成补充搜索步骤"""
```

### 3. 智能结果评估

```python
class IntelligentEvaluator:
    """智能结果评估器"""
    
    async def comprehensive_evaluation(self,
                                     query: str,
                                     results: Dict) -> EvaluationResult:
        """
        综合评估搜索结果
        
        评估维度：
        1. 完整性评估 - 是否包含用户需要的所有信息
        2. 准确性评估 - 信息是否准确无误
        3. 相关性评估 - 结果与查询的匹配程度
        4. 丰富性评估 - 信息的详细程度和深度
        5. 连贯性评估 - 信息之间的逻辑关系
        """
        
    async def identify_gaps(self, evaluation: EvaluationResult) -> List[InformationGap]:
        """识别信息缺口"""
        
    async def calculate_satisfaction_score(self, evaluation: EvaluationResult) -> float:
        """计算满意度分数"""

class EvaluationResult:
    """评估结果"""
    
    completeness_score: float  # 完整性分数 0-1
    accuracy_score: float      # 准确性分数 0-1  
    relevance_score: float     # 相关性分数 0-1
    richness_score: float      # 丰富性分数 0-1
    coherence_score: float     # 连贯性分数 0-1
    
    overall_score: float       # 总体分数 0-1
    is_satisfactory: bool      # 是否满意
    
    gaps: List[InformationGap] # 信息缺口
    suggestions: List[str]     # 改进建议
```

## 缓存策略

### 1. 多级缓存设计

```python
class CacheManager:
    """缓存管理器"""
    
    def __init__(self):
        self.memory_cache = {}  # 内存缓存，生命周期短
        self.redis_cache = None  # Redis缓存，可选
    
    async def get(self, key: str) -> Optional[Any]:
        """获取缓存数据"""
        
    async def set(self, key: str, value: Any, ttl: int = 3600):
        """设置缓存数据"""
```

### 2. 缓存策略

- **API结果缓存**: 1小时TTL，减少API调用
- **关联数据缓存**: 30分钟TTL，平衡时效性和性能
- **格式化结果缓存**: 10分钟TTL，加速重复查询

## 错误处理

### 1. API调用错误处理

```python
class APIErrorHandler:
    """API错误处理器"""
    
    async def with_retry(self, api_call, max_retries: int = 3):
        """带重试的API调用"""
        
    def handle_rate_limit(self, response):
        """处理频率限制"""
        
    def handle_not_found(self, response):
        """处理资源不存在"""
```

### 2. 优雅降级

- API失败时返回部分结果
- 网络超时时使用缓存数据
- 格式化失败时返回原始数据

## 性能优化

### 1. 并发请求

```python
async def parallel_api_calls(self, api_calls: List):
    """并行执行多个API调用"""
    tasks = [asyncio.create_task(call) for call in api_calls]
    return await asyncio.gather(*tasks, return_exceptions=True)
```

### 2. 请求合并

- 合并相似的API请求
- 批量获取关联数据
- 减少网络往返次数

### 3. 结果流式处理

- 边获取边处理数据
- 提前返回部分结果
- 提升用户体验

## 使用示例

### 示例1：基础条目查询

```python
query = "查找进击的巨人相关信息"
result = await bangumi_search(query)

# AutoGPT式工作流：
# 1. 计划制定：[搜索条目] → [获取详情] → [格式化输出]
# 2. 执行：调用search_subjects API
# 3. 评估：检查是否获得足够信息
# 4. 反思：信息完整，无需调整
# 5. 输出：

## 进击的巨人

**基本信息**
- 类型：动画
- 播出时间：2013年4月  
- 集数：25集
- 评分：8.7/10

**剧情简介**
在被巨大的城墙包围的城市中，人类与巨人展开生死搏斗...

**制作信息**
- 制作公司：WIT STUDIO
- 监督：荒木哲郎
- 原作：諫山創
```

### 示例2：复杂关联查询

```python
query = "进击的巨人主要角色的声优信息，特别是他们的其他代表作"
result = await bangumi_search(query)

# AutoGPT式工作流：
# 1. 计划制定：[搜索条目] → [获取角色] → [获取声优] → [获取声优作品] → [整理输出]
# 2. 执行：多步API调用
# 3. 评估：检查信息完整性
# 4. 反思：需要补充部分声优的代表作信息
# 5. 调整：添加补充搜索步骤
# 6. 再执行：获取缺失信息
# 7. 最终输出：

## 进击的巨人 - 主要声优阵容

**主角**
- **艾伦·耶格尔** (CV: 梶裕贵)
  - 代表作：七大罪 (梅利奥达斯)、妖精的尾巴 (纳兹)、钢炼FA (恩维)
  - 配音特点：热血少年角色专家

- **三笠·阿克曼** (CV: 石川由依)  
  - 代表作：紫罗兰永恒花园 (紫罗兰)、物语系列 (羽川翼)
  - 配音特点：冷静坚强的女性角色

**配角**
- **阿明·阿诺德** (CV: 井上麻里奈)
  - 代表作：钢炼 (阿尔冯斯)、境界之轮廓 (式)
```

### 示例3：深度分析查询

```python
query = "分析宫崎骏动画的艺术风格特点，并比较他不同时期的作品"
result = await bangumi_search(query)

# AutoGPT式工作流：
# 1. 计划制定：[搜索宫崎骏] → [获取作品列表] → [获取作品详情] → [分析风格] → [时期对比]
# 2. 执行：获取相关数据
# 3. 评估：信息足够，但需要更深入的风格分析
# 4. 反思：添加制作信息和评论分析
# 5. 调整：补充获取制作细节
# 6. 最终输出：

## 宫崎骏动画艺术风格分析

**整体特征**
- 自然主义：对自然环境的细腻描绘
- 飞行意象：几乎每部作品都有飞行场景
- 强势女主：塑造独立坚强的女性角色
- 环保理念：人与自然和谐共处的主题

**时期划分与特点**

**早期作品 (1984-1992)**
- 风之谷、天空之城、龙猫
- 特点：奇幻冒险，世界观宏大
- 技术：传统手绘，色彩清淡

**成熟期 (1997-2004)**  
- 幽灵公主、千与千寻
- 特点：主题深刻，技术成熟
- 突破：CG技术的适度运用

**晚期作品 (2008-2013)**
- 悬崖上的金鱼姬、起风了
- 特点：回归简朴，更加个人化
- 风格：水彩画般的柔和质感
```

## 部署和集成

### 1. 模块导入

```python
# ai-service/app/agents/bangumi/__init__.py
from .agent import bangumi_search

__all__ = ["bangumi_search"]
```

### 2. 工具注册

```python
# 在现有工具系统中注册
from app.agents.bangumi import bangumi_search

# 工具会自动通过@tool装饰器注册到系统中
```

### 3. 配置管理

```python
# 环境变量配置
BANGUMI_ACCESS_TOKEN=your_access_token
BANGUMI_API_BASE_URL=https://api.bgm.tv
BANGUMI_CACHE_TTL=3600
BANGUMI_MAX_RETRIES=3
```

## 测试策略

### 1. 单元测试

```python
# tests/agents/test_bangumi_agent.py
class TestBangumiAgent:
    async def test_basic_search(self):
        """测试基础搜索功能"""
        
    async def test_related_search(self):
        """测试关联搜索功能"""
        
    async def test_intent_parsing(self):
        """测试意图识别功能"""
```

### 2. 集成测试

```python
class TestBangumiIntegration:
    async def test_full_workflow(self):
        """测试完整工作流"""
        
    async def test_error_handling(self):
        """测试错误处理"""
```

### 3. 性能测试

- API响应时间测试
- 并发请求测试
- 缓存效果测试

## 维护和扩展

### 1. 日志记录

```python
import logging

logger = logging.getLogger(__name__)

# 记录关键操作
logger.info(f"执行搜索: {query}")
logger.debug(f"API调用: {api_endpoint}")
logger.error(f"搜索失败: {error}")
```

### 2. 监控指标

- API调用成功率
- 响应时间分布
- 缓存命中率
- 错误类型统计

### 3. 功能扩展点

- 支持更多搜索类型
- 增加推荐算法
- 添加用户偏好学习
- 集成其他ACG数据源

## 总结

本设计方案将现有的bangumi相关功能重构为一个独立、智能的Agent工具，具有以下优势：

1. **统一接口**: 通过单一的`bangumi_search`工具对外提供服务
2. **智能化**: 自动识别查询意图，执行相应的搜索策略
3. **深度搜索**: 支持多层关联查询，提供丰富的相关信息
4. **高性能**: 通过缓存、并发等技术优化响应速度
5. **可扩展**: 模块化设计，便于功能扩展和维护

该Agent将显著提升Bangumi相关查询的用户体验，为用户提供更智能、更全面的ACG信息搜索服务。
