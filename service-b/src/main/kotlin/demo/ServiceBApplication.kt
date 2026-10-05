package demo

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.client.RestClient

@SpringBootApplication
class ServiceBApplication

fun main(args: Array<String>) {
    runApplication<ServiceBApplication>(*args)
}

@RestController
class RelayController(restClientBuilder: RestClient.Builder, @Value("\${service-c.url}") serviceCUrl: String) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val serviceC = RemoteServiceClient(restClientBuilder, serviceCUrl)

    @GetMapping("/relay")
    fun relay(): String {
        logger.info("relay endpoint called, asking service-c for greet")
        return serviceC.get("/greet")
    }
}
