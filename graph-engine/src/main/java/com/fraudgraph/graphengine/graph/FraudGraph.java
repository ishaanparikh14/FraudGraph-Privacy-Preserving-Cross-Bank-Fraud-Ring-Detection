package com.fraudgraph.graphengine.graph;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Thread-safe in-memory directed graph for fraud detection.
 * Uses adjacency list representation with ConcurrentHashMap for node storage.
 * 
 * Space Complexity: O(V + E) where V = nodes, E = edges
 * 
 * Thread Safety:
 * - ConcurrentHashMap for node storage allows concurrent reads
 * - ReadWriteLock for structural modifications during algorithm execution
 */
public class FraudGraph {
    
    private static final Logger logger = LoggerFactory.getLogger(FraudGraph.class);
    
    private final Map<String, GraphNode> nodes;
    private final ReadWriteLock graphLock;
    
    public FraudGraph() {
        this.nodes = new ConcurrentHashMap<>();
        this.graphLock = new ReentrantReadWriteLock();
    }
    
    /**
     * Add or get existing node.
     * Time Complexity: O(1) average case
     * Thread-safe: uses ConcurrentHashMap.computeIfAbsent
     */
    public GraphNode addNode(String nodeId) {
        return nodes.computeIfAbsent(nodeId, GraphNode::new);
    }
    
    /**
     * Add directed edge from source to target.
     * Time Complexity: O(1) average case
     * Automatically creates nodes if they don't exist.
     */
    public void addEdge(String txnId, String sourceId, String targetId, 
                       BigDecimal amount, Instant timestamp, double riskScore) {
        
        GraphNode sourceNode = addNode(sourceId);
        addNode(targetId); // Ensure target exists
        
        GraphEdge edge = new GraphEdge(txnId, sourceId, targetId, amount, timestamp, riskScore);
        sourceNode.addEdge(edge);
        
        logger.debug("Added edge: {} -> {} (txn: {}, amount: {})", 
                    sourceId, targetId, txnId, amount);
    }
    
    /**
     * Get node by ID.
     * Time Complexity: O(1) average case
     */
    public GraphNode getNode(String nodeId) {
        return nodes.get(nodeId);
    }
    
    /**
     * Get all nodes in the graph.
     * Time Complexity: O(1) to get reference
     */
    public Map<String, GraphNode> getAllNodes() {
        return nodes;
    }
    
    /**
     * Get neighbors of a node (outgoing edges).
     * Time Complexity: O(1)
     */
    public Set<String> getNeighbors(String nodeId) {
        GraphNode node = nodes.get(nodeId);
        return node != null ? node.getNeighbors() : Collections.emptySet();
    }
    
    /**
     * Remove edge between two nodes.
     * Time Complexity: O(1) average case
     */
    public boolean removeEdge(String sourceId, String targetId) {
        GraphNode sourceNode = nodes.get(sourceId);
        if (sourceNode != null) {
            GraphEdge removed = sourceNode.removeEdge(targetId);
            return removed != null;
        }
        return false;
    }
    
    /**
     * Get total number of nodes.
     * Time Complexity: O(1)
     */
    public int getNodeCount() {
        return nodes.size();
    }
    
    /**
     * Get total number of edges.
     * Time Complexity: O(V) where V = number of nodes
     */
    public int getEdgeCount() {
        return nodes.values().stream()
                .mapToInt(GraphNode::getOutDegree)
                .sum();
    }
    
    /**
     * Acquire read lock for algorithm execution.
     * Allows multiple concurrent readers.
     */
    public void acquireReadLock() {
        graphLock.readLock().lock();
    }
    
    /**
     * Release read lock.
     */
    public void releaseReadLock() {
        graphLock.readLock().unlock();
    }
    
    /**
     * Acquire write lock for structural modifications.
     * Exclusive access.
     */
    public void acquireWriteLock() {
        graphLock.writeLock().lock();
    }
    
    /**
     * Release write lock.
     */
    public void releaseWriteLock() {
        graphLock.writeLock().unlock();
    }
    
    /**
     * Get graph statistics for monitoring.
     */
    public Map<String, Object> getStatistics() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("nodeCount", getNodeCount());
        stats.put("edgeCount", getEdgeCount());
        stats.put("avgOutDegree", getNodeCount() > 0 ? 
                  (double) getEdgeCount() / getNodeCount() : 0.0);
        return stats;
    }
    
    @Override
    public String toString() {
        return "FraudGraph{" +
                "nodes=" + getNodeCount() +
                ", edges=" + getEdgeCount() +
                '}';
    }
}
