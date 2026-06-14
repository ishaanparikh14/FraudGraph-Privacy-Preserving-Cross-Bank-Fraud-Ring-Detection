# Graph Engine Testing Guide

## Quick Start Testing

### 1. Start Services

```bash
# From project root
docker-compose up -d

# Wait for services to be ready (30 seconds)
sleep 30

# Check all services are running
docker-compose ps
```

### 2. Send Test Fraud Ring

```bash
cd graph-engine

# Send simple 3-node fraud ring
./scripts/send-test-data.sh simple

# Or send complex network with 3 rings
./scripts/send-test-data.sh complex
```

### 3. Verify Detection

```bash
# Check fraud rings detected
curl http://localhost:8081/api/graph/rings | jq

# Check graph statistics
curl http://localhost:8081/api/graph/statistics | jq

# Check benchmark
curl http://localhost:8081/api/benchmark/summary | jq
```

## Manual Testing

### Test 1: Simple Fraud Ring (3 Nodes)

**Scenario**: ACC1 → ACC2 → ACC3 → ACC1 (cycle)

**Steps**:

1. Send transactions:
```bash
# Transaction 1
echo '{"txn_id":"TXN001","sender_id":"ACC1","receiver_id":"ACC2","amount":5000,"timestamp":"2026-04-20T10:00:00Z","risk_score":0.95,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

# Transaction 2
echo '{"txn_id":"TXN002","sender_id":"ACC2","receiver_id":"ACC3","amount":3000,"timestamp":"2026-04-20T10:01:00Z","risk_score":0.92,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

# Transaction 3 (completes cycle)
echo '{"txn_id":"TXN003","sender_id":"ACC3","receiver_id":"ACC1","amount":2000,"timestamp":"2026-04-20T10:02:00Z","risk_score":0.88,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

2. Wait 2 seconds for processing

3. Check results:
```bash
curl http://localhost:8081/api/graph/rings | jq
```

**Expected Output**:
```json
{
  "rings": [
    {
      "ring_id": "RING_001",
      "nodes": [
        {"id": "ACC1", "centrality_score": 0.33, ...},
        {"id": "ACC2", "centrality_score": 0.33, ...},
        {"id": "ACC3", "centrality_score": 0.33, ...}
      ],
      "edges": [
        {"txn_id": "TXN001", "from": "ACC1", "to": "ACC2", "amount": 5000.0, ...},
        {"txn_id": "TXN002", "from": "ACC2", "to": "ACC3", "amount": 3000.0, ...},
        {"txn_id": "TXN003", "from": "ACC3", "to": "ACC1", "amount": 2000.0, ...}
      ],
      "total_volume": 10000.0,
      "priority_rank": 1,
      "detection_method": "Tarjan_SCC"
    }
  ]
}
```

### Test 2: Multiple Fraud Rings

**Scenario**: 2 separate fraud rings

**Steps**:

1. Send Ring 1 (ACC1 → ACC2 → ACC1):
```bash
echo '{"txn_id":"TXN101","sender_id":"ACC1","receiver_id":"ACC2","amount":5000,"timestamp":"2026-04-20T11:00:00Z","risk_score":0.95,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

echo '{"txn_id":"TXN102","sender_id":"ACC2","receiver_id":"ACC1","amount":4000,"timestamp":"2026-04-20T11:01:00Z","risk_score":0.93,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

2. Send Ring 2 (ACC10 → ACC11 → ACC12 → ACC10):
```bash
echo '{"txn_id":"TXN201","sender_id":"ACC10","receiver_id":"ACC11","amount":8000,"timestamp":"2026-04-20T11:02:00Z","risk_score":0.97,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

echo '{"txn_id":"TXN202","sender_id":"ACC11","receiver_id":"ACC12","amount":7000,"timestamp":"2026-04-20T11:03:00Z","risk_score":0.96,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

echo '{"txn_id":"TXN203","sender_id":"ACC12","receiver_id":"ACC10","amount":6000,"timestamp":"2026-04-20T11:04:00Z","risk_score":0.94,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

3. Check results:
```bash
curl http://localhost:8081/api/graph/rings | jq '.rings | length'
# Expected: 2
```

**Expected**: 2 separate rings, ranked by total_volume (Ring 2 should be rank 1)

### Test 3: Low-Risk Transaction (Should Be Ignored)

**Steps**:

1. Send low-risk transaction:
```bash
echo '{"txn_id":"TXN999","sender_id":"ACC99","receiver_id":"ACC98","amount":100,"timestamp":"2026-04-20T12:00:00Z","risk_score":0.15,"is_high_risk":false}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

2. Check logs:
```bash
docker logs graph-engine | grep "TXN999"
# Expected: "Skipping low-risk transaction: TXN999"
```

3. Verify not in graph:
```bash
curl http://localhost:8081/api/graph/statistics | jq
# Node/edge count should not increase
```

### Test 4: PageRank Centrality

**Scenario**: Hub node with multiple connections

**Steps**:

1. Create star topology (ACC_HUB is central):
```bash
# ACC_HUB → ACC1 → ACC_HUB (cycle 1)
echo '{"txn_id":"TXN301","sender_id":"ACC_HUB","receiver_id":"ACC1","amount":1000,"timestamp":"2026-04-20T13:00:00Z","risk_score":0.90,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

echo '{"txn_id":"TXN302","sender_id":"ACC1","receiver_id":"ACC_HUB","amount":900,"timestamp":"2026-04-20T13:01:00Z","risk_score":0.89,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

# ACC_HUB → ACC2 → ACC_HUB (cycle 2)
echo '{"txn_id":"TXN303","sender_id":"ACC_HUB","receiver_id":"ACC2","amount":1000,"timestamp":"2026-04-20T13:02:00Z","risk_score":0.90,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored

echo '{"txn_id":"TXN304","sender_id":"ACC2","receiver_id":"ACC_HUB","amount":900,"timestamp":"2026-04-20T13:03:00Z","risk_score":0.89,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

2. Check centrality scores:
```bash
curl http://localhost:8081/api/graph/rings | jq '.rings[].nodes[] | select(.id == "ACC_HUB") | .centrality_score'
```

**Expected**: ACC_HUB should have highest centrality_score (close to 1.0)

### Test 5: Alert Integration with Person 1

**Steps**:

1. Send fraud ring:
```bash
./scripts/send-test-data.sh simple
```

2. Check Graph Engine sent alert:
```bash
docker logs graph-engine | grep "Alert sent successfully"
# Expected: "Alert sent successfully for ring: RING_001"
```

3. Check Person 1 received alert:
```bash
docker logs fraudgraph-api | grep "fraud-ring"
# Expected: POST /alerts/fraud-ring - 202 Accepted
```

4. Verify alert throttling (send same ring again):
```bash
# Wait < 30 seconds and check
docker logs graph-engine | grep "throttle"
```

### Test 6: Benchmark Performance

**Steps**:

1. Trigger benchmark:
```bash
curl -X POST http://localhost:8081/api/benchmark/run | jq
```

2. Check results:
```bash
curl http://localhost:8081/api/benchmark/summary | jq
```

**Expected Output**:
```json
{
  "graph_tarjan_ms": 12.4,
  "sql_naive_join_ms": 840.1,
  "speedup": 67.75,
  "node_count": 1000,
  "edge_count": 5000,
  "dataset_note": "In-memory graph: N=1000 nodes, E=5000 edges",
  "captured_at": "2026-04-20T10:00:00Z"
}
```

**Expected**: Tarjan should be 50-100x faster than SQL simulation

## Integration Testing

### Full Pipeline Test

**Scenario**: End-to-end flow from Kafka to Frontend

**Steps**:

1. Start all services:
```bash
docker-compose up -d
```

2. Send transactions:
```bash
cd graph-engine
./scripts/send-test-data.sh complex
```

3. Verify Graph Engine:
```bash
curl http://localhost:8081/api/graph/rings | jq '.rings | length'
# Expected: 3 rings
```

4. Verify Person 1 received alerts:
```bash
docker logs fraudgraph-api | grep "fraud-ring" | wc -l
# Expected: 3 (one per ring)
```

5. Simulate Person 4 fetching data:
```bash
# Fetch all rings
curl http://localhost:8081/api/graph/rings > rings.json

# Fetch specific ring
curl http://localhost:8081/api/graph/rings/RING_001 > ring_001.json

# Fetch benchmark
curl http://localhost:8081/api/benchmark/summary > benchmark.json
```

## Load Testing

### High-Volume Transaction Test

**Scenario**: 1000 transactions in 10 seconds

**Steps**:

1. Generate test data:
```bash
# Create 1000 transactions
for i in {1..1000}; do
  ACC1=$((i % 100))
  ACC2=$(((i + 1) % 100))
  echo "{\"txn_id\":\"TXN$i\",\"sender_id\":\"ACC$ACC1\",\"receiver_id\":\"ACC$ACC2\",\"amount\":$((RANDOM % 10000)),\"timestamp\":\"2026-04-20T14:00:00Z\",\"risk_score\":0.9,\"is_high_risk\":true}"
done > /tmp/load_test.json
```

2. Send to Kafka:
```bash
cat /tmp/load_test.json | docker exec -i fraudgraph-kafka-1 \
  kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

3. Monitor performance:
```bash
# Watch logs
docker logs -f graph-engine

# Check statistics
watch -n 1 'curl -s http://localhost:8081/api/graph/statistics | jq'
```

4. Run benchmark:
```bash
curl -X POST http://localhost:8081/api/benchmark/run | jq
```

**Expected**: 
- All transactions processed within 30 seconds
- Tarjan SCC completes in < 100ms for 1000 nodes
- Memory usage < 500MB

## Postman Testing

### Import Collection

1. Open Postman
2. Import `postman/Graph-Engine-API.postman_collection.json`
3. Run collection

### Key Tests

1. **Health Check**: Verify service is running
2. **Get All Rings**: Fetch fraud rings
3. **Get Specific Ring**: Test ring ID lookup
4. **Get Statistics**: Monitor graph size
5. **Get Benchmark**: Performance metrics
6. **Send Alert**: Test Person 1 integration

## Debugging

### Check Kafka Consumer

```bash
# View consumer group
docker exec fraudgraph-kafka-1 kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe \
  --group fraudgraph-graph-engine

# Expected: LAG should be 0 (all messages consumed)
```

### Check Graph State

```bash
# Get statistics
curl http://localhost:8081/api/graph/statistics | jq

# Expected output:
{
  "nodeCount": 10,
  "edgeCount": 15,
  "avgOutDegree": 1.5
}
```

### Check Logs

```bash
# View all logs
docker logs graph-engine

# Filter for errors
docker logs graph-engine | grep ERROR

# Filter for fraud detection
docker logs graph-engine | grep "fraud ring"

# Filter for alerts
docker logs graph-engine | grep "Alert sent"
```

### Check Memory Usage

```bash
docker stats graph-engine --no-stream
```

## Common Issues

### Issue: No fraud rings detected

**Diagnosis**:
```bash
# Check if transactions are being consumed
docker logs graph-engine | grep "Received transaction"

# Check graph has data
curl http://localhost:8081/api/graph/statistics | jq

# Check for cycles
curl http://localhost:8081/api/graph/rings | jq
```

**Solutions**:
1. Ensure `is_high_risk == true`
2. Verify cycle exists (at least 2 nodes with circular edges)
3. Check Kafka topic name matches `transactions.scored`

### Issue: Alert not sent

**Diagnosis**:
```bash
# Check Person 1 is reachable
docker exec graph-engine curl http://fraudgraph-api:8080/actuator/health

# Check alert service logs
docker logs graph-engine | grep AlertService
```

**Solutions**:
1. Verify `SPRING_API_BASE_URL=http://fraudgraph-api:8080`
2. Check Person 1 is running
3. Wait for throttle period (30s)

### Issue: High memory usage

**Diagnosis**:
```bash
docker stats graph-engine --no-stream
```

**Solutions**:
1. Graph is in-memory: memory = O(V + E)
2. For production, implement periodic cleanup
3. Consider graph persistence

## Performance Benchmarks

### Expected Results

| Metric | Value |
|--------|-------|
| Transaction ingestion | < 10ms per transaction |
| Tarjan SCC (1K nodes) | 5-10ms |
| Tarjan SCC (10K nodes) | 50-100ms |
| PageRank (15 iterations, 1K nodes) | 20-50ms |
| Alert sending | < 100ms |
| API response time | < 50ms |

### Measuring Performance

```bash
# Measure API response time
time curl http://localhost:8081/api/graph/rings > /dev/null

# Measure benchmark
curl -X POST http://localhost:8081/api/benchmark/run | jq '.graph_tarjan_ms'
```

## Cleanup

```bash
# Stop services
docker-compose down

# Remove volumes (clears Kafka data)
docker-compose down -v

# Remove test data
rm /tmp/load_test.json
```

## Automated Testing Script

```bash
#!/bin/bash
# test-all.sh - Run all tests

set -e

echo "=== Starting FraudGraph Graph Engine Tests ==="

# 1. Health check
echo "1. Health check..."
curl -f http://localhost:8081/api/health > /dev/null
echo "✓ Service is healthy"

# 2. Send test data
echo "2. Sending test fraud ring..."
cd graph-engine
./scripts/send-test-data.sh simple
sleep 3

# 3. Verify detection
echo "3. Verifying fraud ring detection..."
RING_COUNT=$(curl -s http://localhost:8081/api/graph/rings | jq '.rings | length')
if [ "$RING_COUNT" -gt 0 ]; then
    echo "✓ Detected $RING_COUNT fraud ring(s)"
else
    echo "✗ No fraud rings detected"
    exit 1
fi

# 4. Check statistics
echo "4. Checking graph statistics..."
curl -s http://localhost:8081/api/graph/statistics | jq

# 5. Run benchmark
echo "5. Running benchmark..."
curl -s -X POST http://localhost:8081/api/benchmark/run | jq

echo ""
echo "=== All tests passed! ==="
```

Save as `test-all.sh`, make executable, and run:
```bash
chmod +x test-all.sh
./test-all.sh
```

