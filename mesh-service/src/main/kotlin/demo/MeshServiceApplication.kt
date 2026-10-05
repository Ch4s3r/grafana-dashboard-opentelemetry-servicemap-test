package demo

import jakarta.servlet.http.HttpServletRequest
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpMethod
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.SchedulingConfigurer
import org.springframework.scheduling.config.IntervalTask
import org.springframework.scheduling.config.ScheduledTaskRegistrar
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.ResponseBody
import org.springframework.web.client.RestClient
import org.springframework.web.servlet.HandlerMapping
import org.springframework.web.servlet.mvc.method.RequestMappingInfo
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
class MeshServiceApplication

fun main(args: Array<String>) {
    runApplication<MeshServiceApplication>(*args)
}

@ConfigurationProperties("mesh")
data class MeshProperties(
    val serviceUrlTemplate: String = "http://%s:8080",
    val routes: List<Route> = emptyList(),
    val entrypoints: List<Entrypoint> = emptyList(),
) {
    data class Call(val service: String, val path: String, val times: Int = 1)
    data class Route(val path: String, val calls: List<Call> = emptyList())
    data class Entrypoint(val service: String, val path: String, val everyMillis: Long = 5000, val times: Int = 1)

    fun urlOf(service: String): String = serviceUrlTemplate.format(service)
}

@Component
class MeshCaller(private val properties: MeshProperties, private val restClientBuilder: RestClient.Builder) {
    private val clients = ConcurrentHashMap<String, RemoteServiceClient>()
    private val logger = LoggerFactory.getLogger(javaClass)

    fun call(service: String, path: String, times: Int) {
        val client = clients.computeIfAbsent(service) { RemoteServiceClient(restClientBuilder, properties.urlOf(service)) }
        repeat(times) {
            runCatching { client.get(path) }.onFailure { logger.warn("call to {}{} failed: {}", service, path, it.message) }
        }
    }
}

@Component
class MeshRouteHandler(private val properties: MeshProperties, private val caller: MeshCaller) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @ResponseBody
    fun handle(request: HttpServletRequest): String {
        val routePath = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as String
        val route = properties.routes.first { it.path == routePath }
        logger.info("{} called, fanning out to {} downstream calls", routePath, route.calls.sumOf { it.times })
        route.calls.forEach { caller.call(it.service, it.path, it.times) }
        return "ok"
    }
}

@Component
class MeshRouteRegistrar(
    private val properties: MeshProperties,
    private val handler: MeshRouteHandler,
    @Qualifier("requestMappingHandlerMapping") private val handlerMapping: RequestMappingHandlerMapping,
) : InitializingBean {
    override fun afterPropertiesSet() {
        val handleMethod = MeshRouteHandler::class.java.getMethod("handle", HttpServletRequest::class.java)
        properties.routes.forEach { route ->
            handlerMapping.registerMapping(
                RequestMappingInfo.paths(route.path).methods(org.springframework.web.bind.annotation.RequestMethod.GET).build(),
                handler,
                handleMethod,
            )
        }
    }
}

@Component
class MeshEntrypointScheduler(private val properties: MeshProperties, private val caller: MeshCaller) : SchedulingConfigurer {
    override fun configureTasks(registrar: ScheduledTaskRegistrar) {
        properties.entrypoints.forEach { entrypoint ->
            registrar.addFixedRateTask(
                IntervalTask(
                    { caller.call(entrypoint.service, entrypoint.path, entrypoint.times) },
                    Duration.ofMillis(entrypoint.everyMillis),
                    Duration.ofSeconds(25),
                )
            )
        }
    }
}
