package com.fraudgraph.graphengine.algorithm;

import com.fraudgraph.graphengine.graph.FraudGraph;
import com.fraudgraph.graphengine.graph.GraphNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Iterative DFS-based cycle detection using explicit stack.
 * Detects back edges which mathematically prove cycle existence.
 * 
 * Time Complexity: O(V + E)
 * Space Complexity: O(V) for stack and visited sets
 * 
 * Back Edge Definition:
 * An edge (u -> v) where v is an ancestor of u in the DFS tree.
 * Back edge existence proves a cycle in directed graphs.
 */
public class DFSCycleDetector {
    
    private static final Logger logger = LoggerFactory.getLogger(DFSCycleDetector.class);
    
    private final FraudGraph graph;
    
    public DFSCycleDetector(FraudGraph graph) {
        this.graph = graph;
    }
    
    /**
     * Detect first cycle in graph using iterative DFS.
     * Returns back edge information if cycle found.
     * 
     * @return BackEdge object if cycle found, null otherwise
     */
    public BackEdge detectCycle() {
        long startTime = System.currentTimeMillis();
        
        try {
            graph.acquireReadLock();
            
            Set<String> visited = new HashSet<>();
            Set<String> recursionStack = new HashSet<>();
            Map<String, String> parent = new HashMap<>();
            
            // Try DFS from each unvisited node
            for (String nodeId : graph.getAllNodes().keySet()) {
                if (!visited.contains(nodeId)) {
                    BackEdge backEdge = dfsIterative(nodeId, visited, recursionStack, parent);
                    if (backEdge != null) {
                        long duration = System.currentTimeMillis() - startTime;
                        logger.info("DFS cycle detected: {} -> {} in {}ms", 
                                   backEdge.getSource(), backEdge.getTarget(), duration);
                        return backEdge;
                    }
                }
            }
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("DFS completed: no cycles found in {}ms", duration);
            return null;
            
        } finally {
            graph.releaseReadLock();
        }
    }
    
    /**
     * Iterative DFS using explicit stack.
     * Avoids recursion stack overflow for large graphs.
     * 
     * Stack Entry: (nodeId, isBacktracking)
     * - isBacktracking = false: first visit (push to recursion stack)
     * - isBacktracking = true: backtrack (pop from recursion stack)
     */
    private BackEdge dfsIterative(String startNode, Set<String> visited, 
                                  Set<String> recursionStack, Map<String, String> parent) {
        
        Deque<StackEntry> stack = new ArrayDeque<>();
        stack.push(new StackEntry(startNode, false));
        
        while (!stack.isEmpty()) {
            StackEntry entry = stack.pop();
            String nodeId = entry.nodeId;
            
            if (entry.isBacktracking) {
                // Backtracking: remove from recursion stack
                recursionStack.remove(nodeId);
                continue;
            }
            
            if (visited.contains(nodeId)) {
                continue;
            }
            
            // First visit: mark visited and add to recursion stack
            visited.add(nodeId);
            recursionStack.add(nodeId);
            
            // Push backtrack marker
            stack.push(new StackEntry(nodeId, true));
            
            // Visit neighbors
            GraphNode node = graph.getNode(nodeId);
            if (node != null) {
                for (String neighborId : node.getNeighbors()) {
                    
                    if (recursionStack.contains(neighborId)) {
                        // Back edge found: neighbor is in current recursion path
                        // This proves a cycle exists
                        logger.debug("Back edge detected: {} -> {}", nodeId, neighborId);
                        return new BackEdge(nodeId, neighborId, reconstructPath(parent, nodeId, neighborId));
                    }
                    
                    if (!visited.contains(neighborId)) {
                        parent.put(neighborId, nodeId);
                        stack.push(new StackEntry(neighborId, false));
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Reconstruct cycle path from parent map.
     */
    private List<String> reconstructPath(Map<String, String> parent, String source, String target) {
        List<String> path = new ArrayList<>();
        path.add(target);
        
        String current = source;
        while (current != null && !current.equals(target)) {
            path.add(0, current);
            current = parent.get(current);
            
            // Prevent infinite loop
            if (path.size() > graph.getNodeCount()) {
                break;
            }
        }
        
        path.add(target); // Complete the cycle
        return path;
    }
    
    /**
     * Stack entry for iterative DFS.
     */
    private static class StackEntry {
        final String nodeId;
        final boolean isBacktracking;
        
        StackEntry(String nodeId, boolean isBacktracking) {
            this.nodeId = nodeId;
            this.isBacktracking = isBacktracking;
        }
    }
    
    /**
     * Represents a back edge (cycle indicator).
     */
    public static class BackEdge {
        private final String source;
        private final String target;
        private final List<String> cyclePath;
        
        public BackEdge(String source, String target, List<String> cyclePath) {
            this.source = source;
            this.target = target;
            this.cyclePath = cyclePath;
        }
        
        public String getSource() {
            return source;
        }
        
        public String getTarget() {
            return target;
        }
        
        public List<String> getCyclePath() {
            return cyclePath;
        }
        
        @Override
        public String toString() {
            return "BackEdge{" + source + " -> " + target + ", path=" + cyclePath + '}';
        }
    }
}
