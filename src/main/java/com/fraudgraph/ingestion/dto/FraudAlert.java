package com.fraudgraph.ingestion.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class FraudAlert {

    @JsonProperty("alert_id")
    private String alertId;

    @JsonProperty("cycle_accounts")
    private List<String> cycleAccounts = new ArrayList<String>();

    @JsonProperty("back_edge_source")
    private String backEdgeSource;

    @JsonProperty("back_edge_target")
    private String backEdgeTarget;

    @JsonProperty("edge_ids")
    private List<String> edgeIds = new ArrayList<String>();

    @JsonProperty("total_amount")
    private BigDecimal totalAmount;

    private String severity;
    private String reason;
    private String source;

    @JsonProperty("detection_method")
    private String detectionMethod;

    @JsonProperty("detected_at")
    private Instant detectedAt;

    public static FraudAlert from(FraudAlertRequest request) {
        FraudAlert alert = new FraudAlert();
        alert.setAlertId(request.getAlertId() == null || request.getAlertId().trim().isEmpty()
                ? UUID.randomUUID().toString()
                : request.getAlertId());
        alert.setCycleAccounts(request.getCycleAccounts());
        alert.setBackEdgeSource(request.getBackEdgeSource());
        alert.setBackEdgeTarget(request.getBackEdgeTarget());
        alert.setEdgeIds(request.getEdgeIds());
        alert.setTotalAmount(request.getTotalAmount());
        alert.setSeverity(request.getSeverity() == null ? "high" : request.getSeverity());
        alert.setReason(request.getReason() == null ? "DFS back-edge or SCC fraud ring detected" : request.getReason());
        alert.setSource(request.getSource() == null ? "graph-engine" : request.getSource());
        alert.setDetectionMethod(request.getDetectionMethod());
        alert.setDetectedAt(Instant.now());
        return alert;
    }

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

    public Instant getDetectedAt() {
        return detectedAt;
    }

    public void setDetectedAt(Instant detectedAt) {
        this.detectedAt = detectedAt;
    }
}
