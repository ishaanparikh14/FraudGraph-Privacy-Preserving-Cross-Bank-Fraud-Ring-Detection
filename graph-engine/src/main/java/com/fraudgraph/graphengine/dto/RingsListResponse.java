package com.fraudgraph.graphengine.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

/**
 * Wrapper response for list of fraud rings.
 */
public class RingsListResponse {
    
    private List<FraudRingResponse> rings;
    
    @JsonProperty("generated_at")
    private Instant generatedAt;
    
    public RingsListResponse() {
        this.generatedAt = Instant.now();
    }
    
    public RingsListResponse(List<FraudRingResponse> rings) {
        this.rings = rings;
        this.generatedAt = Instant.now();
    }
    
    public List<FraudRingResponse> getRings() {
        return rings;
    }
    
    public void setRings(List<FraudRingResponse> rings) {
        this.rings = rings;
    }
    
    public Instant getGeneratedAt() {
        return generatedAt;
    }
    
    public void setGeneratedAt(Instant generatedAt) {
        this.generatedAt = generatedAt;
    }
}
