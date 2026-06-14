#!/bin/bash

# Script to send test fraud ring data to Kafka
# Usage: ./send-test-data.sh [simple|complex]

set -e

KAFKA_CONTAINER="fraudgraph-kafka-1"
TOPIC="transactions.scored"
BOOTSTRAP_SERVER="localhost:9092"

# Check if Kafka container is running
if ! docker ps | grep -q $KAFKA_CONTAINER; then
    echo "Error: Kafka container '$KAFKA_CONTAINER' is not running"
    echo "Start services with: docker-compose up -d"
    exit 1
fi

# Determine which test data to send
TEST_TYPE=${1:-simple}

if [ "$TEST_TYPE" = "simple" ]; then
    echo "Sending simple fraud ring (3 nodes)..."
    TEST_FILE="test-data/fraud-ring-cycle.json"
elif [ "$TEST_TYPE" = "complex" ]; then
    echo "Sending complex fraud network (3 rings)..."
    TEST_FILE="test-data/complex-fraud-network.json"
else
    echo "Usage: $0 [simple|complex]"
    exit 1
fi

# Check if test file exists
if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file '$TEST_FILE' not found"
    exit 1
fi

# Send each transaction to Kafka
echo "Sending transactions to topic '$TOPIC'..."
cat $TEST_FILE | jq -c '.[]' | while read -r transaction; do
    echo "$transaction" | docker exec -i $KAFKA_CONTAINER \
        kafka-console-producer \
        --bootstrap-server $BOOTSTRAP_SERVER \
        --topic $TOPIC
    
    echo "Sent: $(echo $transaction | jq -r '.txn_id')"
    sleep 0.5
done

echo ""
echo "✓ All transactions sent successfully!"
echo ""
echo "Check fraud rings:"
echo "  curl http://localhost:8081/api/graph/rings | jq"
echo ""
echo "Check graph statistics:"
echo "  curl http://localhost:8081/api/graph/statistics | jq"
echo ""
echo "Check logs:"
echo "  docker logs graph-engine | tail -20"
