package demo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.springframework.http.HttpMethod
import org.springframework.http.client.observation.ClientRequestObservationContext
import org.springframework.mock.http.client.MockClientHttpRequest
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import org.springframework.web.servlet.HandlerMapping

class ClientCallRecordsTheInboundRouteOfItsCallerTest {
    private val filter = CallerUriObservationFilter()
    private val clientCall = ClientRequestObservationContext(MockClientHttpRequest(HttpMethod.GET, "http://service-c/hello"))

    @Test
    fun `client call made while serving config records config as caller uri`() {
        val inboundRequest = MockHttpServletRequest()
        inboundRequest.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/config")
        RequestContextHolder.setRequestAttributes(ServletRequestAttributes(inboundRequest))

        filter.map(clientCall)
        RequestContextHolder.resetRequestAttributes()

        assertEquals("/config", callerUri()?.value)
    }

    @Test
    fun `client call made outside any inbound request records no caller uri`() {
        RequestContextHolder.resetRequestAttributes()

        filter.map(clientCall)

        assertNull(callerUri())
    }

    private fun callerUri() = clientCall.lowCardinalityKeyValues
        .firstOrNull { it.key == CallerUriObservationFilter.CALLER_URI_KEY }
}
