FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/game-service.jar /app/game-service.jar
EXPOSE 8443
USER 10001
ENTRYPOINT ["java", "-jar", "/app/game-service.jar"]
