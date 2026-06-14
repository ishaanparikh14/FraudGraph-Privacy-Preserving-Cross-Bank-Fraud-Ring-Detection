package com.fraudgraph.graphengine.config;

import com.fraudgraph.graphengine.graph.FraudGraph;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration for graph singleton.
 */
@Configuration
public class GraphConfig {
    
    /**
     * Create singleton FraudGraph instance.
     * Shared across all services for in-memory graph storage.
     */
    @Bean
    public FraudGraph fraudGraph() {
        return new FraudGraph();
    }
}
