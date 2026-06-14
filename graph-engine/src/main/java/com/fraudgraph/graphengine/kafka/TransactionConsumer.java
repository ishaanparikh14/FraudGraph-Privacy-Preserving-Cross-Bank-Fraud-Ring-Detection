package com.fraudgraph.graphengine.kafka;

import com.fraudgraph.graphengine.dto.ScoredTransaction;
import com.fraudgraph.graphengine.graph.FraudGraph;
import com.fraudgraph.graphengine.service.AlertService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Kafka consumer for scored transactions.
 * Consumes from transactions.scored topic and builds the fraud graph.
 */
@Component
public class TransactionConsumer {
    
    private static final Logger logger = LoggerFactory.getLogger(TransactionConsumer.class);
    
    private final FraudGraph graph;
    private final AlertService alertService;
    
    public TransactionConsumer(FraudGraph graph, AlertService alertService) {
        this.graph = graph;
        this.alertService = alertService;
    }
    
    /**
     * Consume scored transactions and add to graph.
     * All edges are kept (low + high risk) so the graph matches Person 1 traffic like the live simulator.
     * 
     * Error Handling:
     * - Deserialization errors: Logged and skipped (sent to DLQ)
     * - Processing errors: Retried 3 times with 2s backoff
     * - Poison messages: Skipped after logging
     * 
     * Thread Safety: 3 concurrent threads can call this method.
     * Graph operations are thread-safe via ConcurrentHashMap.
     */
    @KafkaListener(
            topics = "${fraudgraph.kafka.scored-topic}",
            groupId = "${spring.kafka.consumer.group-id}",
            containerFactory = "kafkaListenerContainerFactory",
            errorHandler = "kafkaErrorHandler"
    )
    public void consumeTransaction(ScoredTransaction transaction) {
        if (transaction == null) {
            logger.warn("Received null transaction - skipping");
            return;
        }
        
        try {
            logger.debug("Received transaction: {}", transaction.getTxnId());
            
            // Validate required fields
            if (transaction.getSenderId() == null || transaction.getReceiverId() == null) {
                logger.warn("Invalid transaction: missing sender or receiver ID - txn: {}", 
                           transaction.getTxnId());
                return;
            }
            
            if (transaction.getTxnId() == null) {
                logger.warn("Invalid transaction: missing txn_id");
                return;
            }
            
            // Add edge to graph (thread-safe operation)
            graph.addEdge(
                    transaction.getTxnId(),
                    transaction.getSenderId(),
                    transaction.getReceiverId(),
                    transaction.getAmount() != null ? transaction.getAmount() : java.math.BigDecimal.ZERO,
                    transaction.getTimestamp() != null ? transaction.getTimestamp() : java.time.Instant.now(),
                    transaction.getRiskScore() != null ? transaction.getRiskScore() : 0.0
            );
            
            logger.info("Added transaction to graph: {} ({} -> {})", 
                       transaction.getTxnId(), 
                       transaction.getSenderId(), 
                       transaction.getReceiverId());
            
            // Trigger fraud detection check (async, non-blocking)
            alertService.checkForNewFraudRings();
            
        } catch (Exception e) {
            logger.error("Error processing transaction: {} - will retry", 
                        transaction.getTxnId(), e);
            // Exception will be caught by error handler and retried
            throw new RuntimeException("Failed to process transaction: " + transaction.getTxnId(), e);
        }
    }
}
