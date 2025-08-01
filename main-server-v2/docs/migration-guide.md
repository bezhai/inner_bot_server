# Migration Guide: Main Server v1 to v2

## Overview

This guide provides step-by-step instructions for migrating from Main Server v1 (Koa.js + TypeORM) to v2 (NestJS + Prisma + DDD).

## Key Changes

### Architecture
- **Framework**: Koa.js → NestJS
- **ORM**: TypeORM → Prisma
- **Architecture Pattern**: Traditional Layered → Domain-Driven Design (DDD)
- **Project Structure**: Single package → Monorepo with multiple packages

### Technology Stack
- **Runtime**: Node.js 20 LTS (ensure compatibility)
- **Package Manager**: npm/yarn → pnpm
- **Testing**: Jest (retained) with improved coverage
- **Documentation**: Swagger/OpenAPI integrated

## Breaking Changes

### API Endpoints
- Base path changed from `/` to `/api`
- Webhook endpoint: `/webhook` → `/api/webhook/lark/event`
- Health check: `/health` → `/api/health` (with additional endpoints)
- API versioning introduced (default: v1)

### Environment Variables
Several environment variables have been renamed or added:
- `FEISHU_APP_ID` → `LARK_APP_ID`
- `FEISHU_APP_SECRET` → `LARK_APP_SECRET`
- New: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`
- New: `AI_SERVICE_TIMEOUT`, `HEALTH_CHECK_TIMEOUT`

### Database Schema
- New `messages` table for message persistence
- Modified indexes on existing tables for better performance
- JSONB columns used for flexible data storage

## Migration Steps

### Phase 1: Preparation (Pre-deployment)

1. **Backup Current Data**
   ```bash
   # Backup PostgreSQL
   pg_dump -h localhost -U mainserver -d mainserver_prod > backup_$(date +%Y%m%d).sql
   
   # Backup Redis
   redis-cli --rdb /path/to/backup/dump_$(date +%Y%m%d).rdb
   ```

2. **Review Configuration**
   - Compare `.env` files between v1 and v2
   - Update environment variables according to breaking changes
   - Ensure all required services are available (PostgreSQL, Redis, MongoDB)

3. **Test v2 Locally**
   ```bash
   # Clone v2 repository
   git clone <v2-repo-url>
   cd main-server-v2
   
   # Install dependencies
   pnpm install
   
   # Run tests
   pnpm test
   
   # Start locally with test database
   docker-compose up -d
   pnpm dev
   ```

### Phase 2: Database Migration

1. **Run Prisma Migrations**
   ```bash
   # Generate Prisma client
   cd packages/infra
   npx prisma generate
   
   # Create migration (review before applying)
   npx prisma migrate dev --name initial_v2_schema
   
   # Apply to production (careful!)
   DATABASE_URL=<production-url> npx prisma migrate deploy
   ```

2. **Verify Data Integrity**
   - Check that existing tables are intact
   - Verify new tables are created
   - Test queries against production data

### Phase 3: Deployment Strategy

#### Option A: Blue-Green Deployment (Recommended)

1. **Deploy v2 to New Environment**
   ```bash
   # Build Docker image
   docker build -t main-server-v2:latest .
   
   # Deploy to staging
   docker run -d \
     --name main-server-v2-staging \
     --env-file .env.staging \
     -p 3001:3000 \
     main-server-v2:latest
   ```

2. **Test v2 in Staging**
   - Run E2E tests against staging
   - Verify Lark webhook integration
   - Test AI service connectivity
   - Monitor performance metrics

3. **Gradual Traffic Migration**
   - Configure load balancer to route 10% traffic to v2
   - Monitor error rates and performance
   - Gradually increase traffic: 10% → 25% → 50% → 100%
   - Keep v1 running for quick rollback

4. **Complete Migration**
   - Once stable, route 100% traffic to v2
   - Keep v1 instances for 24-48 hours
   - Decommission v1 after confirming stability

#### Option B: Rolling Update

1. **Update One Instance at a Time**
   ```bash
   # For each instance
   docker stop main-server-v1-instance-1
   docker run -d \
     --name main-server-v2-instance-1 \
     --env-file .env.production \
     -p 3000:3000 \
     main-server-v2:latest
   ```

2. **Monitor Each Instance**
   - Check health endpoints
   - Verify message processing
   - Monitor error logs

### Phase 4: Post-Migration

1. **Monitor System Health**
   ```bash
   # Check health endpoints
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/health/ready
   
   # Monitor logs
   docker logs -f main-server-v2 | grep ERROR
   
   # Check metrics
   curl http://localhost:3000/api/health/metrics
   ```

2. **Performance Validation**
   - Run performance tests
   - Compare metrics with v1 baseline
   - Optimize if necessary

3. **Update Documentation**
   - Update API documentation
   - Update runbooks
   - Update monitoring dashboards

## Rollback Plan

If issues arise during migration:

1. **Immediate Rollback** (< 5 minutes)
   ```bash
   # Route traffic back to v1
   # Update load balancer configuration
   
   # Or stop v2 containers
   docker stop main-server-v2-*
   docker start main-server-v1-*
   ```

2. **Data Rollback** (if needed)
   ```bash
   # Restore PostgreSQL backup
   psql -h localhost -U mainserver -d mainserver_prod < backup_YYYYMMDD.sql
   
   # Note: May lose data between backup and rollback
   ```

## Monitoring Checklist

During and after migration, monitor:

- [ ] Response times (P50, P95, P99)
- [ ] Error rates (4xx, 5xx)
- [ ] Message processing success rate
- [ ] AI service integration
- [ ] Database connection pool
- [ ] Redis connection stability
- [ ] Memory usage
- [ ] CPU usage
- [ ] Disk I/O
- [ ] Network latency

## Common Issues and Solutions

### Issue: High Memory Usage
**Solution**: Adjust Node.js heap size
```bash
NODE_OPTIONS="--max-old-space-size=2048" node dist/main.js
```

### Issue: Database Connection Errors
**Solution**: Increase connection pool size
```env
DATABASE_URL="postgresql://...?connection_limit=20"
```

### Issue: Rate Limiting Too Aggressive
**Solution**: Adjust rate limit settings
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Issue: Lark Webhook Verification Fails
**Solution**: Ensure correct app credentials
```env
LARK_APP_ID=<correct-app-id>
LARK_APP_SECRET=<correct-app-secret>
LARK_VERIFICATION_TOKEN=<correct-token>
```

## Support

For migration support:
1. Check logs: `docker logs main-server-v2`
2. Review error details in structured logs
3. Contact development team with error traces

## Timeline Estimate

- **Preparation**: 2-4 hours
- **Database Migration**: 1-2 hours
- **Deployment**: 2-4 hours
- **Validation**: 2-4 hours
- **Total**: 1-2 days (including monitoring period)

## Success Criteria

Migration is considered successful when:
- ✅ All health checks passing
- ✅ Message processing rate ≥ v1
- ✅ Error rate < 0.1%
- ✅ P95 latency < 200ms
- ✅ No data loss reported
- ✅ All integrations functional
- ✅ 24 hours stable operation