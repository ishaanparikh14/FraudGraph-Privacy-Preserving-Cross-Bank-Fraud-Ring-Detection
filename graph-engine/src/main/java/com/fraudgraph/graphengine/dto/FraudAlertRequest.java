package com.fraudgraph.graphengine.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.List;

/**
 * DTO for posting fraud alerts to Person 1's API.
 * Matches FraudAlertRequest schema from Person 1.
 */
public class FraudAlertRequest {
    
    @JsonProperty("alert_id")
    private String alertId;
    
    @JsonProperty("cycle_accounts")
    private List<String> cycleAccounts;
    
    @JsonProperty("back_edge_source")
    private String backEdgeSource;
    
    @JsonProperty("back_edge_target")
    private String backEdgeTarget;
    
    @JsonProperty("edge_ids")
    private List<String> edgeIds;
    
    @JsonProperty("total_amount")
    private BigDecimal totalAmount;
    
    private String severity;
    private String reason;
    private String source;

    @JsonProperty("detection_method")
    private String detectionMethod;
    
    public String getAlertId() {
        return alertId;
    }
    
    public void setAlertId(String alertId) {
        this.alertId = alertId;
    }
    
    public List<String> getCycleAccounts() {
        return cycleAccounts;
    }
    
    public void setCycleAccounts(List<String> cycleAccounts) {
        this.cycleAccounts = cycleAccounts;
    }
    
    public String getBackEdgeSource() {
        return backEdgeSource;
    }
    
    public void setBackEdgeSource(String backEdgeSource) {
        this.backEdgeSource = backEdgeSource;
    }
    
    public String getBackEdgeTarget() {
        return backEdgeTarget;
    }
    
    public void setBackEdgeTarget(String backEdgeTarget) {
        this.backEdgeTarget = backEdgeTarget;
    }
    
    public List<String> getEdgeIds() {
        return edgeIds;
    }
    
    public void setEdgeIds(List<String> edgeIds) {
        this.edgeIds = edgeIds;
    }
    
    public BigDecimal getTotalAmount() {
        return totalAmount;
    }
    
    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }
    
    public String getSeverity() {
        return severity;
    }
    
    public void setSeverity(String severity) {
        this.severity = severity;
    }
    
    public String getReason() {
        return reason;
    }
    
    public void setReason(String reason) {
        this.reason = reason;
    }
    
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }

    public String getDetectionMethod() {
        return detectionMethod;
    }

    public void setDetectionMethod(String detectionMethod) {
        this.detectionMethod = detectionMethod;
    }
}
