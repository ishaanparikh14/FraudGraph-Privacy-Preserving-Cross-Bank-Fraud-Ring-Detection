package com.fraudgraph.graphengine.algorithm;

import com.fraudgraph.graphengine.graph.FraudGraph;
import com.fraudgraph.graphengine.graph.GraphNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Tarjan's Strongly Connected Components (SCC) Algorithm.
 * 
 * Time Complexity: O(V + E) where V = vertices, E = edges
 * Space Complexity: O(V) for recursion stack and auxiliary data structures
 * 
 * Algorithm Overview:
 * 1. Performs DFS traversal maintaining discovery time and low-link values
 * 2. Low-link value = smallest discovery time reachable from a node
 * 3. When low-link[v] == discovery[v], v is root of an SCC
 * 4. Uses explicit stack to track nodes in current SCC path
 * 
 * Fraud Detection Application:
 * - SCC with size >= 2 indicates a cycle (potential fraud ring)
 * - Nodes in same SCC can reach each other = circular money flow
 */
public class TarjanSCC {
    
    private static final Logger logger = LoggerFactory.getLogger(TarjanSCC.class);
    
    private final FraudGraph graph;
    private final Map<String, Integer> discoveryTime;
    private final Map<String, Integer> lowLink;
    private final Set<String> onStack;
    private final Deque<String> stack;
    private final List<Set<String>> sccs;
    private int time;
    
    public TarjanSCC(FraudGraph graph) {
        this.graph = graph;
        this.discoveryTime = new HashMap<>();
        this.lowLink = new HashMap<>();
        this.onStack = new HashSet<>();
        this.stack = new ArrayDeque<>();
        this.sccs = new ArrayList<>();
        this.time = 0;
    }
    
    /**
     * Find all strongly connected components in the graph.
     * Returns only SCCs with size >= 2 (potential fraud rings).
     * 
     * Time Complexity: O(V + E)
     * 
     * Thread Safety: Acquires read lock and snapshots node set before traversal
     * to prevent inconsistent SCC detection during concurrent graph mutations.
     * 
     * @return List of SCCs, each SCC is a set of node IDs
     */
    public List<Set<String>> findSCCs() {
        long startTime = System.currentTimeMillis();
        
        try {
            graph.acquireReadLock();
            
            // FIXED: Snapshot node IDs before iteration to prevent:
            // 1. ConcurrentModificationException
            // 2. Non-deterministic traversal
            // 3. Inconsistent SCC results
            // 
            // Cost: O(V) space for snapshot, but ensures correctness
            Set<String> nodeSnapshot = new HashSet<>(graph.getAllNodes().keySet());
            
            logger.debug("Tarjan SCC starting with {} nodes (snapshot)", nodeSnapshot.size());
            
            // Initialize: run DFS from each unvisited node
            for (String nodeId : nodeSnapshot) {
                if (!discoveryTime.containsKey(nodeId)) {
                    dfs(nodeId);
                }
            }
            
            // Filter: only return SCCs with size >= 2 (cycles)
            List<Set<String>> fraudRings = new ArrayList<>();
            for (Set<String> scc : sccs) {
                if (scc.size() >= 2) {
                    fraudRings.add(scc);
                }
            }
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("Tarjan SCC completed: found {} fraud rings (size >= 2) in {}ms", 
                       fraudRings.size(), duration);
            
            return fraudRings;
            
        } finally {
            graph.releaseReadLock();
        }
    }
    
    /**
     * DFS traversal with low-link calculation.
     * 
     * Algorithm Steps:
     * 1. Set discovery time and low-link for current node
     * 2. Push node onto stack
     * 3. Visit all neighbors:
     *    - If unvisited: recurse and update low-link
     *    - If on stack: update low-link (back edge found)
     * 4. If low-link == discovery time: found SCC root, pop SCC from stack
     */
    private void dfs(String nodeId) {
        // Initialize discovery time and low-link value
        discoveryTime.put(nodeId, time);
        lowLink.put(nodeId, time);
        time++;
        
        // Push onto stack and mark as on stack
        stack.push(nodeId);
        onStack.add(nodeId);
        
        // Visit all neighbors
        GraphNode node = graph.getNode(nodeId);
        if (node != null) {
            for (String neighborId : node.getNeighbors()) {
                
                if (!discoveryTime.containsKey(neighborId)) {
                    // Neighbor not visited: recurse
                    dfs(neighborId);
                    // Update low-link: can reach nodes reachable from neighbor
                    lowLink.put(nodeId, Math.min(lowLink.get(nodeId), lowLink.get(neighborId)));
                    
                } else if (onStack.contains(neighborId)) {
                    // Neighbor on stack: back edge found (cycle detected)
                    // Update low-link to neighbor's discovery time
                    lowLink.put(nodeId, Math.min(lowLink.get(nodeId), discoveryTime.get(neighborId)));
                }
            }
        }
        
        // Check if nodeId is root of an SCC
        // Root condition: low-link value equals discovery time
        if (lowLink.get(nodeId).equals(discoveryTime.get(nodeId))) {
            // Pop all nodes in this SCC from stack
            Set<String> scc = new HashSet<>();
            String poppedNode;
            do {
                poppedNode = stack.pop();
                onStack.remove(poppedNode);
                scc.add(poppedNode);
            } while (!poppedNode.equals(nodeId));
            
            sccs.add(scc);
            
            if (scc.size() >= 2) {
                logger.debug("Found SCC (fraud ring candidate): {} nodes", scc.size());
            }
        }
    }
    
    /**
     * Get detailed SCC information including discovery and low-link values.
     * Useful for debugging and educational purposes.
     */
    public Map<String, Map<String, Integer>> getDebugInfo() {
        Map<String, Map<String, Integer>> debug = new HashMap<>();
        for (String nodeId : discoveryTime.keySet()) {
            Map<String, Integer> nodeInfo = new HashMap<>();
            nodeInfo.put("discoveryTime", discoveryTime.get(nodeId));
            nodeInfo.put("lowLink", lowLink.get(nodeId));
            debug.put(nodeId, nodeInfo);
        }
        return debug;
    }
}
