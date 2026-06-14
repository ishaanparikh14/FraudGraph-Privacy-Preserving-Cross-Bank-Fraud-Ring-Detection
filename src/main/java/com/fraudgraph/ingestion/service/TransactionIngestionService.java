package com.fraudgraph.ingestion.service;

import com.fraudgraph.ingestion.dto.IngestedTransaction;
import com.fraudgraph.ingestion.dto.TransactionMetric;
import com.fraudgraph.ingestion.dto.TransactionRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class TransactionIngestionService {

    private static final String SCHEMA_VERSION = "fraudgraph.transaction.v1";

    private final PseudonymisationService pseudonymisationService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final SimpMessagingTemplate messagingTemplate;
    private final String rawTopic;
    private final AtomicLong totalTransactions = new AtomicLong();

    public TransactionIngestionService(PseudonymisationService pseudonymisationService,
                                       KafkaTemplate<String, Object> kafkaTemplate,
                                       SimpMessagingTemplate messagingTemplate,
                                       @Value("${fraudgraph.kafka.raw-topic}") String rawTopic) {
        this.pseudonymisationService = pseudonymisationService;
        this.kafkaTemplate = kafkaTemplate;
        this.messagingTemplate = messagingTemplate;
        this.rawTopic = rawTopic;
    }

    @SuppressWarnings("null")
    public IngestedTransaction ingest(TransactionRequest request) {
        Instant now = Instant.now();
        Instant transactionTime = request.getTimestamp() == null ? now : request.getTimestamp();
        String sourceHash = pseudonymisationService.sha256(request.getSourceAccount());
        String targetHash = pseudonymisationService.sha256(request.getTargetAccount());
        boolean fraudFlag = Boolean.TRUE.equals(request.getHighRisk());

        IngestedTransaction transaction = new IngestedTransaction(
                SCHEMA_VERSION,
                UUID.randomUUID().toString(),
                sourceHash,
                targetHash,
                request.getAmount(),
                transactionTime,
                now,
                fraudFlag
        );

        try {
            String source = transaction.getSource() != null ? transaction.getSource() : "";
            kafkaTemplate.send(rawTopic, source, transaction).get(5, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new TransactionPublishException("Failed to publish transaction to Kafka topic " + rawTopic, ex);
        }

        long count = totalTransactions.incrementAndGet();
        messagingTemplate.convertAndSend("/topic/transactions", transaction);
        messagingTemplate.convertAndSend("/topic/metrics", new TransactionMetric(count, Instant.now()));
        return transaction;
    }

    public String getRawTopic() {
        return rawTopic;
    }
}
