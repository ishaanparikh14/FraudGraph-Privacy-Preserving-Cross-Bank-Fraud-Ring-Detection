package com.fraudgraph.graphengine.benchmark;

import com.fraudgraph.graphengine.algorithm.TarjanSCC;
import com.fraudgraph.graphengine.graph.FraudGraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/**
 * Benchmark service comparing graph-based vs SQL-based cycle detection.
 * 
 * Comparison:
 * - Graph (Tarjan SCC): O(V + E) time, in-memory
 * - SQL (Recursive CTE): O(V * E) worst case, disk I/O overhead
 */
@Service
public class BenchmarkService {
    
    private static final Logger logger = LoggerFactory.getLogger(BenchmarkService.class);
    
    private final FraudGraph graph;
    private BenchmarkResult lastResult;
    
    public BenchmarkService(FraudGraph graph) {
        this.graph = graph;
    }
    
    /**
     * Run benchmark comparing Tarjan SCC vs simulated SQL approach.
     */
    public BenchmarkResult runBenchmark() {
        logger.info("Starting benchmark...");
        
        // Benchmark 1: Tarjan SCC (graph-based)
        long tarjanStart = System.nanoTime();
        TarjanSCC tarjan = new TarjanSCC(graph);
        List<Set<String>> sccs = tarjan.findSCCs();
        long tarjanEnd = System.nanoTime();
        double tarjanMs = (tarjanEnd - tarjanStart) / 1_000_000.0;
        
        // Benchmark 2: Simulated SQL recursive CTE approach
        long sqlStart = System.nanoTime();
        int sqlCycles = simulateSQLCycleDetection();
        long sqlEnd = System.nanoTime();
        double sqlMs = (sqlEnd - sqlStart) / 1_000_000.0;
        
        BenchmarkResult result = new BenchmarkResult();
        result.setGraphTarjanMs(tarjanMs);
        result.setSqlNaiveJoinMs(sqlMs);
        result.setNodeCount(graph.getNodeCount());
        result.setEdgeCount(graph.getEdgeCount());
        result.setSpeedup(sqlMs / tarjanMs);
        result.setCapturedAt(Instant.now());
        result.setDatasetNote(String.format(
                "In-memory graph: N=%d nodes, E=%d edges", 
                graph.getNodeCount(), graph.getEdgeCount()));
        
        this.lastResult = result;
        
        logger.info("Benchmark complete: Tarjan={}ms, SQL={}ms, Speedup={}x", 
                   String.format("%.2f", tarjanMs),
                   String.format("%.2f", sqlMs),
                   String.format("%.2f", result.getSpeedup()));
        
        return result;
    }
    
    /**
     * Simulate SQL-based cycle detection using naive approach.
     * 
     * SQL Approach (Recursive CTE):
     * WITH RECURSIVE paths AS (
     *   SELECT sender_id, receiver_id, ARRAY[sender_id] as path
     *   FROM transactions
     *   UNION ALL
     *   SELECT p.sender_id, t.receiver_id, path || t.sender_id
     *   FROM paths p JOIN transactions t ON p.receiver_id = t.sender_id
     *   WHERE NOT (t.sender_id = ANY(path))
     * )
     * SELECT * FROM paths WHERE receiver_id = ANY(path);
     * 
     * Time Complexity: O(V * E) worst case
     * - Must explore all paths from each node
     * - Disk I/O overhead for each join
     * - No efficient cycle detection like Tarjan's low-link values
     */
    private int simulateSQLCycleDetection() {
        int cyclesFound = 0;
        Set<String> visited = new HashSet<>();
        
        // Simulate: for each node, do BFS to find cycles
        // This mimics the recursive CTE approach
        for (String startNode : graph.getAllNodes().keySet()) {
            if (!visited.contains(startNode)) {
                cyclesFound += bfsForCycles(startNode, visited);
            }
        }
        
        return cyclesFound;
    }
    
    /**
     * BFS-based cycle detection (simulates SQL recursive CTE).
     * Less efficient than Tarjan: O(V + E) per starting node.
     */
    private int bfsForCycles(String startNode, Set<String> globalVisited) {
        Queue<PathState> queue = new LinkedList<>();
        queue.offer(new PathState(startNode, new HashSet<>(Collections.singleton(startNode))));
        
        int cycles = 0;
        int iterations = 0;
        int maxIterations = 10000; // Prevent infinite loops
        
        while (!queue.isEmpty() && iterations < maxIterations) {
            iterations++;
            PathState state = queue.poll();
            globalVisited.add(state.currentNode);
            
            Set<String> neighbors = graph.getNeighbors(state.currentNode);
            for (String neighbor : neighbors) {
                if (state.path.contains(neighbor)) {
                    // Cycle detected
                    cycles++;
                } else {
                    // Continue path exploration
                    Set<String> newPath = new HashSet<>(state.path);
                    newPath.add(neighbor);
                    queue.offer(new PathState(neighbor, newPath));
                }
            }
        }
        
        return cycles;
    }
    
    /**
     * Get last benchmark result.
     */
    public Optional<BenchmarkResult> getLastResult() {
        return Optional.ofNullable(lastResult);
    }
    
    /**
     * Path state for BFS simulation.
     */
    private static class PathState {
        final String currentNode;
        final Set<String> path;
        
        PathState(String currentNode, Set<String> path) {
            this.currentNode = currentNode;
            this.path = path;
        }
    }
    
    /**
     * Benchmark result DTO.
     */
    public static class BenchmarkResult {
        private double graphTarjanMs;
        private double sqlNaiveJoinMs;
        private int nodeCount;
        private int edgeCount;
        private double speedup;
        private String datasetNote;
        private Instant capturedAt;
        
        public double getGraphTarjanMs() {
            return graphTarjanMs;
        }
        
        public void setGraphTarjanMs(double graphTarjanMs) {
            this.graphTarjanMs = graphTarjanMs;
        }
        
        public double getSqlNaiveJoinMs() {
            return sqlNaiveJoinMs;
        }
        
        public void setSqlNaiveJoinMs(double sqlNaiveJoinMs) {
            this.sqlNaiveJoinMs = sqlNaiveJoinMs;
        }
        
        public int getNodeCount() {
            return nodeCount;
        }
        
        public void setNodeCount(int nodeCount) {
            this.nodeCount = nodeCount;
        }
        
        public int getEdgeCount() {
            return edgeCount;
        }
        
        public void setEdgeCount(int edgeCount) {
            this.edgeCount = edgeCount;
        }
        
        public double getSpeedup() {
            return speedup;
        }
        
        public void setSpeedup(double speedup) {
            this.speedup = speedup;
        }
        
        public String getDatasetNote() {
            return datasetNote;
        }
        
        public void setDatasetNote(String datasetNote) {
            this.datasetNote = datasetNote;
        }
        
        public Instant getCapturedAt() {
            return capturedAt;
        }
        
        public void setCapturedAt(Instant capturedAt) {
            this.capturedAt = capturedAt;
        }
    }
}
