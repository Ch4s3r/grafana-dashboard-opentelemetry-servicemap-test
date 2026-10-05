package demo

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.client.RestClient

@SpringBootApplication
class ServiceDApplication

fun main(args: Array<String>) {
    runApplication<ServiceDApplication>(*args)
}

@RestController
class ConfigAndStatusController(restClientBuilder: RestClient.Builder, @Value("\${service-c.url}") serviceCUrl: String) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val serviceC = RemoteServiceClient(restClientBuilder, serviceCUrl)

    @GetMapping("/config")
    fun config(): String {
        logger.info("config endpoint called, asking service-c for hello")
        return serviceC.get("/hello")
    }

    @GetMapping("/status")
    fun status(): String {
        logger.info("status endpoint called, asking service-c for hello")
        return serviceC.get("/hello")
    }
}
