package cz.betternotes.app

import kotlin.math.sqrt

/**
 * Online shlukování mluvčích v rámci jedné nahrávací relace.
 *
 * Uchovává jen L2-normalizované centroidy v paměti RAM a při `reset()` je
 * přepíše nulami. Žádné biometrické údaje se nikam neukládají ani neodesílají.
 */
internal class SpeakerTracker(
    private val matchThreshold: Float = 0.52f,
    private val shortFallbackThreshold: Float = 0.30f,
    private val minNewSpeakerSec: Float = 1.1f,
    private val maxSpeakers: Int = 8,
) {
    private data class Cluster(
        val id: Int,
        val centroid: FloatArray,
        var count: Int,
    )

    private val clusters = mutableListOf<Cluster>()
    private var lastSpeaker: Int? = null

    fun lastSpeakerOrNull(): Int? = lastSpeaker

    fun assign(rawEmbedding: FloatArray, durationSec: Float): Int? {
        val emb = normalize(rawEmbedding) ?: return lastSpeaker

        if (clusters.isEmpty()) {
            val id = 1
            clusters.add(Cluster(id = id, centroid = emb, count = 1))
            lastSpeaker = id
            return id
        }

        var bestIdx = -1
        var bestSim = -1f
        for (i in clusters.indices) {
            val sim = dot(clusters[i].centroid, emb)
            if (sim > bestSim) {
                bestSim = sim
                bestIdx = i
            }
        }

        if (bestIdx >= 0 && bestSim >= matchThreshold) {
            val c = clusters[bestIdx]
            updateCentroid(c, emb)
            lastSpeaker = c.id
            return c.id
        }

        // Nového mluvčího zakládáme jen z dostatečně dlouhé promluvy, aby
        // krátké „jo“, „hm“ nebo šum nevytvořily falešnou Osobu 3.
        if (durationSec >= minNewSpeakerSec && clusters.size < maxSpeakers) {
            val id = clusters.size + 1
            clusters.add(Cluster(id = id, centroid = emb, count = 1))
            lastSpeaker = id
            return id
        }

        val fallbackId = if (bestIdx >= 0 && bestSim >= shortFallbackThreshold) {
            clusters[bestIdx].id
        } else {
            lastSpeaker ?: clusters[0].id
        }
        lastSpeaker = fallbackId
        return fallbackId
    }

    fun reset() {
        for (c in clusters) {
            c.centroid.fill(0f)
        }
        clusters.clear()
        lastSpeaker = null
    }

    private fun updateCentroid(cluster: Cluster, emb: FloatArray) {
        // Omezená váha (max 20), aby se centroid dokázal mírně přizpůsobit
        // i při delší schůzce, ale nerozhodila ho jedna zašuměná věta.
        val weight = cluster.count.coerceAtMost(20).toFloat()
        val total = weight + 1f
        for (i in cluster.centroid.indices) {
            cluster.centroid[i] = (cluster.centroid[i] * weight + emb[i]) / total
        }
        normalizeInPlace(cluster.centroid)
        cluster.count += 1
    }

    private fun normalize(v: FloatArray): FloatArray? {
        val copy = v.copyOf()
        return if (normalizeInPlace(copy)) copy else null
    }

    private fun normalizeInPlace(v: FloatArray): Boolean {
        var sumSq = 0.0
        for (x in v) {
            if (!x.isFinite()) return false
            sumSq += x.toDouble() * x.toDouble()
        }
        val norm = sqrt(sumSq)
        if (norm < 1e-8) return false
        val inv = (1.0 / norm).toFloat()
        for (i in v.indices) {
            v[i] *= inv
        }
        return true
    }

    private fun dot(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size) return -1f
        var sum = 0.0
        for (i in a.indices) {
            sum += a[i].toDouble() * b[i].toDouble()
        }
        return sum.toFloat()
    }
}
