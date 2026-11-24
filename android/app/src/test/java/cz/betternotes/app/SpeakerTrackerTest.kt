package cz.betternotes.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpeakerTrackerTest {

    @Test
    fun assignsSameSpeakerForSimilarEmbeddingsAndNewForDifferent() {
        val tracker = SpeakerTracker()
        val personA1 = floatArrayOf(1f, 0f, 0f, 0f)
        val personA2 = floatArrayOf(0.95f, 0.2f, 0f, 0f)
        val personB1 = floatArrayOf(0f, 1f, 0f, 0f)
        val personB2 = floatArrayOf(0.1f, 0.98f, 0f, 0f)

        assertEquals(1, tracker.assign(personA1, 2.0f))
        assertEquals(1, tracker.assign(personA2, 1.5f))
        assertEquals(2, tracker.assign(personB1, 2.2f))
        assertEquals(2, tracker.assign(personB2, 1.8f))
        assertEquals(1, tracker.assign(personA1, 1.2f))
    }

    @Test
    fun shortUtteranceDoesNotSpawnFalseNewSpeaker() {
        val tracker = SpeakerTracker()
        val personA = floatArrayOf(1f, 0f, 0f, 0f)
        val noisyShort = floatArrayOf(0f, 0f, 1f, 0f)

        assertEquals(1, tracker.assign(personA, 2.0f))
        // Krátká promluva (< 1.1 s) nesmí založit Osobu 2
        assertEquals(1, tracker.assign(noisyShort, 0.9f))
    }

    @Test
    fun resetClearsState() {
        val tracker = SpeakerTracker()
        assertEquals(1, tracker.assign(floatArrayOf(1f, 0f), 2.0f))
        tracker.reset()
        assertNull(tracker.lastSpeakerOrNull())
        assertEquals(1, tracker.assign(floatArrayOf(0f, 1f), 2.0f))
    }
}
