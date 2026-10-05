package demo

import io.micrometer.common.KeyValue
import io.micrometer.observation.Observation
import io.micrometer.observation.ObservationFilter
import org.springframework.http.client.observation.ClientRequestObservationContext
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import org.springframework.web.servlet.HandlerMapping

@Component
class CallerUriObservationFilter : ObservationFilter {
    override fun map(context: Observation.Context): Observation.Context {
        if (context is ClientRequestObservationContext) {
            inboundRoute()?.let { context.addLowCardinalityKeyValue(KeyValue.of(CALLER_URI_KEY, it)) }
        }
        return context
    }

    private fun inboundRoute(): String? =
        (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)
            ?.request
            ?.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) as? String

    companion object {
        const val CALLER_URI_KEY = "caller.uri"
    }
}
