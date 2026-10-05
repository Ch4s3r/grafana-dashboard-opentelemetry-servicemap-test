package demo

import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.method
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient

class ServiceACallsRelayConfigAndStatusTest {

    @Test
    fun `service a calls relay once, config four times and status once`() {
        val restClientBuilder = RestClient.builder()
        val downstream = MockRestServiceServer.bindTo(restClientBuilder).build()
        (listOf("http://service-b/relay") + List(4) { "http://service-d/config" } + "http://service-d/status").forEach { url ->
            downstream.expect(requestTo(url)).andExpect(method(HttpMethod.GET)).andRespond(withSuccess("ok", MediaType.TEXT_PLAIN))
        }

        val answers = EntryPointCaller(restClientBuilder, "http://service-b", "http://service-d").callServiceBAndServiceD()

        assertEquals(List(6) { "ok" }, answers)
        downstream.verify()
    }
}
