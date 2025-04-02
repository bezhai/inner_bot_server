#!/bin/bash
set -e

# 等待 Elasticsearch 启动
until curl -s http://elasticsearch:9200 >/dev/null; do
    echo 'Waiting for Elasticsearch...'
    sleep 5
done

# 创建 Kibana 服务账号
curl -X POST "http://elasticsearch:9200/_security/service/elastic/kibana/credential/token" \
    -H "Content-Type: application/json" \
    -u elastic:${ELASTIC_PASSWORD} \
    -d '{
      "name": "kibana_token"
    }' | tee /tmp/token_response.json

# 提取 token 并设置环境变量
export KIBANA_SERVICE_TOKEN=$(cat /tmp/token_response.json | jq -r '.token.value')

# 清理临时文件
rm /tmp/token_response.json 