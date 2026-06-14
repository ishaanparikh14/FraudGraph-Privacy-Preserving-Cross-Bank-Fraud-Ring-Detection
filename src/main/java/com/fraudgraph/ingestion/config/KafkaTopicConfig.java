package com.fraudgraph.ingestion.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    @SuppressWarnings("null")
    public NewTopic rawTransactionsTopic(@Value("${fraudgraph.kafka.raw-topic}") String topicName) {
        return TopicBuilder.name(topicName)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    @SuppressWarnings("null")
    public NewTopic fraudAlertsTopic(@Value("${fraudgraph.kafka.alert-topic}") String topicName) {
        return TopicBuilder.name(topicName)
                .partitions(1)
                .replicas(1)
                .build();
    }
}
