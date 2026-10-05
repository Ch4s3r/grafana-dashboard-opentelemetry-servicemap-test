plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":common"))
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
}

tasks.bootBuildImage {
    imageName.set("servicemap/service-d")
    environment.put("BP_JVM_VERSION", "25")
}
