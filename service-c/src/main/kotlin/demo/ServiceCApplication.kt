package demo

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@SpringBootApplication
class ServiceCApplication

fun main(args: Array<String>) {
    runApplication<ServiceCApplication>(*args)
}

@RestController
class GreetingController {
    private val logger = LoggerFactory.getLogger(javaClass)

    @GetMapping("/hello")
    fun hello(): String {
        logger.info("hello endpoint called")
        return "hello from service-c"
    }

    @GetMapping("/greet")
    fun greet(): String {
        logger.info("greet endpoint called")
        return "greetings from service-c"
    }
}
