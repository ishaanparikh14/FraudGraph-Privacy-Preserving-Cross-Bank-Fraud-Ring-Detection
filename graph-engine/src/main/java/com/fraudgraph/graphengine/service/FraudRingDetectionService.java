package com.fraudgraph.graphengine.service;

import com.fraudgraph.graphengine.algorithm.DFSCycleDetector;
import com.fraudgraph.graphengine.algorithm.PageRankCalculator;
import com.fraudgraph.graphengine.algorithm.TarjanSCC;
import com.fraudgraph.graphengine.dto.FraudRingResponse;
import com.fraudgraph.graphengine.graph.FraudGraph;
import com.fraudgraph.graphengine.graph.GraphEdge;
import com.fraudgraph.graphengine.graph.GraphNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Core service for fraud ring detection using Tarjan SCC and PageRank.
 */
@Service
public class FraudRingDetectionService {
    
    private static final Logger logger = LoggerFactory.getLogger(FraudRingDetectionService.class);
    
    private final FraudGraph graph;
    
    @Value("${fraudgraph.graph.pagerank-iterations:15}")
    private int pagerankIterations;
    
    @Value("${fraudgraph.graph.pagerank-damping:0.85}")
    private double pagerankDamping;
    
    public FraudRingDetectionService(FraudGraph graph) {
        this.graph = graph;
    }
    
    /**
     * Detect all fraud rings using Tarjan SCC algorithm.
     * Returns ranked list with PageRank centrality scores.
     */
    public List<FraudRingResponse> detectFraudRings() {
        logger.info("Starting fraud ring detection...");
        
        // Run Tarjan SCC
        TarjanSCC tarjan = new TarjanSCC(graph);
        List<Set<String>> sccs = tarjan.findSCCs();
        
        if (sccs.isEmpty()) {
            logger.info("No fraud rings detected");
            return Collections.emptyList();
        }
        
        // Calculate PageRank for centrality scoring
        PageRankCalculator pageRank = new PageRankCalculator(graph, pagerankIterations, pagerankDamping);
        pageRank.calculatePageRank();
        
        // Optional: detect one back edge for demo
        DFSCycleDetector dfsDetector = new DFSCycleDetector(graph);
        DFSCycleDetector.BackEdge backEdge = dfsDetector.detectCycle();
        
        // Build fraud ring responses
        List<FraudRingResponse> rings = new ArrayList<>();
        int ringCounter = 1;
        
        for (Set<String> scc : sccs) {
            FraudRingResponse ring = buildFraudRingResponse(scc, ringCounter, backEdge);
            rings.add(ring);
            ringCounter++;
        }
        
        // Rank by total volume (descending)
        rings.sort((r1, r2) -> r2.getTotalVolume().compareTo(r1.getTotalVolume()));
        
        // Assign priority ranks
        for (int i = 0; i < rings.size(); i++) {
            rings.get(i).setPriorityRank(i + 1);
        }
        
        logger.info("Detected {} fraud rings", rings.size());
        return rings;
    }
    
    /**
     * Get specific fraud ring by ID.
     */
    public Optional<FraudRingResponse> getFraudRingById(String ringId) {
        List<FraudRingResponse> allRings = detectFraudRings();
        return allRings.stream()
                .filter(ring -> ring.getRingId().equals(ringId))
                .findFirst();
    }
    
    /**
     * Build FraudRingResponse from SCC.
     */
    private FraudRingResponse buildFraudRingResponse(Set<String> scc, int ringNumber, 
                                                     DFSCycleDetector.BackEdge backEdge) {
        FraudRingResponse response = new FraudRingResponse();
        
        // Generate ring ID
        String ringId = "RING_" + String.format("%03d", ringNumber);
        response.setRingId(ringId);
        response.setDetectionMethod("Tarjan_SCC");
        
        // Build node list with centrality scores
        List<FraudRingResponse.NodeInfo> nodes = new ArrayList<>();
        for (String nodeId : scc) {
            GraphNode node = graph.getNode(nodeId);
            double centrality = node != null ? node.getCentralityScore() : 0.0;
            nodes.add(new FraudRingResponse.NodeInfo(nodeId, centrality, ringId));
        }
        response.setNodes(nodes);
        
        // Build edge list (only edges within the SCC)
        List<FraudRingResponse.EdgeInfo> edges = new ArrayList<>();
        BigDecimal totalVolume = BigDecimal.ZERO;
        
        for (String sourceId : scc) {
            GraphNode sourceNode = graph.getNode(sourceId);
            if (sourceNode != null) {
                for (String targetId : sourceNode.getNeighbors()) {
                    if (scc.contains(targetId)) {
                        GraphEdge edge = sourceNode.getEdgeTo(targetId);
                        if (edge != null) {
                            edges.add(new FraudRingResponse.EdgeInfo(
                                    edge.getTxnId(),
                                    edge.getSourceId(),
                                    edge.getTargetId(),
                                    edge.getAmount(),
                                    edge.getTimestamp(),
                                    edge.getRiskScore()
                            ));
                            totalVolume = totalVolume.add(edge.getAmount());
                        }
                    }
                }
            }
        }
        
        response.setEdges(edges);
        response.setTotalVolume(totalVolume);
        
        // Add back edge if it's part of this SCC
        if (backEdge != null && scc.contains(backEdge.getSource()) && scc.contains(backEdge.getTarget())) {
            response.setDfsBackEdge(new FraudRingResponse.BackEdgeInfo(
                    backEdge.getSource(), backEdge.getTarget()));
        }
        
        return response;
    }
    
    /**
     * Get graph statistics.
     */
    public Map<String, Object> getGraphStatistics() {
        return graph.getStatistics();
    }
}
