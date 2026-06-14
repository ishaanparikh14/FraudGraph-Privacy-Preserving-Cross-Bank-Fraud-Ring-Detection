#!/bin/bash
# Start both the Kafka scorer and the XAI FastAPI server concurrently

echo "Starting XAI API on port 8082..."
python xai_api.py &
XAI_PID=$!

echo "Starting Kafka scorer..."
python kafka_scorer.py &
SCORER_PID=$!

# Wait for either to exit
wait -n $XAI_PID $SCORER_PID
EXIT_CODE=$?

echo "A process exited with code $EXIT_CODE, shutting down..."
kill $XAI_PID $SCORER_PID 2>/dev/null
exit $EXIT_CODE
