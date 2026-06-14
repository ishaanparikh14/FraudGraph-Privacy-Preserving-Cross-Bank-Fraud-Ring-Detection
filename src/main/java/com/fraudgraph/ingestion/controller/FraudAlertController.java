package com.fraudgraph.ingestion.controller;

import com.fraudgraph.ingestion.dto.FraudAlert;
import com.fraudgraph.ingestion.dto.FraudAlertRequest;
import com.fraudgraph.ingestion.service.FraudAlertService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.validation.Valid;

@RestController
@RequestMapping("/alerts")
public class FraudAlertController {

    private final FraudAlertService fraudAlertService;

    public FraudAlertController(FraudAlertService fraudAlertService) {
        this.fraudAlertService = fraudAlertService;
    }

    @PostMapping("/fraud-ring")
    public ResponseEntity<FraudAlert> publishFraudRingAlert(@Valid @RequestBody FraudAlertRequest request) {
        FraudAlert alert = fraudAlertService.publish(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(alert);
    }
}
