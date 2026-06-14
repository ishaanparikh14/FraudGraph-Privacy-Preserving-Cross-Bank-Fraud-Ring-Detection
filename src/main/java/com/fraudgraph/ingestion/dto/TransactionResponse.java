package com.fraudgraph.ingestion.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TransactionResponse {

    private String status;
    private String message;

    @JsonProperty("detection_status")
    private String detectionStatus;

    @JsonProperty("kafka_topic")
    private String kafkaTopic;

    @JsonProperty("transaction_id")
    private String transactionId;

    private IngestedTransaction data;

    public static TransactionResponse success(IngestedTransaction transaction, String kafkaTopic) {
        TransactionResponse response = new TransactionResponse();
        response.setStatus("success");
        response.setMessage("Transaction validated, pseudonymised, and published to Kafka");
        response.setDetectionStatus("queued_for_graph_analysis");
        response.setKafkaTopic(kafkaTopic);
        response.setTransactionId(transaction.getTransactionId());
        response.setData(transaction);
        return response;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getDetectionStatus() {
        return detectionStatus;
    }

    public void setDetectionStatus(String detectionStatus) {
        this.detectionStatus = detectionStatus;
    }

    public String getKafkaTopic() {
        return kafkaTopic;
    }

    public void setKafkaTopic(String kafkaTopic) {
        this.kafkaTopic = kafkaTopic;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(String transactionId) {
        this.transactionId = transactionId;
    }

    public IngestedTransaction getData() {
        return data;
    }

    public void setData(IngestedTransaction data) {
        this.data = data;
    }
}
