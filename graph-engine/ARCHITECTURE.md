# Graph Engine Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRAUDGRAPH SYSTEM                            │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Person 1   │      │   Person 2   │      │   Person 3   │
│  Spring Boot │      │  ML Engine   │      │ Graph Engine │
│     API      │      │   (Python)   │      │    (Java)    │
└──────────────┘      └──────────────┘      └──────────────┘
       │                     │                      │
       │                     │                      │
       ▼                     ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│                    Apache Kafka                          │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │transactions.raw │  │   transactions.scored        │  │
│  └─────────────────┘  └──────────────────────────────┘  │
│                       ┌──────────────────────────────┐  │
│                       │      fraud.alerts            │  │
│                       └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
                    ┌──────────────────┐
                    │   Person 4       │
                    │ React Dashboard  │
                    │  (WebSocket)     │
                    └──────────────────┘
```

## Graph Engine Internal Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GRAPH ENGINE (Port 8081)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    Kafka Consumer Layer                     │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  TransactionConsumer.java                            │  │    │
│  │  │  - Consumes: transactions.scored                     │  │    │
│  │  │  - Filters: is_high_risk == true                     │  │    │
│  │  │  - Threads: 3 concurrent consumers                   │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    Graph Data Layer                         │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  FraudGraph.java                                     │  │    │
│  │  │  - ConcurrentHashMap<String, GraphNode>             │  │    │
│  │  │  - ReadWriteLock for algorithm execution            │  │    │
│  │  │  - O(V + E) space complexity                        │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  GraphNode.java                                      │  │    │
│  │  │  - Adjacency list: Map<String, GraphEdge>           │  │    │
│  │  │  - Centrality score (PageRank)                      │  │    │
│  │  │  - O(1) add/remove edge                             │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  GraphEdge.java                                      │  │    │
│  │  │  - Immutable transaction record                     │  │    │
│  │  │  - txnId, sourceId, targetId, amount, timestamp     │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    Algorithm Layer                          │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  TarjanSCC.java                                      │  │    │
│  │  │  - Time: O(V + E)                                    │  │    │
│  │  │  - Detects strongly connected components            │  │    │
│  │  │  - Returns SCCs with size >= 2 (fraud rings)        │  │    │
│  │  │  - Uses discovery time & low-link values            │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  DFSCycleDetector.java                               │  │    │
│  │  │  - Time: O(V + E)                                    │  │    │
│  │  │  - Iterative DFS (no recursion)                     │  │    │
│  │  │  - Detects back edges (cycle proof)                 │  │    │
│  │  │  - Returns cycle path                               │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  PageRankCalculator.java                             │  │    │
│  │  │  - Time: O(k * (V + E)) where k = iterations        │  │    │
│  │  │  - Calculates node centrality scores                │  │    │
│  │  │  - Normalized to [0, 1] for visualization           │  │    │
│  │  │  - Damping factor: 0.85                             │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    Service Layer                            │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  FraudRingDetectionService.java                      │  │    │
│  │  │  - Orchestrates Tarjan + PageRank                   │  │    │
│  │  │  - Ranks rings by total volume                      │  │    │
│  │  │  - Builds FraudRingResponse DTOs                    │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  AlertService.java                                   │  │    │
│  │  │  - HTTP POST to Person 1: /alerts/fraud-ring        │  │    │
│  │  │  - Alert throttling: 30s cooldown per ring          │  │    │
│  │  │  - Async sending (non-blocking)                     │  │    │
│  │  │  - Deduplication logic                              │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  BenchmarkService.java                               │  │    │
│  │  │  - Compares Tarjan vs SQL recursive CTE             │  │    │
│  │  │  - Measures execution time                          │  │    │
│  │  │  - Calculates speedup factor                        │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    REST API Layer                           │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  GraphController.java                                │  │    │
│  │  │  - GET /api/graph/rings                             │  │    │
│  │  │  - GET /api/graph/rings/{id}                        │  │    │
│  │  │  - GET /api/graph/statistics                        │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  BenchmarkController.java                            │  │    │
│  │  │  - GET /api/benchmark/summary                       │  │    │
│  │  │  - POST /api/benchmark/run                          │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │  HealthController.java                               │  │    │
│  │  │  - GET /api/health                                  │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Transaction Ingestion Flow

```
Person 2 (ML)
    │
    │ Kafka Publish
    ▼
transactions.scored topic
    │
    │ Kafka Consumer (3 threads)
    ▼
TransactionConsumer
    │
    │ Filter: is_high_risk == true
    ▼
FraudGraph.addEdge()
    │
    │ O(1) operation
    ▼
GraphNode.addEdge()
    │
    │ ConcurrentHashMap.put()
    ▼
Graph Updated
    │
    │ Trigger
    ▼
AlertService.checkForNewFraudRings()
```

### 2. Fraud Detection Flow

```
AlertService.checkForNewFraudRings()
    │
    ▼
FraudRingDetectionService.detectFraudRings()
    │
    ├─────────────────────────────────┐
    │                                 │
    ▼                                 ▼
TarjanSCC.findSCCs()          PageRankCalculator.calculatePageRank()
    │                                 │
    │ O(V + E)                        │ O(k * (V + E))
    │                                 │
    ▼                                 ▼
List<Set<String>> sccs          Map<String, Double> scores
    │                                 │
    └─────────────┬───────────────────┘
                  │
                  ▼
        Build FraudRingResponse
                  │
                  ├─────────────────────────┐
                  │                         │
                  ▼                         ▼
        Rank by total_volume      Assign priority_rank
                  │                         │
                  └─────────┬───────────────┘
                            │
                            ▼
                  Return List<FraudRingResponse>
```

### 3. Alert Flow

```
FraudRingDetectionService
    │
    │ New ring detected
    ▼
AlertService.sendAlert()
    │
    │ Check throttle (30s cooldown)
    ▼
Build FraudAlertRequest
    │
    │ HTTP POST (async)
    ▼
Person 1: POST /alerts/fraud-ring
    │
    │ 202 Accepted
    ▼
Person 1: Kafka Publish
    │
    │ fraud.alerts topic
    ▼
Person 1: STOMP Broadcast
    │
    │ /topic/fraud-alerts
    ▼
Person 4: React Dashboard
    │
    │ Fetch full details
    ▼
Graph Engine: GET /api/graph/rings/{id}
    │
    │ 200 OK with full ring data
    ▼
Person 4: Animate in force graph
```

### 4. API Request Flow

```
Person 4: HTTP GET /api/graph/rings
    │
    ▼
GraphController.getAllRings()
    │
    ▼
FraudRingDetectionService.detectFraudRings()
    │
    ├─────────────────────────────────┐
    │                                 │
    ▼                                 ▼
TarjanSCC                       PageRank
    │                                 │
    └─────────────┬───────────────────┘
                  │
                  ▼
        Build RingsListResponse
                  │
                  │ JSON serialization
                  ▼
        Return 200 OK
                  │
                  ▼
Person 4: Render in UI
```

## Thread Safety Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Thread Safety Layers                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Layer 1: Kafka Consumer Threads (3 concurrent)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Thread 1  │  Thread 2  │  Thread 3                   │  │
│  │     │           │            │                         │  │
│  │     └───────────┴────────────┘                         │  │
│  │              │                                          │  │
│  │              ▼                                          │  │
│  │    ConcurrentHashMap (lock-free reads)                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Layer 2: Graph Modifications                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  addNode() / addEdge()                                │  │
│  │  - ConcurrentHashMap.computeIfAbsent()               │  │
│  │  - Thread-safe by design                             │  │
│  │  - No explicit locking needed                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Layer 3: Algorithm Execution                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ReadWriteLock                                        │  │
│  │  - Multiple readers (Tarjan, PageRank, API)          │  │
│  │  - Exclusive writer (graph modifications)            │  │
│  │  - Prevents inconsistent reads during updates        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  Layer 4: Immutable Data                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  GraphEdge (immutable)                                │  │
│  │  - No setters after construction                     │  │
│  │  - Safe to share across threads                      │  │
│  │  - No race conditions possible                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Complexity Analysis

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Add Node | O(1) | ConcurrentHashMap.computeIfAbsent |
| Add Edge | O(1) | HashMap.put in adjacency list |
| Get Neighbors | O(1) | HashMap.keySet() |
| Tarjan SCC | O(V + E) | Single DFS pass |
| DFS Cycle | O(V + E) | Iterative DFS |
| PageRank | O(k * (V + E)) | k iterations, each O(V+E) |
| API Response | O(V + E) | Tarjan + PageRank + JSON |

### Space Complexity

| Structure | Complexity | Notes |
|-----------|-----------|-------|
| Graph | O(V + E) | V nodes + E edges |
| Tarjan | O(V) | Discovery time, low-link, stack |
| DFS | O(V) | Visited set, recursion stack |
| PageRank | O(V) | Score map |
| Total | O(V + E) | Dominated by graph storage |

### Memory Estimation

| Component | Per Item | 1K Nodes | 10K Nodes |
|-----------|----------|----------|-----------|
| GraphNode | ~5 KB | 5 MB | 50 MB |
| GraphEdge | ~1 KB | 5 MB | 50 MB |
| Algorithms | ~2 KB/node | 2 MB | 20 MB |
| **Total** | - | **~12 MB** | **~120 MB** |

## Scalability Considerations

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────┐
│              Kafka Consumer Scaling                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Partition 0  ──────▶  Consumer Thread 1                │
│  Partition 1  ──────▶  Consumer Thread 2                │
│  Partition 2  ──────▶  Consumer Thread 3                │
│                                                           │
│  Throughput: 3x parallel processing                      │
│  Configurable: factory.setConcurrency(N)                 │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Vertical Scaling

```
┌─────────────────────────────────────────────────────────┐
│              Algorithm Optimization                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  O(V + E) algorithms scale linearly                      │
│  - 1K nodes: 5-10ms                                      │
│  - 10K nodes: 50-100ms                                   │
│  - 100K nodes: 500-1000ms                                │
│                                                           │
│  In-memory = no disk I/O bottleneck                      │
│  ConcurrentHashMap = lock-free reads                     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Zookeeper   │  │    Kafka     │  │ fraudgraph-  │      │
│  │   :2181      │  │   :9092      │  │     api      │      │
│  │              │  │   :29092     │  │    :8080     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                   │              │
│         └─────────────────┴───────────────────┘              │
│                           │                                  │
│                           ▼                                  │
│                  ┌──────────────┐                           │
│                  │ graph-engine │                           │
│                  │    :8081     │                           │
│                  └──────────────┘                           │
│                                                               │
│  Network: fraudgraph-network                                 │
│  Volumes: kafka-data, zookeeper-data                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                    Integration Map                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Person 1 (Spring Boot API)                                  │
│  ├─ Provides: POST /alerts/fraud-ring                       │
│  ├─ Receives: FraudAlertRequest JSON                        │
│  └─ Returns: 202 Accepted + FraudAlert                      │
│                                                               │
│  Person 2 (ML Engine)                                        │
│  ├─ Provides: Kafka topic transactions.scored               │
│  ├─ Schema: ScoredTransaction JSON                          │
│  └─ Filter: is_high_risk == true                            │
│                                                               │
│  Person 4 (React Dashboard)                                  │
│  ├─ Consumes: GET /api/graph/rings                          │
│  ├─ Receives: RingsListResponse JSON                        │
│  ├─ Uses: centrality_score for node sizing                  │
│  └─ Uses: edges[] for animation                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

**Architecture Version**: 1.0  
**Last Updated**: 2026-05-10  
**Status**: Production-Ready
