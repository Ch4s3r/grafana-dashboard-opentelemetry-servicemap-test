package demo

import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient

class ServiceDCallsHelloOnServiceCTest {

    @Test
    fun `service d config calls the hello endpoint of service c`() {
        val restClientBuilder = RestClient.builder()
        val serviceC = MockRestServiceServer.bindTo(restClientBuilder).build()
        serviceC.expect(requestTo("http://service-c/hello")).andRespond(withSuccess("hi", MediaType.TEXT_PLAIN))

        assertEquals("hi", ConfigAndStatusController(restClientBuilder, "http://service-c").config())
        serviceC.verify()
    }

    @Test
    fun `service d status calls the hello endpoint of service c`() {
        val restClientBuilder = RestClient.builder()
        val serviceC = MockRestServiceServer.bindTo(restClientBuilder).build()
        serviceC.expect(requestTo("http://service-c/hello")).andRespond(withSuccess("hi", MediaType.TEXT_PLAIN))

        assertEquals("hi", ConfigAndStatusController(restClientBuilder, "http://service-c").status())
        serviceC.verify()
    }
}
