# Graph Engine Integration Guide

## Person 3 → Person 1 Integration

### Alert Flow

1. **Graph Engine detects fraud ring** (Tarjan SCC)
2. **AlertService sends HTTP POST** to Person 1's API
3. **Person 1 broadcasts via STOMP** to `/topic/fraud-alerts`
4. **Person 4's React dashboard** receives real-time update

### Person 1 API Contract

**Endpoint**: `POST http://localhost:8080/alerts/fraud-ring`

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "alert_id": "RING_001",
  "cycle_accounts": ["ACC1", "ACC2", "ACC3"],
  "back_edge_source": "ACC3",
  "back_edge_target": "ACC1",
  "edge_ids": ["TXN1001", "TXN1002", "TXN1003"],
  "total_amount": 25000.00,
  "severity": "high",
  "reason": "Tarjan SCC size>=2; ranked #1 by volume",
  "source": "graph-engine"
}
```

**Response**: `202 Accepted`
```json
{
  "alert_id": "RING_001",
  "cycle_accounts": ["ACC1", "ACC2", "ACC3"],
  "detected_at": "2026-04-20T10:15:30Z",
  ...
}
```

### Testing Integration

```bash
# 1. Start all services
docker-compose up -d

# 2. Check Person 1 API is ready
curl http://localhost:8080/actuator/health

# 3. Check Graph Engine is ready
curl http://localhost:8081/api/health

# 4. Send test transactions to create fraud ring
# (See test-data/fraud-ring-cycle.json)

# 5. Verify alert was sent
docker logs graph-engine | grep "Alert sent successfully"

# 6. Check Person 1 received alert
docker logs fraudgraph-api | grep "fraud-ring"
```

## Person 3 → Person 4 Integration

### REST API Contract

**Base URL**: `http://localhost:8081`

### Endpoint 1: GET /api/graph/rings

**Purpose**: Fetch all detected fraud rings with full details

**Response Schema**:
```json
{
  "rings": [
    {
      "ring_id": "RING_001",
      "nodes": [
        {
          "id": "ACC1",
          "centrality_score": 0.412,
          "scc_cluster_id": "RING_001"
        }
      ],
      "edges": [
        {
          "txn_id": "TXN1001",
          "from": "ACC1",
          "to": "ACC2",
          "amount": 5000.0,
          "timestamp": "2026-04-20T10:15:30Z",
          "risk_score": 0.94
        }
      ],
      "total_volume": 25000.0,
      "priority_rank": 1,
      "detection_method": "Tarjan_SCC",
      "dfs_back_edge": {
        "from": "ACC3",
        "to": "ACC1"
      }
    }
  ],
  "generated_at": "2026-04-20T10:16:00Z"
}
```

**Field Descriptions**:

- `ring_id`: Unique identifier (RING_001, RING_002, ...)
- `nodes[].id`: Pseudonymised account ID
- `nodes[].centrality_score`: PageRank score [0, 1] for node sizing
- `nodes[].scc_cluster_id`: Same as ring_id
- `edges[].txn_id`: Transaction ID
- `edges[].from/to`: Source and target account IDs
- `edges[].amount`: Transaction amount
- `edges[].timestamp`: ISO-8601 UTC timestamp
- `edges[].risk_score`: ML risk score [0, 1]
- `total_volume`: Sum of all edge amounts in ring
- `priority_rank`: 1 = highest priority (sorted by total_volume desc)
- `detection_method`: "Tarjan_SCC"
- `dfs_back_edge`: Optional back edge from DFS (if detected)

### Endpoint 2: GET /api/graph/rings/{ringId}

**Purpose**: Fetch specific fraud ring

**Example**: `GET /api/graph/rings/RING_001`

**Response**: Single ring object (same schema as rings[] element)

### Endpoint 3: GET /api/benchmark/summary

**Purpose**: Performance metrics for dashboard

**Response**:
```json
{
  "graph_tarjan_ms": 12.4,
  "sql_naive_join_ms": 840.1,
  "node_count": 1000,
  "edge_count": 5000,
  "speedup": 67.75,
  "dataset_note": "In-memory graph: N=1000 nodes, E=5000 edges",
  "captured_at": "2026-04-20T10:00:00Z"
}
```

### Frontend Integration Example (React)

```javascript
// Fetch fraud rings
const response = await fetch('http://localhost:8081/api/graph/rings');
const data = await response.json();

// Render force graph
data.rings.forEach(ring => {
  ring.nodes.forEach(node => {
    // Use centrality_score for node size
    const nodeSize = 5 + (node.centrality_score * 20);
    
    forceGraph.addNode({
      id: node.id,
      size: nodeSize,
      color: '#ff4444', // Red for fraud ring
      cluster: node.scc_cluster_id
    });
  });
  
  ring.edges.forEach(edge => {
    forceGraph.addEdge({
      source: edge.from,
      target: edge.to,
      label: `$${edge.amount}`,
      timestamp: edge.timestamp,
      riskScore: edge.risk_score
    });
  });
});

// Highlight back edge if present
if (ring.dfs_back_edge) {
  forceGraph.highlightEdge(
    ring.dfs_back_edge.from,
    ring.dfs_back_edge.to,
    { color: '#ff0000', width: 3 }
  );
}
```

### STOMP Integration Flow

1. **Person 4 subscribes** to STOMP topic via Person 1:
   ```javascript
   stompClient.subscribe('/topic/fraud-alerts', (message) => {
     const alert = JSON.parse(message.body);
     // alert contains: alert_id, cycle_accounts, total_amount, etc.
     
     // Fetch full ring details from Graph Engine
     fetch(`http://localhost:8081/api/graph/rings/${alert.alert_id}`)
       .then(res => res.json())
       .then(ring => {
         // Animate ring in force graph
         animateFraudRing(ring);
       });
   });
   ```

2. **Graph Engine detects ring** → sends alert to Person 1
3. **Person 1 broadcasts** via STOMP
4. **Person 4 receives alert** → fetches full details from Graph Engine API
5. **Person 4 animates** ring in force graph

### CORS Configuration

Graph Engine has CORS enabled for all origins:
```java
@CrossOrigin(origins = "*")
```

For production, Person 4 should configure specific origin:
```java
@CrossOrigin(origins = "http://localhost:3000")
```

## Person 2 → Person 3 Integration

### Kafka Topic Contract

**Topic**: `transactions.scored`

**Message Schema**:
```json
{
  "txn_id": "TXN123",
  "sender_id": "ACC001",
  "receiver_id": "ACC002",
  "amount": 5400.50,
  "timestamp": "2026-04-20T10:15:30Z",
  "risk_score": 0.94,
  "is_high_risk": true
}
```

**Field Requirements**:
- `txn_id`: Required, unique transaction ID
- `sender_id`: Required, pseudonymised account ID (from Person 1)
- `receiver_id`: Required, pseudonymised account ID
- `amount`: Required, transaction amount (BigDecimal)
- `timestamp`: Required, ISO-8601 UTC format
- `risk_score`: Required, ML score [0, 1]
- `is_high_risk`: Required, boolean flag

**Processing Rules**:
- Graph Engine **only processes** messages where `is_high_risk == true`
- Low-risk transactions are ignored to conserve memory
- Node IDs must match Person 1's pseudonymisation output

### Testing Kafka Integration

```bash
# Produce test message
docker exec -it fraudgraph-kafka-1 kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic transactions.scored

# Paste JSON (high-risk):
{"txn_id":"TXN001","sender_id":"ACC1","receiver_id":"ACC2","amount":5000,"timestamp":"2026-04-20T10:00:00Z","risk_score":0.95,"is_high_risk":true}

# Check Graph Engine logs
docker logs graph-engine | grep "Added transaction to graph"
```

## Complete Integration Test

### Scenario: Detect 3-Node Fraud Ring

**Step 1**: Start all services
```bash
docker-compose up -d
```

**Step 2**: Send 3 transactions forming a cycle
```bash
# Transaction 1: ACC1 → ACC2
kafka-console-producer --bootstrap-server localhost:29092 --topic transactions.scored
{"txn_id":"TXN001","sender_id":"ACC1","receiver_id":"ACC2","amount":5000,"timestamp":"2026-04-20T10:00:00Z","risk_score":0.95,"is_high_risk":true}

# Transaction 2: ACC2 → ACC3
{"txn_id":"TXN002","sender_id":"ACC2","receiver_id":"ACC3","amount":3000,"timestamp":"2026-04-20T10:01:00Z","risk_score":0.92,"is_high_risk":true}

# Transaction 3: ACC3 → ACC1 (completes cycle)
{"txn_id":"TXN003","sender_id":"ACC3","receiver_id":"ACC1","amount":2000,"timestamp":"2026-04-20T10:02:00Z","risk_score":0.88,"is_high_risk":true}
```

**Step 3**: Verify fraud ring detected
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
        {"id": "ACC1", "centrality_score": 0.33, "scc_cluster_id": "RING_001"},
        {"id": "ACC2", "centrality_score": 0.33, "scc_cluster_id": "RING_001"},
        {"id": "ACC3", "centrality_score": 0.33, "scc_cluster_id": "RING_001"}
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
  ],
  "generated_at": "2026-04-20T10:02:05Z"
}
```

**Step 4**: Verify alert sent to Person 1
```bash
docker logs graph-engine | grep "Alert sent successfully"
# Output: Alert sent successfully for ring: RING_001
```

**Step 5**: Check Person 1 received alert
```bash
docker logs fraudgraph-api | grep "fraud-ring"
# Output: POST /alerts/fraud-ring - 202 Accepted
```

## Troubleshooting

### Issue: No fraud rings detected

**Diagnosis**:
```bash
# Check Kafka consumer is running
docker logs graph-engine | grep "TransactionConsumer"

# Check transactions are being consumed
docker logs graph-engine | grep "Received transaction"

# Check graph statistics
curl http://localhost:8081/api/graph/statistics
```

**Common Causes**:
1. `is_high_risk == false` → Graph Engine filters out low-risk
2. No cycle exists → Need at least 2 nodes with circular edges
3. Kafka topic mismatch → Check `KAFKA_TOPIC_SCORED` env var

### Issue: Alert not sent to Person 1

**Diagnosis**:
```bash
# Check Person 1 API is reachable
curl http://localhost:8080/actuator/health

# Check Graph Engine can reach Person 1
docker exec graph-engine curl http://fraudgraph-api:8080/actuator/health

# Check alert service logs
docker logs graph-engine | grep "AlertService"
```

**Common Causes**:
1. Wrong `SPRING_API_BASE_URL` → Should be `http://fraudgraph-api:8080`
2. Person 1 API not running
3. Alert throttled → Wait 30 seconds between alerts for same ring

### Issue: Frontend not receiving data

**Diagnosis**:
```bash
# Check CORS
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:8081/api/graph/rings

# Check API response
curl http://localhost:8081/api/graph/rings | jq
```

**Common Causes**:
1. CORS blocked → Check browser console
2. Wrong API URL → Should be `http://localhost:8081`
3. No data yet → Send test transactions first

## Performance Tuning

### PageRank Iterations

Default: 15 iterations

Increase for more accurate centrality scores:
```yaml
PAGERANK_ITERATIONS: 20
```

Decrease for faster computation:
```yaml
PAGERANK_ITERATIONS: 10
```

### Alert Throttle

Default: 30 seconds

Increase to reduce alert spam:
```yaml
ALERT_THROTTLE_SECONDS: 60
```

Decrease for more frequent alerts (testing):
```yaml
ALERT_THROTTLE_SECONDS: 5
```

### Kafka Consumer Threads

Default: 3 threads

Increase for higher throughput:
```java
factory.setConcurrency(5);
```

## API Examples for Person 4

### Fetch and Render Rings

```javascript
async function fetchAndRenderRings() {
  const response = await fetch('http://localhost:8081/api/graph/rings');
  const data = await response.json();
  
  data.rings.forEach(ring => {
    console.log(`Ring ${ring.ring_id}:`);
    console.log(`  Nodes: ${ring.nodes.length}`);
    console.log(`  Edges: ${ring.edges.length}`);
    console.log(`  Volume: $${ring.total_volume}`);
    console.log(`  Rank: #${ring.priority_rank}`);
  });
}
```

### Poll for Updates

```javascript
setInterval(async () => {
  const response = await fetch('http://localhost:8081/api/graph/rings');
  const data = await response.json();
  
  if (data.rings.length > lastRingCount) {
    console.log('New fraud ring detected!');
    updateVisualization(data.rings);
  }
  
  lastRingCount = data.rings.length;
}, 5000); // Poll every 5 seconds
```

### Fetch Benchmark Data

```javascript
async function fetchBenchmark() {
  const response = await fetch('http://localhost:8081/api/benchmark/summary');
  const data = await response.json();
  
  console.log(`Tarjan: ${data.graph_tarjan_ms}ms`);
  console.log(`SQL: ${data.sql_naive_join_ms}ms`);
  console.log(`Speedup: ${data.speedup.toFixed(2)}x`);
  
  // Render performance chart
  renderPerformanceChart(data);
}
```

---

**Integration Checklist**:

- [ ] Kafka topic `transactions.scored` created
- [ ] Person 1 API running on port 8080
- [ ] Graph Engine running on port 8081
- [ ] Person 4 can fetch from `http://localhost:8081/api/graph/rings`
- [ ] Alerts flow: Graph Engine → Person 1 → STOMP → Person 4
- [ ] Test fraud ring detected and displayed
- [ ] Benchmark data available for performance chart
- [ ] CORS configured for frontend origin

