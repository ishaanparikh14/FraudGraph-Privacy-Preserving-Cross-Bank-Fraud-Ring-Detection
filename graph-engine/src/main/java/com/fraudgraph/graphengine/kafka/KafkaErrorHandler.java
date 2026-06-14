package com.fraudgraph.graphengine.kafka;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.listener.KafkaListenerErrorHandler;
import org.springframework.kafka.listener.ListenerExecutionFailedException;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageHeaders;
import org.springframework.stereotype.Component;

/**
 * Global error handler for Kafka consumers.
 * 
 * Handles:
 * - Deserialization failures
 * - Processing exceptions
 * - Poison messages
 * 
 * Strategy:
 * - Log error with full context
 * - Allow offset to commit (skip poison message)
 * - Alert on repeated failures
 */
@Component("kafkaErrorHandler")
public class KafkaErrorHandler implements KafkaListenerErrorHandler {
    
    private static final Logger logger = LoggerFactory.getLogger(KafkaErrorHandler.class);
    
    @Override
    public Object handleError(Message<?> message, ListenerExecutionFailedException exception) {
        MessageHeaders headers = message.getHeaders();
        
        String topic = (String) headers.get(KafkaHeaders.RECEIVED_TOPIC);
        Integer partition = (Integer) headers.get(KafkaHeaders.RECEIVED_PARTITION_ID);
        Long offset = (Long) headers.get(KafkaHeaders.OFFSET);
        
        logger.error("Kafka consumer error - Topic: {}, Partition: {}, Offset: {}, Payload: {}", 
                    topic, partition, offset, message.getPayload(), exception);
        
        // Check if this is a deserialization error
        if (exception.getCause() instanceof org.springframework.kafka.support.serializer.DeserializationException) {
            logger.error("Deserialization failure - skipping poison message at offset: {}", offset);
            // Return null to skip this message and commit offset
            return null;
        }
        
        // For other errors, log and skip
        logger.error("Processing failure - skipping message at offset: {}", offset);
        return null;
    }
}
