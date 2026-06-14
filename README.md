# FraudGraph — Real-Time Financial Fraud Detection System

> **Privacy-Preserving Cross-Bank Fraud Ring Detection — Real-Time.**
> Graph-based financial surveillance using Tarjan's SCC and PageRank to identify complex money-laundering cycles across pseudonymized accounts.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Key Features In Depth](#key-features-in-depth)
  - [Upload & Analyze Bank Statements (Highlight)](#upload--analyze-bank-statements-highlight)
  - [Live Surveillance & Real-Time Ingestion](#live-surveillance--real-time-ingestion)
  - [ML Scoring & XAI Forensics](#ml-scoring--xai-forensics)
  - [Graph Engine & Ring Detection](#graph-engine--ring-detection)
  - [Security & Privacy](#security--privacy)
  - [Analytics & Dashboarding](#analytics--dashboarding)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Detection Pipeline](#detection-pipeline)
- [Services & Ports](#services--ports)
- [Screenshots](#screenshots)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Running Services Manually](#running-services-manually)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [ML Model](#ml-model)
- [Troubleshooting](#troubleshooting)

---

## What It Does

FraudGraph is a real-time, distributed financial fraud detection system. It ingests bank transactions via a REST API, streams them through Apache Kafka, scores each one with a **differentially-private Random Forest** ML model, and then runs **Tarjan's Strongly Connected Components** algorithm on a live in-memory graph to detect circular money-laundering rings.

---

## Key Features In Depth

### 📂 Upload & Analyze Bank Statements (Highlight)
One of the most powerful and practical features of FraudGraph is its **Batch Analysis Engine**. Financial investigators often receive transaction histories in the form of raw bank statements rather than live streams. FraudGraph bridges this gap seamlessly.

- **Multi-Format Parsing:** Drag and drop **PDF**, **Excel (.xlsx, .xls)**, or **CSV** bank statements directly into the dashboard.
- **Intelligent Auto-Mapping:** The system automatically scans the uploaded document to identify key columns (`sender`, `receiver`, `amount`, `timestamp`, `txn_id`). If it can't figure it out, it prompts the user for manual column mapping.
- **End-to-End Pipeline on Static Data:** The moment a file is uploaded, the system:
  1. Parses the entire dataset.
  2. Engineers feature sets (velocity, time deltas, frequency ratios) for every single row.
  3. Runs the **Differentially-Private Random Forest** model to score every transaction.
  4. Constructs a static, in-memory graph of all accounts and transactions in the document.
  5. Executes **Tarjan's SCC** to immediately unearth any circular money laundering rings buried in the statement.
- **Comprehensive Fraud Report:** Returns an instant, detailed forensic report highlighting flagged transactions, detected rings, average risk scores, and full SHAP feature attribution for every row in the file. 

This turns a manual, days-long forensic auditing task into a process that takes mere seconds.

### 🔴 Live Surveillance & Real-Time Ingestion
FraudGraph isn't just for static data; it thrives on live streams. 
- **Force-Directed Graphing:** As transactions hit the Spring Boot REST API, they are immediately broadcasted to the frontend via WebSockets (STOMP) and rendered as a beautiful, physics-based, force-directed graph. 
- **Visual Risk Coding:** Nodes (accounts) and edges (transactions) are color-coded in real-time. High-risk transactions glow red, and when a money-laundering ring is formed, the entire cycle pulses to immediately draw the investigator's attention.
- **High-Throughput Streaming:** Backed by Apache Kafka, the ingestion pipeline can handle massive parallel streams of cross-bank transactions without dropping data.

### 🧠 ML Scoring & XAI Forensics
Black-box AI is not acceptable in financial compliance. FraudGraph uses **eXplainable AI (XAI)** to justify every decision.
- **Differential Privacy:** The core scoring model is a Random Forest trained using `diffprivlib`. It adds calibrated Gaussian noise during training to ensure that the model cannot memorize or leak sensitive training data (protecting against membership inference attacks).
- **SHAP Explainability:** Every transaction is evaluated using SHapley Additive exPlanations (SHAP). The dashboard shows exactly *why* a transaction was flagged by breaking down the risk score into feature contributions (e.g., "+30% due to High Transaction Velocity", "+20% due to Abnormal Amount").
- **Forensic Drill-Down:** Clicking on any transaction or ring brings up a dedicated forensic panel to review these SHAP values alongside raw transaction metadata.

### 🔗 Graph Engine & Ring Detection
Money laundering often involves "smurfing" or circular flows where money moves through multiple accounts to obscure its origin before returning to the source. FraudGraph's Java-based graph engine is purpose-built to catch this.
- **In-Memory Adjacency List:** An ultra-fast, concurrent graph data structure maintained in memory.
- **Tarjan's SCC Algorithm:** Detects Strongly Connected Components (cycles) in **O(V + E)** time. Any SCC with a size ≥ 2 is flagged as a circular flow/fraud ring.
- **PageRank Centrality:** The engine continuously calculates the PageRank of every account in the network. Accounts that act as central hubs for money movement grow physically larger on the dashboard's visualizer.

### 🔒 Security & Privacy
Privacy is baked into the architecture from day one.
- **Zero PII:** No personally identifiable information (Names, SSNs, exact Account Numbers) ever reaches the UI or the ML model.
- **SHA-256 Pseudonymization:** All account identifiers are irreversibly hashed at the ingestion layer. The system tracks the *behavior* of the pseudonym (c479b965...), not the individual.
- **Session-Scoped Audit Logs:** The Security & Privacy dashboard tracks all pseudonym activity, but this data is strictly session-scoped and never persisted to long-term storage in the UI layer.

### 📊 Analytics & Dashboarding
A dedicated analytics view provides a macro-level understanding of the transaction stream.
- **Volume & Fraud Ratios:** Live updating line charts tracking Transactions Per Second (TPS) and a donut chart showing the real-time ratio of clean vs. flagged transactions.
- **Distribution Histograms:** Visual breakdowns of transaction amounts to spot micro-structuring (smurfing) trends.
- **Top Accounts:** Live leaderboards of the most active account pseudonyms.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard  (React + Vite)                     │
│                         127.0.0.1:5174                          │
└────────────────┬─────────────────────────────────────────────────┘
                 │  WebSocket STOMP  +  REST (Vite proxy)
                 ▼
┌──────────────────────────────────┐
│   Spring Boot Ingestion API      │  :8080
│   POST /transaction              │
│   POST /alerts/fraud-ring        │
│   WS  /topic/fraud-alerts        │
└──────┬───────────────────────────┘
       │  Kafka  →  transactions.raw
       ▼
┌──────────────────────────────────┐
│   ML Engine  (Python / FastAPI)  │  :8083 Docker / :8081 local
│   kafka_scorer.py                │
│   · Differential-Privacy RF      │
│   · SHAP + LIME explainability   │
│   · SQLite  scored_txns.db       │
│   xai_api.py  /explain /rescore  │
└──────┬───────────────────────────┘
       │  Kafka  →  transactions.scored
       ▼
┌──────────────────────────────────┐
│   Graph Engine  (Java 17)        │  :8082
│   · In-Memory Adjacency List     │
│   · Tarjan SCC  — O(V+E)         │
│   · PageRank centrality          │
│   · Alerts → Spring :8080        │
└──────────────────────────────────┘
       ▲
┌──────────────────────────────────┐
│   Kafka + Zookeeper (Docker)     │  :29092 / :22181
└──────────────────────────────────┘
       ▲
┌──────────────────────────────────┐
│   Simulator  (Python)            │  :8095
│   src/simulator.py               │
│   Synthetic txns + fraud rings   │
└──────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Ingestion API** | Java 8, Spring Boot 2.7, Spring Kafka, WebSocket (STOMP) |
| **Message Bus** | Apache Kafka 7.5 + Zookeeper |
| **ML Engine** | Python 3.10, scikit-learn, diffprivlib, SHAP, LIME, FastAPI, SQLite |
| **Graph Engine** | Java 17, Spring Boot 2.7, ConcurrentHashMap, Tarjan SCC |
| **Dashboard** | React 18, TypeScript, Vite 8, Tailwind CSS, react-force-graph-2d |
| **Containerisation** | Docker, Docker Compose |

---

## Project Structure

```
Fraud-Graph-Detection/
│
├── README.md                   ← This file
├── LICENSE
├── docker-compose.yml          ← Orchestrates all backend services
├── Dockerfile                  ← Spring Ingestion API image
├── pom.xml                     ← Maven build (Spring Ingestion API)
├── requirements.txt            ← Python deps for simulator
├── .gitignore / .dockerignore
│
├── assets/                     ← Screenshots used in this README
│
├── src/                        ← Spring Ingestion API source + simulator
│   ├── main/                   ← Java: controllers, Kafka producer, WebSocket
│   ├── simulator.py            ← Synthetic transaction generator (:8095)
│   └── load_test.py            ← Load testing script
│
├── ml_engine/                  ← Python ML + XAI service
│   ├── kafka_scorer.py         ← Kafka consumer → DP-RF scoring → SQLite
│   ├── xai_api.py              ← FastAPI: /explain, /rescore, /upload/analyze
│   ├── features.py             ← Feature engineering
│   ├── train_model.py          ← Train + save the DP-RF model
│   ├── upload_analyzer.py      ← CSV/Excel/PDF batch analysis
│   ├── dp_rf_model.joblib      ← Trained model binary
│   ├── scored_txns.db          ← SQLite: scored + explained transactions
│   ├── requirements.txt
│   ├── Dockerfile
│   └── start.sh                ← Starts kafka_scorer + xai_api concurrently
│
├── graph-engine/               ← Java graph processing service
│   ├── src/main/java/com/fraudgraph/graphengine/
│   │   ├── algorithm/          ← TarjanSCC, DFSCycleDetector, PageRankCalculator
│   │   ├── graph/              ← FraudGraph, GraphNode, GraphEdge
│   │   ├── service/            ← FraudRingDetectionService, AlertService
│   │   ├── kafka/              ← TransactionConsumer
│   │   └── controller/         ← GraphController, BenchmarkController, HealthController
│   ├── pom.xml
│   └── Dockerfile
│
└── Dashboard/                  ← React + TypeScript frontend
    ├── src/
    │   ├── pages/              ← HomePage, LiveSurveillancePage, InvestigatePage,
    │   │                          AnalyticsPage, UploadPage, PrivacyPage
    │   ├── components/         ← ConnectionPill, GlobalMetricsDock, etc.
    │   ├── hooks/              ← useFraudStream, useGraphRingsPoll, etc.
    │   ├── store/              ← Zustand: streamStore, dashboardUiStore
    │   ├── api/                ← fetchExplain, ingestionApi, graphApi
    │   ├── lib/                ← Graph utilities, risk-level helpers
    │   └── types/              ← TypeScript types
    ├── vite.config.ts
    └── package.json
```

---

## Detection Pipeline

```
1.  POST /transaction  →  Spring API :8080
2.  Spring publishes   →  Kafka: transactions.raw
3.  kafka_scorer.py consumes, engineers 4 features:
      · amount
      · velocity   (txns from this sender in last 60s)
      · time_delta (hours since sender's previous txn)
      · freq_ratio (sender freq / receiver freq)
4.  DP-RF model predicts risk_score ∈ [0,1]
      is_high_risk = (risk_score ≥ 0.30)
5.  Publishes scored message  →  Kafka: transactions.scored
6.  Graph Engine consumes — only is_high_risk == true
      Adds directed edge: sender → receiver (weight = risk_score)
7.  Tarjan SCC runs on in-memory graph
      SCC size ≥ 2  →  fraud ring detected
8.  Graph Engine POSTs alert  →  Spring :8080/alerts/fraud-ring
9.  Spring broadcasts via STOMP  →  Dashboard WebSocket
      · Live ticker updates
      · Force-directed ring graph updates
      · Analytics counters update
```

---

## Services & Ports

| Service | Port | Description |
|---|---|---|
| **Dashboard** | **5174** | Vite React UI |
| **Spring Ingestion API** | **8080** | Transaction ingest, STOMP alerts |
| **Graph Engine** | **8082** | Tarjan SCC, ring REST API |
| **ML XAI API** | **8081** (local) / **8083** (Docker) | SHAP explain, rescore, batch upload |
| **Kafka** | **29092** (host-mapped) | Message bus |
| **Zookeeper** | **22181** (host-mapped) | Kafka coordination |
| **Simulator Control** | **8095** | `POST /start`, `POST /stop` |

---

## Screenshots

### Home — Project Overview & Detection Pipeline
The home page shows the four-stage detection pipeline and live STOMP connection status.

![Home — LIVE with 37 txns and 2 fraud alerts](assets/Screenshot%202026-06-14%20102625.png)

---

### Upload & Analyze — Batch Dataset Analysis
Drop a CSV, Excel, or PDF bank statement. The system parses it, engineers features, runs the DP-RF model on every row, builds a static graph, runs Tarjan SCC, and returns a full fraud report instantly.

![Upload & Analyze — PDF statement: 72 txns, 4 flagged, 3% avg risk](assets/Screenshot%202026-06-14%20003731.png)

---

### Live Surveillance — Force-Directed Transaction Graph
Real-time force graph where nodes are accounts, edges are transactions. Ring members pulse red. The live ticker on the right shows each transaction with its risk label.

![Live Surveillance — 80 txns, 9-node ring visible](assets/Screenshot%202026-06-14%20102707.png)

---

### XAI & Forensics — Fraud Ring Subgraphs + Transaction Lookup
Left panel shows each detected ring as a force-directed subgraph. Right panel shows ML risk score, SHAP feature importance bars, ring membership, and transaction metadata for any looked-up transaction.

![XAI Forensics — RING_002 with transaction detail and SHAP score](assets/Screenshot%202026-06-14%20102734.png)

---

### XAI & Forensics — Ring Transaction List
Clicking a ring card on the left switches the right panel to a scrollable list of all fraudulent transactions in that ring, each showing amount, accounts, risk score, and an **Inspect →** button.

![XAI Forensics — Ring Transactions panel showing 80 transactions in RING_002](assets/Screenshot%202026-06-14%20103040.png)

---

### Analytics — Stream Stats, Fraud Ratio & Top Accounts
Four panels: volume/10s line chart, fraud ratio donut (6.3%), amount distribution histogram, and top accounts by appearance count.

![Analytics — 80 txns, 6.3% fraud ratio, top accounts bar chart](assets/Screenshot%202026-06-14%20103127.png)

---

### Analytics — Fraud Ring Alerts Table
Live session table of all detected rings with their cycle length, detection method (Tarjan's SCC), source service, and timestamp.

![Analytics — 3 rings detected: RING_001 (4 nodes), RING_002 (6), RING_003 (3)](assets/Screenshot%202026-06-14%20102811.png)

---

### Security & Privacy — Pseudonym Activity Audit Log
All account identifiers are SHA-256 pseudonyms. This page shows every account seen this session with direction, tx count, last seen, and fraud-linked flag. No PII is ever stored.

![Security & Privacy — 20 accounts, session-only data](assets/Screenshot%202026-06-14%20102759.png)

---

### Backend Status Indicator
Bottom-right bar shows health of all backends (WebSocket, Spring API, Graph Engine, ML scorer, Simulator). Green = healthy, red = unreachable.

![Backend status bar — all green](assets/Screenshot%202026-06-14%20102249.png)

---

## Prerequisites

| Tool | Version | Required For |
|---|---|---|
| **Docker Desktop** | Latest | All backend services (Kafka, Spring, Graph Engine, ML Engine) |
| **Node.js** | LTS 18+ | Dashboard |
| **Python** | 3.10+ | Simulator (+ ML engine if running outside Docker) |
| **Java + Maven** | 17+ / 3.6+ | Only if building Spring or Graph Engine locally without Docker |

---

## Quick Start

> This runs everything. Backends in Docker, Dashboard and Simulator natively.

### Step 1 — Start all backends

```powershell
cd Fraud-Graph-Detection
docker compose up -d --build
```

First build takes ~2 minutes (downloading ML Python packages). Monitor progress:

```powershell
docker ps --filter name=fraud-graph-detection --format "table {{.Names}}\t{{.Status}}"
```

All 5 containers should show `Up` or `(healthy)`:

```
fraud-graph-detection-graph-engine-1     Up X seconds (healthy)
fraud-graph-detection-ml-engine-1        Up X seconds
fraud-graph-detection-fraudgraph-api-1   Up X seconds
fraud-graph-detection-kafka-1            Up X seconds (healthy)
fraud-graph-detection-zookeeper-1        Up X seconds (healthy)
```

Sanity check:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health   # → status: running
Invoke-RestMethod http://127.0.0.1:8082/api/health  # → service: graph-engine UP
Invoke-RestMethod http://127.0.0.1:8083/health   # → status: ok
```

### Step 2 — Start the Dashboard

```powershell
cd Dashboard
npm install
npm run dev
```

Open **http://127.0.0.1:5174** — the bottom status bar should show STOMP green (LIVE).

### Step 3 — Start the Simulator

```powershell
cd ..
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:FRAUDGRAPH_API_URL = "http://127.0.0.1:8080/transaction"
python src/simulator.py
```

### Step 4 — Inject live transactions

- Click **"Start live injection"** on the **Live Surveillance** page, or
- Run: `curl -s -X POST http://127.0.0.1:8095/start`

Transactions will start appearing on the graph. After ~30 seconds the simulator generates a synthetic fraud ring, which Tarjan SCC will detect and broadcast to the dashboard.

---

## Running Services Manually

### Kafka Only (Docker, rest local)

```powershell
docker compose up -d zookeeper kafka
```

### Spring Ingestion API

```powershell
mvn clean package -DskipTests
java -jar target/fraudgraph-ingestion-0.1.0.jar
```

### ML Kafka Scorer

```powershell
cd ml_engine
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:KAFKA_BOOTSTRAP_SERVERS = "localhost:29092"
python kafka_scorer.py
```

### XAI API (Forensics page)

```powershell
cd ml_engine
.\.venv\Scripts\Activate.ps1
python xai_api.py    # listens on :8081 by default
```

### Graph Engine

```powershell
cd graph-engine
mvn clean package -DskipTests
java -jar target/fraudgraph-graph-engine-0.1.0.jar
```

---

## Environment Variables

### Simulator (`src/simulator.py`)

| Variable | Default | Description |
|---|---|---|
| `FRAUDGRAPH_API_URL` | `http://localhost:8080/transaction` | Spring ingest endpoint |
| `TX_PER_SECOND` | `5` | Random transaction rate |
| `FRAUD_INTERVAL_SECONDS` | `30` | Interval between synthetic fraud rings |
| `SIMULATOR_AUTO_START` | `0` | `1` = start immediately, skip idle mode |
| `SIMULATOR_CONTROL_PORT` | `8095` | Control server port |

### ML Kafka Scorer (`ml_engine/kafka_scorer.py`)

| Variable | Default | Description |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` | Kafka broker |
| `SCORER_THRESHOLD` | `0.3` | Risk threshold for `is_high_risk`. Lower = more detections |
| `KAFKA_AUTO_OFFSET_RESET` | `earliest` | Offset reset strategy |
| `KAFKA_CONSUMER_GROUP_ID` | `fraudgraph-ml-scorer` | Consumer group ID |

### Graph Engine (Docker env / JVM args)

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | `8082` | HTTP port |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:9092` | Kafka broker (internal Docker) |
| `KAFKA_TOPIC_SCORED` | `transactions.scored` | Scored transactions topic |
| `SPRING_API_BASE_URL` | `http://fraudgraph-api:8080` | Where ring alerts are sent |
| `PAGERANK_ITERATIONS` | `15` | PageRank convergence |
| `ALERT_THROTTLE_SECONDS` | `30` | Min interval between alerts per ring |

### Dashboard (`.env.local` in `Dashboard/`)

| Variable | Default | Description |
|---|---|---|
| `VITE_STOMP_URL` | `http://127.0.0.1:8080/ws` | WebSocket URL |
| `VITE_INGESTION_BASE_URL` | `/person1-api` | Spring API proxy |
| `VITE_GRAPH_ENGINE_BASE_URL` | `/person3-api` | Graph Engine proxy |
| `VITE_ML_BASE_URL` | `/person2-ml` | XAI API proxy |
| `VITE_SIMULATOR_CONTROL_URL` | `/simulator-control` | Simulator control proxy |

---

## API Reference

### Spring Ingestion API — `:8080`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check → `{status: "running"}` |
| `POST` | `/transaction` | Ingest a transaction |
| `GET` | `/transaction/{id}` | Fetch transaction by ID |
| `POST` | `/alerts/fraud-ring` | Receive ring alert from Graph Engine |
| `WS` | `/ws` → `/topic/fraud-alerts` | STOMP stream of ring alerts |

### Graph Engine — `:8082`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/graph/rings` | All detected fraud rings (nodes, edges, volumes) |
| `GET` | `/api/graph/rings/{id}` | Single ring by ID |
| `GET` | `/api/graph/statistics` | Node count, edge count, avg degree |
| `GET` | `/api/benchmark/summary` | Tarjan vs SQL benchmark timings |

### ML XAI API — `:8081` (local) / `:8083` (Docker)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health + DB row count |
| `GET` | `/explain/recent` | Last N scored transactions |
| `POST` | `/explain` | Fetch stored SHAP result by `txn_id` |
| `POST` | `/rescore` | Re-run model + SHAP inline for any payload |
| `POST` | `/upload/analyze` | Batch analyze CSV/Excel/PDF |
| `GET` | `/upload/results` | List past upload analyses |
| `GET` | `/upload/results/{id}` | Single upload result |

---

## Algorithms

### Tarjan's SCC (Graph Engine)

- **Complexity**: O(V + E)
- Each SCC with ≥ 2 nodes = circular money flow = fraud ring
- DFS with low-link values and explicit stack
- Back-edges identify the closing arc of each cycle

### PageRank Centrality

- `PR(v) = (1−d)/N + d × Σ(PR(u) / outdegree(u))`
- Damping `d = 0.85`, 15 iterations by default
- Node size in the force-graph visualization is proportional to PageRank score

### DFS Cycle Detection

- Iterative DFS (no recursion) to avoid stack overflow on large graphs
- Detects back-edges directly — back-edge mathematically proves cycle existence

---

## ML Model

Model file: `ml_engine/dp_rf_model.joblib`

### Features Engineered Per Transaction

| Feature | Description |
|---|---|
| `amount` | Raw transaction amount |
| `velocity` | Sender's transaction count in the last 60 seconds |
| `time_delta` | Hours since sender's previous transaction |
| `freq_ratio` | Sender's all-time tx count ÷ Receiver's tx count |

### Retrain the Model

```powershell
cd ml_engine
.\.venv\Scripts\Activate.ps1
python train_model.py       # trains and saves dp_rf_model.joblib
python rebuild_model.py     # rebuild with fresh random seed
```

### Differential Privacy

The model uses **diffprivlib**'s `RandomForestClassifier` which adds calibrated Gaussian noise during training (Gaussian mechanism). The privacy budget ε is logged during training.

### Adjust Risk Sensitivity

Lower the threshold to flag more transactions (useful for demos):

```powershell
$env:SCORER_THRESHOLD = "0.02"   # flag almost everything
python kafka_scorer.py
```

---

## Troubleshooting

### Dashboard shows "RECONNECTING"
Spring API on `:8080` is not reachable. Check:
```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
docker logs fraud-graph-detection-fraudgraph-api-1
```

### No transactions appear in Live Surveillance
Simulator is IDLE by default. Start it:
```powershell
curl -s -X POST http://127.0.0.1:8095/start
```
Or click **"Start live injection"** on the dashboard.

### Rings are never detected
- Confirm the ML scorer is running and writing to `transactions.scored`
- Lower `SCORER_THRESHOLD` to `0.02` so more transactions become `is_high_risk`
- Check graph-engine logs: `docker logs fraud-graph-detection-graph-engine-1`

### Forensics page shows "Transaction not found"
- The XAI API must be running on `:8081` (local) or `:8083` (Docker)
- The `txn_id` must exist in `ml_engine/scored_txns.db` — use a UUID from the **Live Surveillance** ticker

### Kafka connection refused (Python scripts)
- Use `localhost:29092` when Python runs on the host and Kafka is in Docker
- Use `kafka:9092` only inside Docker containers

### Full reset
```powershell
docker compose down -v
docker compose up -d --build
```

---

## License

MIT — see [LICENSE](LICENSE).
