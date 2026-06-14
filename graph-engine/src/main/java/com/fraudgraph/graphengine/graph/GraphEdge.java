package com.fraudgraph.graphengine.graph;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Represents a directed edge (transaction) in the fraud detection graph.
 * Immutable data structure for thread safety.
 */
public class GraphEdge {
    
    private final String txnId;
    private final String sourceId;
    private final String targetId;
    private final BigDecimal amount;
    private final Instant timestamp;
    private final double riskScore;
    
    public GraphEdge(String txnId, String sourceId, String targetId, 
                     BigDecimal amount, Instant timestamp, double riskScore) {
        this.txnId = txnId;
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.amount = amount;
        this.timestamp = timestamp;
        this.riskScore = riskScore;
    }
    
    public String getTxnId() {
        return txnId;
    }
    
    public String getSourceId() {
        return sourceId;
    }
    
    public String getTargetId() {
        return targetId;
    }
    
    public BigDecimal getAmount() {
        return amount;
    }
    
    public Instant getTimestamp() {
        return timestamp;
    }
    
    public double getRiskScore() {
        return riskScore;
    }
    
    @Override
    public String toString() {
        return "GraphEdge{" +
                "txnId='" + txnId + '\'' +
                ", " + sourceId + " -> " + targetId +
                ", amount=" + amount +
                ", riskScore=" + riskScore +
                '}';
    }
}
