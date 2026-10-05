FROM eclipse-temurin:27-jdk AS build
COPY --from=maven:3-eclipse-temurin-25 /usr/share/maven /opt/maven
ENV PATH="/opt/maven/bin:${PATH}"
WORKDIR /workspace
COPY pom.xml .
COPY common/pom.xml common/pom.xml
COPY service-d/pom.xml service-d/pom.xml
COPY mesh-service/pom.xml mesh-service/pom.xml
COPY service-a/pom.xml service-a/pom.xml
COPY service-b/pom.xml service-b/pom.xml
COPY service-c/pom.xml service-c/pom.xml
COPY service-a/src service-a/src
COPY service-b/src service-b/src
COPY service-c/src service-c/src
COPY service-d/src service-d/src
COPY mesh-service/src mesh-service/src
COPY common/src common/src
ARG SERVICE
RUN mvn -q -B -pl ${SERVICE} -am package -DskipTests

FROM eclipse-temurin:27-jre
ARG SERVICE
COPY --from=build /workspace/${SERVICE}/target/${SERVICE}-1.0.0.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
