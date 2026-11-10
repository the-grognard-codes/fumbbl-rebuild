FROM eclipse-temurin:21.0.11_10-jdk-jammy@sha256:ea0e59a081c886d919b177b7006ac02fbdc64e8ab7cae724e2afd62de42d6892 AS build
# Native computer-policy regressions execute the shipped Node policy during the build.
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
ADD https://nodejs.org/dist/v26.12.0/node-v26.12.0-linux-x64.tar.gz /tmp/node.tar.gz
RUN echo 'd9f88af72ad34f7ddf8e67289829f1698f54b6254f7d4f54b7453117ff1a3d2c  /tmp/node.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/node.tar.gz -C /opt && /opt/node-v26.12.0-linux-x64/bin/node --version && rm /tmp/node.tar.gz
ADD https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip /tmp/maven.zip
RUN echo '8beac8d11ef208f1e2a8df0682b9448a9a363d2ad13ca74af43705549e72e74c9378823bf689287801cbbfc2f6ea9596201d19ccacfdfb682ee8a2ff4c4418ba  /tmp/maven.zip' | sha512sum -c - \
    && cd /opt && jar xf /tmp/maven.zip && chmod +x /opt/apache-maven-3.9.9/bin/mvn && rm /tmp/maven.zip
ENV PATH="/opt/node-v26.12.0-linux-x64/bin:/opt/apache-maven-3.9.9/bin:${PATH}"
WORKDIR /source
COPY . .
# Recovery tests include complete match histories and need a predictable test heap.
ARG MAVEN_FLAGS=""
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp -DargLine=-Xmx3g ${MAVEN_FLAGS} -pl ffb-server -am clean package
WORKDIR /out
RUN jar xf /source/ffb-server/target/ffb-server.zip && rm server.ini

FROM eclipse-temurin:21.0.11_10-jre-jammy@sha256:9af01c30e85b5a9b15fe249a84fb6dcb19e06ee84fbf23ea2d116b0e195c2ce9
LABEL org.opencontainers.image.version="3.4.0-r2.2"
WORKDIR /app
COPY --from=build /out/ /app/
RUN mkdir -p /data/backup /app/htdocs && chown -R 10001:10001 /data /app
USER 10001:10001
ENTRYPOINT ["java", "-Xms128m", "-Xmx768m", "-cp", "FantasyFootballServer.jar:lib/*", "com.fumbbl.ffb.server.local.LocalServerMain", "/config/server.ini"]
