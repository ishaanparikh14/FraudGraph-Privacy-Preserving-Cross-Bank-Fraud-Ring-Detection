package com.fraudgraph.ingestion.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

import javax.validation.constraints.NotEmpty;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class FraudAlertRequest {

    @JsonProperty("alert_id")
    @JsonAlias("alertId")
    private String alertId;

    @NotEmpty(message = "cycle_accounts is required")
    @JsonProperty("cycle_accounts")
    @JsonAlias({"cycleAccounts", "account_hashes", "accountHashes"})
    private List<String> cycleAccounts = new ArrayList<String>();

    @JsonProperty("back_edge_source")
    @JsonAlias("backEdgeSource")
    private String backEdgeSource;

    @JsonProperty("back_edge_target")
    @JsonAlias("backEdgeTarget")
    private String backEdgeTarget;

    @JsonProperty("edge_ids")
    @JsonAlias("edgeIds")
    private List<String> edgeIds = new ArrayList<String>();

    @JsonProperty("total_amount")
    @JsonAlias({"totalAmount", "totalVolume"})
    private BigDecimal totalAmount;

    private String severity;
    private String reason;
    private String source;

    /** Optional: graph-engine algorithm (e.g. Tarjan_SCC) or demo label for manual/simulator injects. */
    @JsonProperty("detection_method")
    @JsonAlias("detectionMethod")
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
