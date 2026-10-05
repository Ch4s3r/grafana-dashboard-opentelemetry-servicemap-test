package demo

import org.springframework.web.client.RestClient
import org.springframework.web.client.body

class RemoteServiceClient(restClientBuilder: RestClient.Builder, baseUrl: String) {
    private val restClient = restClientBuilder.baseUrl(baseUrl).build()

    fun get(path: String): String = restClient.get().uri(path).retrieve().body<String>().orEmpty()
}
