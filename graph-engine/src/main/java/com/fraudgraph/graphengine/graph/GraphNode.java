package com.fraudgraph.graphengine.graph;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Represents a node (account) in the fraud detection graph.
 * Thread-safe implementation using ConcurrentHashMap for adjacency list.
 * 
 * Time Complexity:
 * - addEdge: O(1) average case
 * - getOutgoingEdges: O(1)
 * - getNeighbors: O(1)
 */
public class GraphNode {
    
    private final String nodeId;
    private final Map<String, GraphEdge> outgoingEdges; // target nodeId -> edge
    private double centralityScore; // PageRank score
    
    public GraphNode(String nodeId) {
        this.nodeId = nodeId;
        this.outgoingEdges = new ConcurrentHashMap<>();
        this.centralityScore = 0.0;
    }
    
    /**
     * Add a directed edge from this node to target.
     * O(1) average case complexity.
     */
    public void addEdge(GraphEdge edge) {
        outgoingEdges.put(edge.getTargetId(), edge);
    }
    
    /**
     * Get all outgoing edges from this node.
     * O(1) complexity.
     */
    public Map<String, GraphEdge> getOutgoingEdges() {
        return outgoingEdges;
    }
    
    /**
     * Get set of neighbor node IDs (targets of outgoing edges).
     * O(1) complexity to get the set reference.
     */
    public Set<String> getNeighbors() {
        return outgoingEdges.keySet();
    }
    
    /**
     * Get edge to specific target node.
     * O(1) average case complexity.
     */
    public GraphEdge getEdgeTo(String targetId) {
        return outgoingEdges.get(targetId);
    }
    
    /**
     * Remove edge to target node.
     * O(1) average case complexity.
     */
    public GraphEdge removeEdge(String targetId) {
        return outgoingEdges.remove(targetId);
    }
    
    /**
     * Get out-degree (number of outgoing edges).
     * O(1) complexity.
     */
    public int getOutDegree() {
        return outgoingEdges.size();
    }
    
    public String getNodeId() {
        return nodeId;
    }
    
    public double getCentralityScore() {
        return centralityScore;
    }
    
    public void setCentralityScore(double centralityScore) {
        this.centralityScore = centralityScore;
    }
    
    @Override
    public String toString() {
        return "GraphNode{" +
                "nodeId='" + nodeId + '\'' +
                ", outDegree=" + getOutDegree() +
                ", centralityScore=" + centralityScore +
                '}';
    }
}
