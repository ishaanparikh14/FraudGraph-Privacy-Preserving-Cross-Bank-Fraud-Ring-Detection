#!/bin/bash

# Graph Engine Build Verification Script
# Verifies that all components are properly built and configured

set -e

echo "=========================================="
echo "Graph Engine Build Verification"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 (missing)"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/ (missing)"
        return 1
    fi
}

ERRORS=0

# Check project structure
echo "1. Checking project structure..."
check_file "pom.xml" || ((ERRORS++))
check_file "Dockerfile" || ((ERRORS++))
check_file "README.md" || ((ERRORS++))
check_dir "src/main/java" || ((ERRORS++))
check_dir "src/main/resources" || ((ERRORS++))
echo ""

# Check source files
echo "2. Checking core source files..."
check_file "src/main/java/com/fraudgraph/graphengine/GraphEngineApplication.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/graph/FraudGraph.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/graph/GraphNode.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/graph/GraphEdge.java" || ((ERRORS++))
echo ""

# Check algorithms
echo "3. Checking algorithm implementations..."
check_file "src/main/java/com/fraudgraph/graphengine/algorithm/TarjanSCC.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/algorithm/DFSCycleDetector.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/algorithm/PageRankCalculator.java" || ((ERRORS++))
echo ""

# Check services
echo "4. Checking service layer..."
check_file "src/main/java/com/fraudgraph/graphengine/service/FraudRingDetectionService.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/service/AlertService.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/benchmark/BenchmarkService.java" || ((ERRORS++))
echo ""

# Check controllers
echo "5. Checking REST controllers..."
check_file "src/main/java/com/fraudgraph/graphengine/controller/GraphController.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/controller/BenchmarkController.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/controller/HealthController.java" || ((ERRORS++))
echo ""

# Check Kafka integration
echo "6. Checking Kafka integration..."
check_file "src/main/java/com/fraudgraph/graphengine/kafka/TransactionConsumer.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/config/KafkaConsumerConfig.java" || ((ERRORS++))
echo ""

# Check DTOs
echo "7. Checking DTOs..."
check_file "src/main/java/com/fraudgraph/graphengine/dto/ScoredTransaction.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/dto/FraudRingResponse.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/dto/RingsListResponse.java" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/dto/FraudAlertRequest.java" || ((ERRORS++))
echo ""

# Check configuration
echo "8. Checking configuration..."
check_file "src/main/resources/application.yml" || ((ERRORS++))
check_file "src/main/java/com/fraudgraph/graphengine/config/GraphConfig.java" || ((ERRORS++))
echo ""

# Check documentation
echo "9. Checking documentation..."
check_file "README.md" || ((ERRORS++))
check_file "INTEGRATION.md" || ((ERRORS++))
check_file "TESTING.md" || ((ERRORS++))
check_file "DELIVERABLES.md" || ((ERRORS++))
check_file "QUICKSTART.md" || ((ERRORS++))
check_file "ARCHITECTURE.md" || ((ERRORS++))
echo ""

# Check test utilities
echo "10. Checking test utilities..."
check_file "test-data/fraud-ring-cycle.json" || ((ERRORS++))
check_file "test-data/complex-fraud-network.json" || ((ERRORS++))
check_file "scripts/send-test-data.sh" || ((ERRORS++))
check_file "postman/Graph-Engine-API.postman_collection.json" || ((ERRORS++))
echo ""

# Check Maven build
echo "11. Checking Maven configuration..."
if command -v mvn &> /dev/null; then
    echo -e "${GREEN}✓${NC} Maven is installed"
    
    echo "   Validating pom.xml..."
    if mvn validate &> /dev/null; then
        echo -e "${GREEN}✓${NC} pom.xml is valid"
    else
        echo -e "${RED}✗${NC} pom.xml validation failed"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}⚠${NC} Maven not found (optional for Docker build)"
fi
echo ""

# Check Docker
echo "12. Checking Docker configuration..."
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker is installed"
    
    if [ -f "Dockerfile" ]; then
        echo -e "${GREEN}✓${NC} Dockerfile exists"
    else
        echo -e "${RED}✗${NC} Dockerfile missing"
        ((ERRORS++))
    fi
else
    echo -e "${RED}✗${NC} Docker not found"
    ((ERRORS++))
fi
echo ""

# Summary
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Your Graph Engine module is complete and ready to:"
    echo "  - Build with Maven: mvn clean package"
    echo "  - Build with Docker: docker build -t graph-engine ."
    echo "  - Deploy with Docker Compose: docker-compose up -d"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    echo ""
    echo "Please fix the missing files/directories before building."
    echo ""
    exit 1
fi
