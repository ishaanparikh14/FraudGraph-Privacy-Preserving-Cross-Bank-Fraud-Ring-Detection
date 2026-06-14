FROM eclipse-temurin:17-jdk AS build

WORKDIR /app

# Copy Maven files
COPY pom.xml .
COPY src ./src

# Build application
RUN apt-get update && apt-get install -y maven && \
    mvn clean package -DskipTests && \
    mv target/*.jar app.jar

# Runtime stage
FROM eclipse-temurin:17-jre

RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy JAR from build stage
COPY --from=build /app/app.jar .

# Aligned with Person 4 Vite proxy /person3-api → 8082
EXPOSE 8082

ENV SERVER_PORT=8082

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8082/api/health || exit 1

# Run application
ENTRYPOINT ["java", "-jar", "app.jar"]
