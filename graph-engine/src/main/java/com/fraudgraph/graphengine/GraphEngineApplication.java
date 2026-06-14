package com.fraudgraph.graphengine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableKafka
@EnableAsync
@EnableScheduling
public class GraphEngineApplication {

    public static void main(String[] args) {
        SpringApplication.run(GraphEngineApplication.class, args);
    }
}
