package com.fraudgraph.ingestion.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.Instant;

public class IngestedTransaction {

    @JsonProperty("schema_version")
    private String schemaVersion;

    @JsonProperty("transaction_id")
    private String transactionId;

    private String source;
    private String target;
    private BigDecimal amount;
    private Instant timestamp;

    @JsonProperty("received_at")
    private Instant receivedAt;

    @JsonProperty("is_fraud_flag")
    private boolean fraudFlag;

    public IngestedTransaction() {
    }

    public IngestedTransaction(String schemaVersion, String transactionId, String source, String target,
                               BigDecimal amount, Instant timestamp, Instant receivedAt, boolean fraudFlag) {
        this.schemaVersion = schemaVersion;
        this.transactionId = transactionId;
        this.source = source;
        this.target = target;
        this.amount = amount;
        this.timestamp = timestamp;
        this.receivedAt = receivedAt;
        this.fraudFlag = fraudFlag;
    }

    public String getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(String schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(String transactionId) {
        this.transactionId = transactionId;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
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

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public void setReceivedAt(Instant receivedAt) {
        this.receivedAt = receivedAt;
    }

    public boolean isFraudFlag() {
        return fraudFlag;
    }

    public void setFraudFlag(boolean fraudFlag) {
        this.fraudFlag = fraudFlag;
    }
}
