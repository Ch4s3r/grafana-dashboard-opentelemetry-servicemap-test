package demo

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.client.RestClient

@SpringBootApplication
@EnableScheduling
class ServiceAApplication

private const val CONFIG_CALLS_PER_TICK = 4

fun main(args: Array<String>) {
    runApplication<ServiceAApplication>(*args)
}

@RestController
class EntryPointCaller(
    restClientBuilder: RestClient.Builder,
    @Value("\${service-b.url}") serviceBUrl: String,
    @Value("\${service-d.url}") serviceDUrl: String,
) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val serviceB = RemoteServiceClient(restClientBuilder, serviceBUrl)
    private val serviceD = RemoteServiceClient(restClientBuilder, serviceDUrl)

    @GetMapping("/trigger")
    @Scheduled(fixedRate = 5000, initialDelay = 20000)
    fun callServiceBAndServiceD(): List<String> {
        val answers = listOf(serviceB.get("/relay")) + List(CONFIG_CALLS_PER_TICK) { serviceD.get("/config") } + serviceD.get("/status")
        logger.info("downstream answers: {}", answers)
        return answers
    }
}
