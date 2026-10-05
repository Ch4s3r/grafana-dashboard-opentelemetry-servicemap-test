package demo

import jakarta.servlet.http.HttpServletRequest
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import org.springframework.web.servlet.HandlerMapping

class MeshRouteFansOutToItsConfiguredCallsTest {

    @Test
    fun `payments route places two ledger holds and one clearing submission`() {
        val properties = MeshProperties(
            serviceUrlTemplate = "http://%s",
            routes = listOf(
                MeshProperties.Route(
                    "/payments",
                    listOf(
                        MeshProperties.Call("ledger-service", "/ledger/holds", times = 2),
                        MeshProperties.Call("clearing-service", "/clearing/submit"),
                    ),
                ),
            ),
        )
        val restClientBuilder = RestClient.builder()
        val downstream = MockRestServiceServer.bindTo(restClientBuilder).build()
        repeat(2) { downstream.expect(requestTo("http://ledger-service/ledger/holds")).andRespond(withSuccess("ok", MediaType.TEXT_PLAIN)) }
        downstream.expect(requestTo("http://clearing-service/clearing/submit")).andRespond(withSuccess("ok", MediaType.TEXT_PLAIN))
        val handler = MeshRouteHandler(properties, MeshCaller(properties, restClientBuilder))
        val inboundRequest: HttpServletRequest = MockHttpServletRequest().apply {
            setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/payments")
        }

        assertEquals("ok", handler.handle(inboundRequest))
        downstream.verify()
    }
}
