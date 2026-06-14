package com.fraudgraph.graphengine.service;

import com.fraudgraph.graphengine.dto.FraudAlertRequest;
import com.fraudgraph.graphengine.dto.FraudRingResponse;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

/**
 * Service for sending fraud alerts to Person 1's API.
 * Implements atomic throttling to avoid duplicate alerts.
 * Uses circuit breaker for resilience.
 * 
 * Thread Safety: Uses AtomicReference with compareAndSet for lock-free
 * alert deduplication. Multiple concurrent threads cannot send duplicate
 * alerts for the same ring within the throttle window.
 */
@Service
public class AlertService {
    
    private static final Logger logger = LoggerFactory.getLogger(AlertService.class);
    
    private final FraudRingDetectionService detectionService;
    private final RestTemplate restTemplate;
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;
    
    @Value("${fraudgraph.api.base-url}")
    private String apiBaseUrl;
    
    @Value("${fraudgraph.graph.alert-throttle-seconds:30}")
    private int alertThrottleSeconds;
    
    // FIXED: Use AtomicReference for thread-safe compare-and-set
    // Each ring has an atomic reference to its last alert timestamp
    private final Map<String, AtomicReference<Instant>> alertedRings = new ConcurrentHashMap<>();
    
    public AlertService(FraudRingDetectionService detectionService) {
        this.detectionService = detectionService;
        this.restTemplate = new RestTemplate();
        
        // Configure circuit breaker for Person 1 API resilience
        CircuitBreakerConfig circuitBreakerConfig = CircuitBreakerConfig.custom()
                .failureRateThreshold(50)  // Open if 50% of calls fail
                .waitDurationInOpenState(Duration.ofSeconds(30))  // Wait 30s before retry
                .slidingWindowSize(10)  // Track last 10 calls
                .permittedNumberOfCallsInHalfOpenState(3)  // Test with 3 calls
                .build();
        
        CircuitBreakerRegistry circuitBreakerRegistry = CircuitBreakerRegistry.of(circuitBreakerConfig);
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("person1-api");
        
        // Configure retry for transient failures
        RetryConfig retryConfig = RetryConfig.custom()
                .maxAttempts(3)  // Retry up to 3 times
                .waitDuration(Duration.ofSeconds(2))  // Wait 2s between retries
                .retryExceptions(Exception.class)  // Retry on any exception
                .build();
        
        RetryRegistry retryRegistry = RetryRegistry.of(retryConfig);
        this.retry = retryRegistry.retry("person1-api-retry");
        
        logger.info("AlertService initialized with circuit breaker and retry policy");
    }
    
    /**
     * Check for new fraud rings and send alerts.
     * Called after each transaction is added to graph.
     * 
     * Thread Safety: Async execution prevents blocking Kafka consumers.
     * Alert deduplication is atomic via compareAndSet.
     */
    @Async
    public void checkForNewFraudRings() {
        try {
            List<FraudRingResponse> rings = detectionService.detectFraudRings();
            
            for (FraudRingResponse ring : rings) {
                if (shouldAlertAndMark(ring)) {
                    sendAlertWithResilience(ring);
                }
            }
        } catch (Exception e) {
            logger.error("Error checking for fraud rings", e);
        }
    }
    
    /**
     * Atomically check if alert should be sent AND mark as alerted.
     * 
     * Thread Safety: Uses AtomicReference.compareAndSet for lock-free
     * atomic check-and-update. Only ONE thread can successfully mark
     * a ring as alerted within the throttle window.
     * 
     * Algorithm:
     * 1. Get or create AtomicReference for this ring
     * 2. Read current timestamp atomically
     * 3. Check if throttle period has passed
     * 4. Atomically update ONLY if value hasn't changed (CAS)
     * 5. Return true only if CAS succeeded
     * 
     * Concurrency Guarantee: If two threads call this simultaneously:
     * - Both read the same old timestamp
     * - Both decide to alert
     * - Both attempt compareAndSet
     * - Only ONE succeeds (the other sees value changed)
     * - Only the successful thread returns true
     * 
     * @param ring The fraud ring to check
     * @return true if this thread should send alert, false otherwise
     */
    private boolean shouldAlertAndMark(FraudRingResponse ring) {
        String ringId = ring.getRingId();
        Instant now = Instant.now();
        
        // Get or create atomic reference for this ring
        AtomicReference<Instant> timestampRef = alertedRings.computeIfAbsent(
            ringId, 
            k -> new AtomicReference<>()
        );
        
        // Atomically read current value
        Instant lastAlerted = timestampRef.get();
        
        // Check if we should alert
        boolean shouldAlert = lastAlerted == null || 
            (now.getEpochSecond() - lastAlerted.getEpochSecond() >= alertThrottleSeconds);
        
        if (!shouldAlert) {
            logger.debug("Alert throttled for ring: {} (last alerted: {})", ringId, lastAlerted);
            return false;
        }
        
        // Atomically update ONLY if value hasn't changed
        // This is the critical section that prevents race conditions
        boolean updated = timestampRef.compareAndSet(lastAlerted, now);
        
        if (updated) {
            logger.debug("Alert marked for ring: {} (previous: {}, new: {})", ringId, lastAlerted, now);
        } else {
            logger.debug("Alert CAS failed for ring: {} (another thread won)", ringId);
        }
        
        return updated;
    }
    
    /**
     * Send fraud alert with circuit breaker and retry.
     * 
     * Resilience Strategy:
     * 1. Retry transient failures (network issues, timeouts)
     * 2. Circuit breaker prevents cascading failures
     * 3. Fallback logs alert for manual recovery
     * 
     * @param ring The fraud ring to alert
     */
    private void sendAlertWithResilience(FraudRingResponse ring) {
        try {
            // Wrap with retry and circuit breaker
            Retry.decorateRunnable(retry, 
                CircuitBreaker.decorateRunnable(circuitBreaker, 
                    () -> sendAlert(ring)
                )
            ).run();
            
        } catch (Exception e) {
            logger.error("Failed to send alert for ring: {} after retries. Circuit breaker state: {}", 
                        ring.getRingId(), circuitBreaker.getState(), e);
            
            // Fallback: Log alert for manual recovery
            logAlertForRecovery(ring);
        }
    }
    
    /**
     * Send fraud alert to Person 1's API.
     * POST http://localhost:8080/alerts/fraud-ring
     */
    private void sendAlert(FraudRingResponse ring) {
        FraudAlertRequest alertRequest = buildAlertRequest(ring);
        
        String url = apiBaseUrl + "/alerts/fraud-ring";
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        HttpEntity<FraudAlertRequest> request = new HttpEntity<>(alertRequest, headers);
        
        ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);
        
        if (response.getStatusCode().is2xxSuccessful()) {
            logger.info("Alert sent successfully for ring: {}", ring.getRingId());
        } else {
            logger.warn("Alert failed with status: {} for ring: {}", 
                       response.getStatusCode(), ring.getRingId());
            throw new RuntimeException("Alert failed with status: " + response.getStatusCode());
        }
    }
    
    /**
     * Log alert for manual recovery if all retries fail.
     */
    private void logAlertForRecovery(FraudRingResponse ring) {
        logger.error("ALERT RECOVERY NEEDED - Ring: {}, Accounts: {}, Volume: {}", 
                    ring.getRingId(), 
                    ring.getNodes().stream().map(n -> n.getId()).collect(Collectors.toList()),
                    ring.getTotalVolume());
    }
    
    /**
     * Build FraudAlertRequest from FraudRingResponse.
     */
    private FraudAlertRequest buildAlertRequest(FraudRingResponse ring) {
        FraudAlertRequest request = new FraudAlertRequest();
        
        request.setAlertId(ring.getRingId());
        
        // Extract account IDs from nodes
        List<String> cycleAccounts = ring.getNodes().stream()
                .map(FraudRingResponse.NodeInfo::getId)
                .collect(Collectors.toList());
        request.setCycleAccounts(cycleAccounts);
        
        // Extract transaction IDs from edges
        List<String> edgeIds = ring.getEdges().stream()
                .map(FraudRingResponse.EdgeInfo::getTxnId)
                .collect(Collectors.toList());
        request.setEdgeIds(edgeIds);
        
        // Back edge info
        if (ring.getDfsBackEdge() != null) {
            request.setBackEdgeSource(ring.getDfsBackEdge().getFrom());
            request.setBackEdgeTarget(ring.getDfsBackEdge().getTo());
        }
        
        request.setTotalAmount(ring.getTotalVolume());
        request.setSeverity("high");
        request.setReason(String.format(
                "Tarjan SCC fraud ring (size >= 2); ranked #%d by volume", 
                ring.getPriorityRank()));
        request.setSource("graph-engine");
        if (ring.getDetectionMethod() != null && !ring.getDetectionMethod().isBlank()) {
            request.setDetectionMethod(ring.getDetectionMethod());
        } else {
            request.setDetectionMethod("tarjan_scc");
        }
        
        return request;
    }
    
    /**
     * Clear alert history (for testing).
     */
    public void clearAlertHistory() {
        alertedRings.clear();
        logger.info("Alert history cleared");
    }
    
    /**
     * Get circuit breaker metrics for monitoring.
     */
    public Map<String, Object> getCircuitBreakerMetrics() {
        Map<String, Object> metrics = new HashMap<>();
        metrics.put("state", circuitBreaker.getState().toString());
        metrics.put("failureRate", circuitBreaker.getMetrics().getFailureRate());
        metrics.put("numberOfSuccessfulCalls", circuitBreaker.getMetrics().getNumberOfSuccessfulCalls());
        metrics.put("numberOfFailedCalls", circuitBreaker.getMetrics().getNumberOfFailedCalls());
        return metrics;
    }
}
