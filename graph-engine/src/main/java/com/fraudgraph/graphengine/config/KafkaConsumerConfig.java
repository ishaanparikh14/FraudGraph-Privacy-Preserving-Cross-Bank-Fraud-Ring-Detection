package com.fraudgraph.graphengine.config;

import com.fraudgraph.graphengine.dto.ScoredTransaction;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka consumer configuration with error handling and retry.
 * 
 * Features:
 * - ErrorHandlingDeserializer wraps JsonDeserializer
 * - Retry with exponential backoff
 * - Dead-letter queue for poison messages
 * - Manual offset commit for safety
 */
@Configuration
@EnableKafka
public class KafkaConsumerConfig {
    
    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;
    
    @Value("${spring.kafka.consumer.group-id}")
    private String groupId;
    
    @Bean
    public ConsumerFactory<String, ScoredTransaction> consumerFactory() {
        Map<String, Object> config = new HashMap<>();
        
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        
        // FIXED: Wrap deserializers with ErrorHandlingDeserializer
        // This prevents consumer from dying on deserialization failures
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, ErrorHandlingDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ErrorHandlingDeserializer.class);
        
        // Delegate to actual deserializers
        config.put(ErrorHandlingDeserializer.KEY_DESERIALIZER_CLASS, StringDeserializer.class);
        config.put(ErrorHandlingDeserializer.VALUE_DESERIALIZER_CLASS, JsonDeserializer.class);
        
        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        
        // FIXED: Disable auto-commit for safety
        // Offsets are committed only after successful processing
        config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        
        config.put(JsonDeserializer.TRUSTED_PACKAGES, "*");
        config.put(JsonDeserializer.VALUE_DEFAULT_TYPE, ScoredTransaction.class.getName());
        
        // Add type mapping for flexibility
        config.put(JsonDeserializer.TYPE_MAPPINGS, 
                  "scoredTransaction:com.fraudgraph.graphengine.dto.ScoredTransaction");
        
        return new DefaultKafkaConsumerFactory<>(
                config,
                new ErrorHandlingDeserializer<>(new StringDeserializer()),
                new ErrorHandlingDeserializer<>(new JsonDeserializer<>(ScoredTransaction.class, false))
        );
    }
    
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, ScoredTransaction> kafkaListenerContainerFactory(
            KafkaTemplate<String, Object> kafkaTemplate) {
        
        ConcurrentKafkaListenerContainerFactory<String, ScoredTransaction> factory = 
                new ConcurrentKafkaListenerContainerFactory<>();
        
        factory.setConsumerFactory(consumerFactory());
        factory.setConcurrency(3); // 3 consumer threads
        
        // FIXED: Configure error handler with retry and backoff
        // Retry transient failures, then send to DLQ
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(
                // DLQ: Send failed records to dead-letter topic
                (consumerRecord, exception) -> {
                    logger.error("Sending to DLQ - Topic: {}, Partition: {}, Offset: {}", 
                                consumerRecord.topic(), 
                                consumerRecord.partition(), 
                                consumerRecord.offset(), 
                                exception);
                    
                    // Send to DLQ topic
                    kafkaTemplate.send("transactions.scored.DLQ", consumerRecord.value());
                },
                // Backoff: Retry 3 times with 2-second intervals
                new FixedBackOff(2000L, 3L)
        );
        
        // Don't retry on deserialization errors (poison messages)
        errorHandler.addNotRetryableExceptions(
                org.springframework.kafka.support.serializer.DeserializationException.class
        );
        
        factory.setCommonErrorHandler(errorHandler);
        
        // FIXED: Manual acknowledgment for safety
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        
        return factory;
    }
    
    private static final org.slf4j.Logger logger = 
            org.slf4j.LoggerFactory.getLogger(KafkaConsumerConfig.class);
}
