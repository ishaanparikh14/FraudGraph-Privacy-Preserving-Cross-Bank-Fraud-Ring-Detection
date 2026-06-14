package com.fraudgraph.graphengine.controller;

import com.fraudgraph.graphengine.benchmark.BenchmarkService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * REST API for benchmark results.
 */
@RestController
@RequestMapping("/api/benchmark")
@CrossOrigin(origins = "*")
public class BenchmarkController {
    
    private final BenchmarkService benchmarkService;
    
    public BenchmarkController(BenchmarkService benchmarkService) {
        this.benchmarkService = benchmarkService;
    }
    
    /**
     * GET /api/benchmark/summary
     * Returns benchmark comparison results.
     */
    @GetMapping("/summary")
    public ResponseEntity<BenchmarkService.BenchmarkResult> getBenchmarkSummary() {
        return benchmarkService.getLastResult()
                .map(ResponseEntity::ok)
                .orElseGet(() -> {
                    // Run benchmark if not available
                    BenchmarkService.BenchmarkResult result = benchmarkService.runBenchmark();
                    return ResponseEntity.ok(result);
                });
    }
    
    /**
     * POST /api/benchmark/run
     * Trigger new benchmark run.
     */
    @PostMapping("/run")
    public ResponseEntity<BenchmarkService.BenchmarkResult> runBenchmark() {
        BenchmarkService.BenchmarkResult result = benchmarkService.runBenchmark();
        return ResponseEntity.ok(result);
    }
}
