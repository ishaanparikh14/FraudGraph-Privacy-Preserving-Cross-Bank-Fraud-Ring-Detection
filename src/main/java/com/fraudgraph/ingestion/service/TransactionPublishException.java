package com.fraudgraph.ingestion.service;

public class TransactionPublishException extends RuntimeException {

    public TransactionPublishException(String message, Throwable cause) {
        super(message, cause);
    }
}
