#!/bin/bash

# 生成 TypeScript 类型
jtd-codegen --typescript-out=../main-server/generated/types ./schemas/*.jtd.json

# 生成 Python 类型
jtd-codegen --python-out=../ai-service/generated/types ./schemas/*.jtd.json