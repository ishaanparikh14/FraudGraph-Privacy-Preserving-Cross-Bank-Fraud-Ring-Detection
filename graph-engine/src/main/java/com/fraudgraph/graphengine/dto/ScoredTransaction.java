package com.fraudgraph.graphengine.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * DTO for scored transactions consumed from Kafka.
 * Matches the schema from Person 1 & Person 2.
 */
public class ScoredTransaction {
    
    @JsonProperty("txn_id")
    private String txnId;
    
    @JsonProperty("sender_id")
    private String senderId;
    
    @JsonProperty("receiver_id")
    private String receiverId;
    
    private BigDecimal amount;
    private Instant timestamp;
    
    @JsonProperty("risk_score")
    private Double riskScore;
    
    @JsonProperty("is_high_risk")
    private Boolean isHighRisk;
    
    // Getters and Setters
    
    public String getTxnId() {
        return txnId;
    }
    
    public void setTxnId(String txnId) {
        this.txnId = txnId;
    }
    
    public String getSenderId() {
        return senderId;
    }
    
    public void setSenderId(String senderId) {
        this.senderId = senderId;
    }
    
    public String getReceiverId() {
        return receiverId;
    }
    
    public void setReceiverId(String receiverId) {
        this.receiverId = receiverId;
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
    
    public Boolean getIsHighRisk() {
        return isHighRisk;
    }
    
    public void setIsHighRisk(Boolean isHighRisk) {
        this.isHighRisk = isHighRisk;
    }
    
    @Override
    public String toString() {
        return "ScoredTransaction{" +
                "txnId='" + txnId + '\'' +
                ", " + senderId + " -> " + receiverId +
                ", amount=" + amount +
                ", riskScore=" + riskScore +
                ", isHighRisk=" + isHighRisk +
                '}';
    }
}
