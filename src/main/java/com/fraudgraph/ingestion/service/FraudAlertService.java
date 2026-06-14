package com.fraudgraph.ingestion.service;

import com.fraudgraph.ingestion.dto.FraudAlert;
import com.fraudgraph.ingestion.dto.FraudAlertRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class FraudAlertService {

    private final SimpMessagingTemplate messagingTemplate;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String alertTopic;

    public FraudAlertService(SimpMessagingTemplate messagingTemplate,
                             KafkaTemplate<String, Object> kafkaTemplate,
                             @Value("${fraudgraph.kafka.alert-topic}") String alertTopic) {
        this.messagingTemplate = messagingTemplate;
        this.kafkaTemplate = kafkaTemplate;
        this.alertTopic = alertTopic;
    }

    @SuppressWarnings("null")
    public FraudAlert publish(FraudAlertRequest request) {
        FraudAlert alert = FraudAlert.from(request);
        messagingTemplate.convertAndSend("/topic/fraud-alerts", alert);
        String alertId = alert.getAlertId() != null ? alert.getAlertId() : "";
        kafkaTemplate.send(alertTopic, alertId, alert);
        return alert;
    }
}
