package com.fraudgraph.ingestion.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

import javax.validation.constraints.DecimalMin;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;

public class TransactionRequest {

    @NotBlank(message = "source_account is required")
    @JsonProperty("source_account")
    @JsonAlias({"source", "sourceAccount"})
    private String sourceAccount;

    @NotBlank(message = "target_account is required")
    @JsonProperty("target_account")
    @JsonAlias({"target", "targetAccount"})
    private String targetAccount;

    @NotNull(message = "amount is required")
    @DecimalMin(value = "0.01", message = "amount must be positive")
    private BigDecimal amount;

    private Instant timestamp;

    /** When true, broadcast / Kafka payload marks the transaction as fraud-flagged (manual inject, demos). */
    @JsonProperty("is_high_risk")
    @JsonAlias({"isHighRisk", "is_fraud_flag", "fraudFlag"})
    private Boolean highRisk;

    public String getSourceAccount() {
        return sourceAccount;
    }

    public void setSourceAccount(String sourceAccount) {
        this.sourceAccount = sourceAccount;
    }

    public String getTargetAccount() {
        return targetAccount;
    }

    public void setTargetAccount(String targetAccount) {
        this.targetAccount = targetAccount;
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

    public Boolean getHighRisk() {
        return highRisk;
    }

    public void setHighRisk(Boolean highRisk) {
        this.highRisk = highRisk;
    }
}
