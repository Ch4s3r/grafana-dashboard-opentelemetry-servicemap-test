plugins {
    `java-library`
}

val opentelemetryLogbackAppenderVersion = "2.28.0-alpha"

dependencies {
    api("org.springframework.boot:spring-boot-starter-web")
    api("org.springframework.boot:spring-boot-starter-actuator")
    api("org.springframework.boot:spring-boot-starter-opentelemetry")
    api("org.springframework.boot:spring-boot-starter-restclient")
    api("io.opentelemetry.instrumentation:opentelemetry-logback-appender-1.0:$opentelemetryLogbackAppenderVersion")
    api("org.jetbrains.kotlin:kotlin-stdlib")
    api("org.jetbrains.kotlin:kotlin-reflect")
    api("tools.jackson.module:jackson-module-kotlin")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
}
