package com.fraudgraph.graphengine.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Response DTO for fraud ring detection API.
 * Matches Person 4's frontend requirements.
 */
public class FraudRingResponse {
    
    @JsonProperty("ring_id")
    private String ringId;
    
    private List<NodeInfo> nodes;
    private List<EdgeInfo> edges;
    
    @JsonProperty("total_volume")
    private BigDecimal totalVolume;
    
    @JsonProperty("priority_rank")
    private Integer priorityRank;
    
    @JsonProperty("detection_method")
    private String detectionMethod;
    
    @JsonProperty("dfs_back_edge")
    private BackEdgeInfo dfsBackEdge;
    
    // Getters and Setters
    
    public String getRingId() {
        return ringId;
    }
    
    public void setRingId(String ringId) {
        this.ringId = ringId;
    }
    
    public List<NodeInfo> getNodes() {
        return nodes;
    }
    
    public void setNodes(List<NodeInfo> nodes) {
        this.nodes = nodes;
    }
    
    public List<EdgeInfo> getEdges() {
        return edges;
    }
    
    public void setEdges(List<EdgeInfo> edges) {
        this.edges = edges;
    }
    
    public BigDecimal getTotalVolume() {
        return totalVolume;
    }
    
    public void setTotalVolume(BigDecimal totalVolume) {
        this.totalVolume = totalVolume;
    }
    
    public Integer getPriorityRank() {
        return priorityRank;
    }
    
    public void setPriorityRank(Integer priorityRank) {
        this.priorityRank = priorityRank;
    }
    
    public String getDetectionMethod() {
        return detectionMethod;
    }
    
    public void setDetectionMethod(String detectionMethod) {
        this.detectionMethod = detectionMethod;
    }
    
    public BackEdgeInfo getDfsBackEdge() {
        return dfsBackEdge;
    }
    
    public void setDfsBackEdge(BackEdgeInfo dfsBackEdge) {
        this.dfsBackEdge = dfsBackEdge;
    }
    
    /**
     * Node information with centrality score for visualization.
     */
    public static class NodeInfo {
        private String id;
        
        @JsonProperty("centrality_score")
        private Double centralityScore;
        
        @JsonProperty("scc_cluster_id")
        private String sccClusterId;
        
        public NodeInfo() {}
        
        public NodeInfo(String id, Double centralityScore, String sccClusterId) {
            this.id = id;
            this.centralityScore = centralityScore;
            this.sccClusterId = sccClusterId;
        }
        
        public String getId() {
            return id;
        }
        
        public void setId(String id) {
            this.id = id;
        }
        
        public Double getCentralityScore() {
            return centralityScore;
        }
        
        public void setCentralityScore(Double centralityScore) {
            this.centralityScore = centralityScore;
        }
        
        public String getSccClusterId() {
            return sccClusterId;
        }
        
        public void setSccClusterId(String sccClusterId) {
            this.sccClusterId = sccClusterId;
        }
    }
    
    /**
     * Edge information with full transaction details.
     */
    public static class EdgeInfo {
        @JsonProperty("txn_id")
        private String txnId;
        
        private String from;
        private String to;
        private BigDecimal amount;
        private Instant timestamp;
        
        @JsonProperty("risk_score")
        private Double riskScore;
        
        public EdgeInfo() {}
        
        public EdgeInfo(String txnId, String from, String to, BigDecimal amount, 
                       Instant timestamp, Double riskScore) {
            this.txnId = txnId;
            this.from = from;
            this.to = to;
            this.amount = amount;
            this.timestamp = timestamp;
            this.riskScore = riskScore;
        }
        
        public String getTxnId() {
            return txnId;
        }
        
        public void setTxnId(String txnId) {
            this.txnId = txnId;
        }
        
        public String getFrom() {
            return from;
        }
        
        public void setFrom(String from) {
            this.from = from;
        }
        
        public String getTo() {
            return to;
        }
        
        public void setTo(String to) {
            this.to = to;
        }
        
        public BigDecimal getAmount() {
            return amount;
        }
        
        public void setAmount(BigDecimal amount) {
            this.amount = amount;
        }
        
        public Instant getTimestamp() {
            return timestamp;
        }
        
        public void setTimestamp(Instant timestamp) {
            this.timestamp = timestamp;
        }
        
        public Double getRiskScore() {
            return riskScore;
        }
        
        public void setRiskScore(Double riskScore) {
            this.riskScore = riskScore;
        }
    }
    
    /**
     * Back edge information from DFS cycle detection.
     */
    public static class BackEdgeInfo {
        private String from;
        private String to;
        
        public BackEdgeInfo() {}
        
        public BackEdgeInfo(String from, String to) {
            this.from = from;
            this.to = to;
        }
        
        public String getFrom() {
            return from;
        }
        
        public void setFrom(String from) {
            this.from = from;
        }
        
        public String getTo() {
            return to;
        }
        
        public void setTo(String to) {
            this.to = to;
        }
    }
}
