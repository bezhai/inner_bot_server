## main-server 重构详细计划（2025-08-01）

### 目标
1. 提高代码可读性与可维护性
2. 降低模块耦合度，明确边界
3. 在保证现有功能稳定的前提下，逐步演进架构

---

### 阶段化里程碑
| 阶段 | 里程碑 | 预计耗时 | 关键产出 |
| ---- | ------ | -------- | -------- |
| P0   | 基线建立 | 1d | • 当前测试覆盖率报告<br>• 复杂度/重复率报告 |
| P1   | 补充核心测试 | 3d | • ✅ 80%+ 行覆盖率<br>• e2e & 集成测试脚手架 |
| P2   | 清理死代码 | 2d | • 移除无用文件/引用<br>• 规范化注释 |
| P3   | 统一规范 | 1d | • ESLint + Prettier 一致配置<br>• husky + lint-staged 钩子 |
| P4   | 消除重复 | 2d | • utils/common 库<br>• 重复逻辑迁移&删除 |
| P5   | 重构拆分 | 5d | • 模块化目录结构<br>• 20%+ 大函数拆分 |
| P6   | 理清依赖 | 3d | • DI/接口抽象<br>• 外部集成适配层 |

> 注：耗时基于 1 人/天 8h 估算，可并行缩短。

---

### 详细任务拆解

#### P0 基线建立
1. **依赖安装**：升级到最新 LTS Node & pnpm；锁定 `package.json` 版本。
2. **度量工具**：接入 `jest --coverage`, `ts-node`, `ts-prune`, `madge`, `plato`。
3. **报告输出**：
   - `coverage/` 目录
   - `reports/deps.svg` 模块依赖图
   - `reports/complexity.html` 复杂度

#### P1 补充测试
1. **识别核心路径**
   - `src/index.ts` 启动逻辑
   - `services/message-processing` 消息处理
   - `services/ai` 对接 LLM
2. **单元测试**：使用 `jest` + `ts-jest`，mock 外部依赖（DB、HTTP）。
3. **集成测试**：使用 `supertest` 对 `express` 路由进行黑盒验证。
4. **覆盖率阈值**：`statements 80%, branches 75%`，CI 失败门槛。

#### P2 清理死代码
1. 运行 `ts-prune`, `eslint --rule no-unused-vars:error` 捕获未引用符号。
2. 删除 `utils/text/legacy-*`, `services/prompts/old-*` 等孤儿文件。
3. 精简 README 中过期段落。
4. 使用 `git grep -n -e TODO -e FIXME` 逐项确认。

#### P3 统一规范
1. **Lint 规则**：合并根目录 `.eslintrc.js` 与 `main-server/eslint.config.js`，消除冲突。
2. **格式化**：统一 `.prettierrc`，采用 airbnb 风格。
3. **Git 钩子**：`husky pre-commit` ⇒ `npm run lint && npm test --bail`。
4. **命名约定**：
   - 目录：`kebab-case`
   - 文件：导出默认类则 `PascalCase.ts`，否则 `camelCase.ts`。

#### P4 消除重复
1. 利用 `jscpd` 生成重复代码报告。
2. 将 `utils/cache`, `utils/rate-limiting` 公共化至 `src/common` 包。
3. 对比 `services/integrations/*` 相似 HTTP 调用，封装 `HttpClient`。

#### P5 重构拆分
1. **目录调整**
   ```
   src/
     app/          // HTTP 层（路由/控制器）
     domain/       // 领域模型 (Entity, VO)
     infra/        // 基础设施 (ORM, 外部服务)
     usecases/     // 用例 & 服务
     shared/
   ```
2. **大函数拆分**：
   - `message-processing/pipeline.ts` (>300 行) ⇒ 拆成多 stage 函数链。
   - `services/ai/openai.ts` 中请求&重试逻辑独立。
3. **类职责单一**：每个类只暴露 1 入口方法。

#### P6 理清依赖
1. 引入 `tsyringe` 作为 DI 容器。
2. 定义接口层 `src/contracts/*.ts`，外部实现放 `infra/`。
3. 使用 `madge --circular` 消除循环依赖。
4. 将环境变量读取集中到 `config.ts`，模块通过构造注入获取。

---

### CI/CD 更新
1. GitHub Actions workflow：`install → lint → test → docker build`。
2. 失败阈值：覆盖率 & lint 必须通过。
3. 自动发布 `latest` docker tag，仅当 `main` 分支通过。

---

### 回滚策略
1. 所有重构步骤必须保持 **测试绿灯**。
2. 若覆盖率低于阈值或功能异常，立即回退到最近 tag。
3. 采用 `git-flow`，每阶段创建 feature branch，完成后 merge。

---

### 潜在风险 & 缓解
| 风险 | 影响 | 缓解 |
| ---- | ---- | ---- |
| 测试不充分 | 重构引入隐患 | 先补测核心路径，开启覆盖阈值 |
| 循环依赖导致编译失败 | 无法打包 | 使用 madge 提前扫描 |
| 业务停摆窗口 | PR 大量未 review | 控制 PR < 500 行，拆分合并 |

---

### 结束标准
- [ ] 所有阶段 checklist 完成
- [ ] main-server 覆盖率 ≥ 80%
- [ ] `madge --circular` 无输出
- [ ] `npm run lint` 无 error
- [ ] `docker-compose up` web-manager & main-server 正常通信

> 文档维护者：@backend-team