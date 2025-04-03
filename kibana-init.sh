#!/bin/sh
set -e

# 等待 Elasticsearch 启动
until curl -s -u elastic:${ELASTIC_PASSWORD} http://elasticsearch:9200/_cluster/health > /dev/null; do 
    echo "Waiting for Elasticsearch..."
    sleep 5
done

# 获取 enrollment token
ENROLLMENT_TOKEN=$(curl -s -X POST -u elastic:${ELASTIC_PASSWORD} http://elasticsearch:9200/_security/enrollment/kibana/token | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Enrollment token: $ENROLLMENT_TOKEN"

# 配置 Kibana
cat > /usr/share/kibana/config/kibana.yml << EOF
elasticsearch.hosts: ["http://elasticsearch:9200"]
elasticsearch.serviceAccountToken: $ENROLLMENT_TOKEN
EOF

# 启动 Kibana
exec /usr/local/bin/kibana-docker 