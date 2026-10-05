package demo

import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient

class ServiceBRelaysToGreetOnServiceCTest {

    @Test
    fun `service b relay calls the greet endpoint of service c`() {
        val restClientBuilder = RestClient.builder()
        val serviceC = MockRestServiceServer.bindTo(restClientBuilder).build()
        serviceC.expect(requestTo("http://service-c/greet")).andRespond(withSuccess("hi", MediaType.TEXT_PLAIN))

        assertEquals("hi", RelayController(restClientBuilder, "http://service-c").relay())
        serviceC.verify()
    }
}
