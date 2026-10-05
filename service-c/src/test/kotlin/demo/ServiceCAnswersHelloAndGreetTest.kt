package demo

import kotlin.test.Test
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class ServiceCAnswersHelloAndGreetTest {
    private val mockMvc = MockMvcBuilders.standaloneSetup(GreetingController()).build()

    @Test
    fun `service c answers the hello endpoint`() {
        mockMvc.perform(get("/hello"))
            .andExpect(status().isOk)
            .andExpect(content().string("hello from service-c"))
    }

    @Test
    fun `service c answers the greet endpoint`() {
        mockMvc.perform(get("/greet"))
            .andExpect(status().isOk)
            .andExpect(content().string("greetings from service-c"))
    }
}
