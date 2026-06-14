package com.fraudgraph.ingestion.controller;

import com.fraudgraph.ingestion.dto.IngestedTransaction;
import com.fraudgraph.ingestion.dto.TransactionRequest;
import com.fraudgraph.ingestion.dto.TransactionResponse;
import com.fraudgraph.ingestion.service.TransactionIngestionService;
import com.fraudgraph.ingestion.service.TransactionPublishException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.validation.Valid;
import java.util.Collections;
import java.util.Map;

@RestController
public class TransactionController {

    private final TransactionIngestionService ingestionService;

    public TransactionController(TransactionIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @GetMapping("/")
    public Map<String, String> root() {
        return Collections.singletonMap("service", "FraudGraph Spring Boot ingestion API");
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Collections.singletonMap("status", "running");
    }

    @PostMapping("/transaction")
    public ResponseEntity<TransactionResponse> ingest(@Valid @RequestBody TransactionRequest request) {
        try {
            IngestedTransaction transaction = ingestionService.ingest(request);
            return ResponseEntity.ok(TransactionResponse.success(transaction, ingestionService.getRawTopic()));
        } catch (TransactionPublishException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage(), ex);
        }
    }
}
