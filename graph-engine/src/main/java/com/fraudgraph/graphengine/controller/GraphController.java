package com.fraudgraph.graphengine.controller;

import com.fraudgraph.graphengine.dto.FraudRingResponse;
import com.fraudgraph.graphengine.dto.RingsListResponse;
import com.fraudgraph.graphengine.service.FraudRingDetectionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API for fraud ring detection.
 * Exposes endpoints for Person 4's frontend.
 */
@RestController
@RequestMapping("/api/graph")
@CrossOrigin(origins = "*")
public class GraphController {
    
    private static final Logger logger = LoggerFactory.getLogger(GraphController.class);
    
    private final FraudRingDetectionService detectionService;
    
    public GraphController(FraudRingDetectionService detectionService) {
        this.detectionService = detectionService;
    }
    
    /**
     * GET /api/graph/rings
     * Returns all detected fraud rings with full details.
     */
    @GetMapping("/rings")
    public ResponseEntity<RingsListResponse> getAllRings() {
        logger.info("GET /api/graph/rings");
        
        List<FraudRingResponse> rings = detectionService.detectFraudRings();
        RingsListResponse response = new RingsListResponse(rings);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * GET /api/graph/rings/{ringId}
     * Returns specific fraud ring by ID.
     */
    @GetMapping("/rings/{ringId}")
    public ResponseEntity<FraudRingResponse> getRingById(@PathVariable String ringId) {
        logger.info("GET /api/graph/rings/{}", ringId);
        
        return detectionService.getFraudRingById(ringId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * GET /api/graph/statistics
     * Returns graph statistics for monitoring.
     */
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics() {
        logger.info("GET /api/graph/statistics");
        
        Map<String, Object> stats = detectionService.getGraphStatistics();
        return ResponseEntity.ok(stats);
    }
}
