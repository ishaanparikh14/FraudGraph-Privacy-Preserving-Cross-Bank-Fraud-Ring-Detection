package com.fraudgraph.graphengine.algorithm;

import com.fraudgraph.graphengine.graph.FraudGraph;
import com.fraudgraph.graphengine.graph.GraphNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Iterative PageRank algorithm for centrality scoring.
 * 
 * Time Complexity: O(k * (V + E)) where k = iterations
 * Space Complexity: O(V) for score storage
 * 
 * PageRank Intuition:
 * - Nodes with many incoming edges from important nodes get higher scores
 * - In fraud context: accounts central to transaction flow get higher scores
 * - Used for node sizing in visualization
 * 
 * Algorithm:
 * PR(v) = (1-d)/N + d * Σ(PR(u)/outdegree(u)) for all u linking to v
 * where d = damping factor (typically 0.85)
 */
public class PageRankCalculator {
    
    private static final Logger logger = LoggerFactory.getLogger(PageRankCalculator.class);
    
    private final FraudGraph graph;
    private final int maxIterations;
    private final double dampingFactor;
    private final double convergenceEpsilon;  // ADDED: Convergence threshold
    
    public PageRankCalculator(FraudGraph graph, int maxIterations, double dampingFactor) {
        this.graph = graph;
        this.maxIterations = maxIterations;
        this.dampingFactor = dampingFactor;
        this.convergenceEpsilon = 1e-6;  // Default: converged if max delta < 0.000001
    }
    
    public PageRankCalculator(FraudGraph graph, int maxIterations, double dampingFactor, double convergenceEpsilon) {
        this.graph = graph;
        this.maxIterations = maxIterations;
        this.dampingFactor = dampingFactor;
        this.convergenceEpsilon = convergenceEpsilon;
    }
    
    /**
     * Calculate PageRank for all nodes in graph.
     * Updates centrality scores in GraphNode objects.
     * 
     * @return Map of nodeId -> PageRank score
     */
    public Map<String, Double> calculatePageRank() {
        long startTime = System.currentTimeMillis();
        
        try {
            graph.acquireReadLock();
            
            Map<String, GraphNode> nodes = graph.getAllNodes();
            int nodeCount = nodes.size();
            
            if (nodeCount == 0) {
                return Collections.emptyMap();
            }
            
            // Initialize: equal probability distribution
            Map<String, Double> pageRank = new HashMap<>();
            Map<String, Double> newPageRank = new HashMap<>();
            double initialScore = 1.0 / nodeCount;
            
            for (String nodeId : nodes.keySet()) {
                pageRank.put(nodeId, initialScore);
            }
            
            // Build reverse adjacency list (incoming edges)
            Map<String, Set<String>> incomingEdges = buildIncomingEdges(nodes);
            
            // Iterative PageRank calculation with convergence check
            int actualIterations = 0;
            for (int iter = 0; iter < maxIterations; iter++) {
                actualIterations = iter + 1;
                
                double danglingSum = 0.0;
                
                // Calculate dangling node contribution (nodes with no outgoing edges)
                for (Map.Entry<String, GraphNode> entry : nodes.entrySet()) {
                    if (entry.getValue().getOutDegree() == 0) {
                        danglingSum += pageRank.get(entry.getKey());
                    }
                }
                
                double danglingContribution = dampingFactor * danglingSum / nodeCount;
                
                // Calculate new PageRank for each node
                double maxDelta = 0.0;  // ADDED: Track maximum change
                
                for (String nodeId : nodes.keySet()) {
                    double sum = 0.0;
                    
                    // Sum contributions from incoming edges
                    Set<String> incoming = incomingEdges.getOrDefault(nodeId, Collections.emptySet());
                    for (String sourceId : incoming) {
                        GraphNode sourceNode = nodes.get(sourceId);
                        int outDegree = sourceNode.getOutDegree();
                        if (outDegree > 0) {
                            sum += pageRank.get(sourceId) / outDegree;
                        }
                    }
                    
                    // PageRank formula
                    double newScore = (1.0 - dampingFactor) / nodeCount 
                                    + dampingFactor * sum 
                                    + danglingContribution;
                    newPageRank.put(nodeId, newScore);
                    
                    // ADDED: Track convergence
                    double delta = Math.abs(newScore - pageRank.get(nodeId));
                    maxDelta = Math.max(maxDelta, delta);
                }
                
                // Swap maps for next iteration
                Map<String, Double> temp = pageRank;
                pageRank = newPageRank;
                newPageRank = temp;
                
                // ADDED: Check convergence
                if (maxDelta < convergenceEpsilon) {
                    logger.debug("PageRank converged after {} iterations (maxDelta: {})", 
                                actualIterations, maxDelta);
                    break;
                }
            }
            
            if (actualIterations >= maxIterations) {
                logger.warn("PageRank did NOT converge after {} iterations (consider increasing maxIterations)", 
                           maxIterations);
            }
            
            // Normalize to [0, 1] range
            double maxScore = pageRank.values().stream().mapToDouble(Double::doubleValue).max().orElse(1.0);
            if (maxScore > 0) {
                for (Map.Entry<String, Double> entry : pageRank.entrySet()) {
                    double normalized = entry.getValue() / maxScore;
                    entry.setValue(normalized);
                    
                    // Update node centrality score
                    GraphNode node = nodes.get(entry.getKey());
                    if (node != null) {
                        node.setCentralityScore(normalized);
                    }
                }
            }
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("PageRank completed: {} nodes, {} iterations in {}ms (converged: {})", 
                       nodeCount, actualIterations, duration, actualIterations < maxIterations);
            
            return pageRank;
            
        } finally {
            graph.releaseReadLock();
        }
    }
    
    /**
     * Calculate PageRank for subgraph (specific set of nodes).
     * Useful for calculating centrality within a detected fraud ring.
     */
    public Map<String, Double> calculateSubgraphPageRank(Set<String> subgraphNodes) {
        if (subgraphNodes.isEmpty()) {
            return Collections.emptyMap();
        }
        
        try {
            graph.acquireReadLock();
            
            int nodeCount = subgraphNodes.size();
            Map<String, Double> pageRank = new HashMap<>();
            Map<String, Double> newPageRank = new HashMap<>();
            double initialScore = 1.0 / nodeCount;
            
            // Initialize
            for (String nodeId : subgraphNodes) {
                pageRank.put(nodeId, initialScore);
            }
            
            // Build incoming edges within subgraph
            Map<String, Set<String>> incomingEdges = new HashMap<>();
            for (String nodeId : subgraphNodes) {
                GraphNode node = graph.getNode(nodeId);
                if (node != null) {
                    for (String neighborId : node.getNeighbors()) {
                        if (subgraphNodes.contains(neighborId)) {
                            incomingEdges.computeIfAbsent(neighborId, k -> new HashSet<>()).add(nodeId);
                        }
                    }
                }
            }
            
            // Iterative calculation with convergence check
            int actualIterations = 0;
            for (int iter = 0; iter < maxIterations; iter++) {
                actualIterations = iter + 1;
                double maxDelta = 0.0;
                
                for (String nodeId : subgraphNodes) {
                    double sum = 0.0;
                    
                    Set<String> incoming = incomingEdges.getOrDefault(nodeId, Collections.emptySet());
                    for (String sourceId : incoming) {
                        GraphNode sourceNode = graph.getNode(sourceId);
                        if (sourceNode != null) {
                            // Count only outgoing edges within subgraph
                            long outDegreeInSubgraph = sourceNode.getNeighbors().stream()
                                    .filter(subgraphNodes::contains)
                                    .count();
                            if (outDegreeInSubgraph > 0) {
                                sum += pageRank.get(sourceId) / outDegreeInSubgraph;
                            }
                        }
                    }
                    
                    double newScore = (1.0 - dampingFactor) / nodeCount + dampingFactor * sum;
                    newPageRank.put(nodeId, newScore);
                    
                    // Track convergence
                    double delta = Math.abs(newScore - pageRank.get(nodeId));
                    maxDelta = Math.max(maxDelta, delta);
                }
                
                Map<String, Double> temp = pageRank;
                pageRank = newPageRank;
                newPageRank = temp;
                
                // Check convergence
                if (maxDelta < convergenceEpsilon) {
                    logger.debug("Subgraph PageRank converged after {} iterations", actualIterations);
                    break;
                }
            }
            
            // Normalize
            double maxScore = pageRank.values().stream().mapToDouble(Double::doubleValue).max().orElse(1.0);
            if (maxScore > 0) {
                for (Map.Entry<String, Double> entry : pageRank.entrySet()) {
                    entry.setValue(entry.getValue() / maxScore);
                }
            }
            
            logger.debug("Subgraph PageRank: {} nodes", nodeCount);
            return pageRank;
            
        } finally {
            graph.releaseReadLock();
        }
    }
    
    /**
     * Build reverse adjacency list (incoming edges).
     */
    private Map<String, Set<String>> buildIncomingEdges(Map<String, GraphNode> nodes) {
        Map<String, Set<String>> incomingEdges = new HashMap<>();
        
        for (Map.Entry<String, GraphNode> entry : nodes.entrySet()) {
            String sourceId = entry.getKey();
            GraphNode sourceNode = entry.getValue();
            
            for (String targetId : sourceNode.getNeighbors()) {
                incomingEdges.computeIfAbsent(targetId, k -> new HashSet<>()).add(sourceId);
            }
        }
        
        return incomingEdges;
    }
}
