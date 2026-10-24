package `in`.satark.shield

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Presses every control of the floating bubble with real taps (UiAutomator can
 * see overlay windows, unlike `uiautomator dump`).
 *
 * Needs a debug build with permissions granted, and the test WAV pushed to
 * /sdcard/Android/data/in.satark.shield/files/en_0.wav (a scam call).
 */
@RunWith(AndroidJUnit4::class)
class OverlayBubbleTest {
    private val pkg = "in.satark.shield"
    private val timeout = 15_000L
    private lateinit var device: UiDevice

    private val bubble = By.desc("Satark floating controls")

    @Before
    fun setUp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        device.wakeUp()
        launchApp()
    }

    @After
    fun tearDown() {
        // Leave the app not listening.
        context().startService(Intent(context(), SatarkOverlayService::class.java).setAction(SatarkOverlayService.ACTION_STOP))
    }

    private fun context() = InstrumentationRegistry.getInstrumentation().targetContext

    private fun launchApp() {
        val intent = context().packageManager.getLaunchIntentForPackage(pkg)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context().startActivity(intent)
        device.wait(Until.hasObject(By.pkg(pkg).depth(0)), timeout)
        Thread.sleep(2500)
    }

    private fun feed(name: String) {
        val file = File(context().getExternalFilesDir(null), name)
        assertTrue("missing test audio $file", file.exists())
        context().startService(
            Intent(context(), SatarkOverlayService::class.java)
                .setAction(SatarkOverlayService.ACTION_DEBUG_FEED)
                .putExtra(SatarkOverlayService.EXTRA_WAV_PATH, file.path)
        )
    }

    private fun openPanel() {
        if (!device.hasObject(By.textContains("Open app"))) {
            device.wait(Until.findObject(bubble), 30_000)!!.click()
            assertNotNull("panel did not open", device.wait(Until.findObject(By.textContains("Open app")), timeout))
        }
    }

    @Test
    fun bubbleControlsWork() {
        // Hidden while Satark itself is on screen.
        assertFalse("bubble should be hidden over the Satark screen", device.wait(Until.hasObject(bubble), 3000))

        // Appears over other apps; tapping opens the panel.
        device.pressHome()
        assertNotNull("bubble should appear over other apps", device.wait(Until.findObject(bubble), timeout))
        openPanel()

        // Start listening from the bubble.
        device.findObject(By.textContains("Start listening")).click()
        assertNotNull("listening did not start", device.wait(Until.findObject(By.textContains("speak now")), 30_000))

        // Live text and the warning appear in the bubble.
        feed("en_0.wav")
        assertNotNull("warning did not appear", device.wait(Until.findObject(By.textContains("digital arrest")), 90_000))
        assertTrue("live text missing", device.hasObject(By.textContains("do not disconnect")))

        // Dismiss hides the warning card.
        device.findObject(By.text("Dismiss")).click()
        assertTrue("warning should be dismissed", device.wait(Until.gone(By.textContains("digital arrest")), timeout))

        // A new warning; "Details & nearby help" opens the app's warning page.
        feed("en_0.wav")
        val details = device.wait(Until.findObject(By.textContains("Details & nearby help")), 90_000)
        assertNotNull("warning did not come back", details)
        details.click()
        assertTrue("app did not open", device.wait(Until.hasObject(By.pkg(pkg).text("Scam warning")), timeout))

        // "Open app" brings Satark forward.
        device.pressHome()
        openPanel()
        device.findObject(By.textContains("Open app")).click()
        Thread.sleep(2000)
        assertEquals(pkg, device.currentPackageName)

        // "Stop" ends listening.
        device.pressHome()
        openPanel()
        device.findObject(By.textContains("Stop")).click()
        assertNotNull("listening did not stop", device.wait(Until.findObject(By.textContains("Not listening")), timeout))

        // The X minimises the panel back to the bubble.
        device.findObject(By.desc("Minimise")).click()
        assertTrue("panel should close", device.wait(Until.gone(By.textContains("Open app")), timeout))
        assertTrue("bubble should remain", device.hasObject(bubble))
    }
}
