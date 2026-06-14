# Graph Engine - Quick Start Guide

## 5-Minute Setup

### Step 1: Start Services (1 min)

```bash
# From project root
docker-compose up -d

# Wait for services to start
sleep 30
```

### Step 2: Verify Services (30 sec)

```bash
# Check Graph Engine
curl http://localhost:8081/api/health
# Expected: {"status":"UP","service":"graph-engine"}

# Check Person 1 API
curl http://localhost:8080/actuator/health
# Expected: {"status":"UP"}

# Check Kafka
docker ps | grep kafka
# Expected: kafka container running
```

### Step 3: Send Test Fraud Ring (1 min)

```bash
cd graph-engine

# Send 3 transactions forming a cycle
./scripts/send-test-data.sh simple

# Wait for processing
sleep 3
```

### Step 4: View Results (30 sec)

```bash
# Get detected fraud rings
curl http://localhost:8081/api/graph/rings | jq

# Get graph statistics
curl http://localhost:8081/api/graph/statistics | jq

# Get benchmark
curl http://localhost:8081/api/benchmark/summary | jq
```

### Step 5: Verify Integration (1 min)

```bash
# Check Graph Engine sent alert to Person 1
docker logs graph-engine | grep "Alert sent successfully"

# Check Person 1 received alert
docker logs fraudgraph-api | grep "fraud-ring"
```

## Expected Output

### Fraud Ring Response

```json
{
  "rings": [
    {
      "ring_id": "RING_001",
      "nodes": [
        {"id": "ACC1", "centrality_score": 0.33, "scc_cluster_id": "RING_001"},
        {"id": "ACC2", "centrality_score": 0.33, "scc_cluster_id": "RING_001"},
        {"id": "ACC3", "centrality_score": 0.33, "scc_cluster_id": "RING_001"}
      ],
      "edges": [
        {
          "txn_id": "TXN001",
          "from": "ACC1",
          "to": "ACC2",
          "amount": 5000.0,
          "timestamp": "2026-04-20T10:00:00Z",
          "risk_score": 0.95
        },
        {
          "txn_id": "TXN002",
          "from": "ACC2",
          "to": "ACC3",
          "amount": 3000.0,
          "timestamp": "2026-04-20T10:01:00Z",
          "risk_score": 0.92
        },
        {
          "txn_id": "TXN003",
          "from": "ACC3",
          "to": "ACC1",
          "amount": 2000.0,
          "timestamp": "2026-04-20T10:02:00Z",
          "risk_score": 0.88
        }
      ],
      "total_volume": 10000.0,
      "priority_rank": 1,
      "detection_method": "Tarjan_SCC",
      "dfs_back_edge": {
        "from": "ACC3",
        "to": "ACC1"
      }
    }
  ],
  "generated_at": "2026-04-20T10:02:05Z"
}
```

## Common Commands

### View Logs

```bash
# Graph Engine logs
docker logs graph-engine

# Follow logs in real-time
docker logs -f graph-engine

# Filter for errors
docker logs graph-engine | grep ERROR
```

### Send Custom Transaction

```bash
echo '{"txn_id":"TXN999","sender_id":"ACC10","receiver_id":"ACC11","amount":1000,"timestamp":"2026-04-20T15:00:00Z","risk_score":0.90,"is_high_risk":true}' | \
docker exec -i fraudgraph-kafka-1 kafka-console-producer --bootstrap-server localhost:9092 --topic transactions.scored
```

### Check Graph State

```bash
# Statistics
curl http://localhost:8081/api/graph/statistics | jq

# All rings
curl http://localhost:8081/api/graph/rings | jq '.rings | length'

# Specific ring
curl http://localhost:8081/api/graph/rings/RING_001 | jq
```

### Run Benchmark

```bash
curl -X POST http://localhost:8081/api/benchmark/run | jq
```

## Troubleshooting

### No fraud rings detected?

```bash
# Check if transactions are being consumed
docker logs graph-engine | grep "Received transaction"

# Check graph has data
curl http://localhost:8081/api/graph/statistics | jq

# Verify is_high_risk == true in your transactions
```

### Alert not sent?

```bash
# Check Person 1 is reachable
docker exec graph-engine curl http://fraudgraph-api:8080/actuator/health

# Check alert logs
docker logs graph-engine | grep "Alert"
```

### Service not starting?

```bash
# Check all services
docker-compose ps

# Restart specific service
docker-compose restart graph-engine

# View startup logs
docker logs graph-engine
```

## Next Steps

1. **Read Full Documentation**: `README.md`
2. **Integration Guide**: `INTEGRATION.md`
3. **Testing Guide**: `TESTING.md`
4. **Import Postman Collection**: `postman/Graph-Engine-API.postman_collection.json`

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/graph/rings` | GET | All fraud rings |
| `/api/graph/rings/{id}` | GET | Specific ring |
| `/api/graph/statistics` | GET | Graph metrics |
| `/api/benchmark/summary` | GET | Performance data |
| `/api/benchmark/run` | POST | Run benchmark |

## Ports

- **8081**: Graph Engine API
- **8080**: Person 1 API (fraudgraph-api)
- **29092**: Kafka (from host)
- **9092**: Kafka (from Docker network)

## Environment Variables

```bash
# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
KAFKA_TOPIC_SCORED=transactions.scored

# Person 1 Integration
SPRING_API_BASE_URL=http://fraudgraph-api:8080

# Algorithm Tuning
PAGERANK_ITERATIONS=15
PAGERANK_DAMPING=0.85
ALERT_THROTTLE_SECONDS=30
```

## Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

---

**That's it!** You now have a working fraud ring detection system.

For detailed information, see:
- `README.md` - Complete documentation
- `INTEGRATION.md` - Team integration
- `TESTING.md` - Testing procedures
- `DELIVERABLES.md` - What was delivered
