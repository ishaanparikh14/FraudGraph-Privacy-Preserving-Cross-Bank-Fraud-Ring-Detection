package com.fraudgraph.ingestion.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public class TransactionMetric {

    @JsonProperty("total_transactions")
    private long totalTransactions;

    @JsonProperty("updated_at")
    private Instant updatedAt;

    public TransactionMetric(long totalTransactions, Instant updatedAt) {
        this.totalTransactions = totalTransactions;
        this.updatedAt = updatedAt;
    }

    public long getTotalTransactions() {
        return totalTransactions;
    }

    public void setTotalTransactions(long totalTransactions) {
        this.totalTransactions = totalTransactions;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
