FROM maven:3.8.8-eclipse-temurin-8 AS build
WORKDIR /app
COPY pom.xml .
COPY src/main ./src/main
RUN mvn -q -DskipTests package

FROM eclipse-temurin:8-jre
WORKDIR /app
COPY --from=build /app/target/fraudgraph-ingestion-0.1.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
