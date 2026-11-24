package cz.betternotes.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import ai.moravian.czechspeech.CzechSpeech
import ai.moravian.czechspeech.CzechSpeechModel
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractor
import com.k2fsa.sherpa.onnx.SpeakerEmbeddingExtractorConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

@CapacitorPlugin(
    name = "CzechVoice",
    permissions = [
        Permission(
            strings = [Manifest.permission.RECORD_AUDIO],
            alias = "microphone",
        ),
    ],
)
class CzechVoicePlugin : Plugin() {

    companion object {
        private const val TAG = "CzechVoice"
        private const val SAMPLE_RATE = 16000
        private const val VAD_WINDOW = 512 // 32 ms @ 16 kHz
        private const val QUIET_LIMIT_MS = 120_000L
        private const val MIN_SPEAKER_SAMPLES = 12_800 // 0.8 s

        // Malý Silero VAD (~643 KB) a jazykově nezávislý WeSpeaker (~26.5 MB).
        private const val VAD_FILE_NAME = "silero_vad.onnx"
        private const val VAD_URL =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
        private const val VAD_APPROX_BYTES = 643_854L

        private const val SPEAKER_FILE_NAME = "wespeaker_en_voxceleb_resnet34_LM.onnx"
        private const val SPEAKER_URL =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx"
        private const val SPEAKER_APPROX_BYTES = 26_530_550L

        private const val CZECHSPEECH_APPROX_BYTES = 474_000_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var downloadJob: Job? = null
    private var recordJob: Job? = null
    private var recognizeJob: Job? = null
    private val recording = AtomicBoolean(false)
    private val stopping = AtomicBoolean(false)
    private val utteranceCounter = AtomicInteger(0)

    private var speechInstance: CzechSpeech? = null
    private val speakerTracker = SpeakerTracker()

    private fun modelsDir(ctx: Context): File =
        File(ctx.noBackupFilesDir, "czechspeech").apply { mkdirs() }

    private fun vadFile(ctx: Context): File = File(modelsDir(ctx), VAD_FILE_NAME)
    private fun speakerFile(ctx: Context): File = File(modelsDir(ctx), SPEAKER_FILE_NAME)

    private fun is64BitArm(): Boolean =
        Build.SUPPORTED_64_BIT_ABIS.any { it == "arm64-v8a" }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ctx = context
        val csReady = runCatching { CzechSpeechModel.isDownloaded(ctx) }.getOrDefault(false)
        val vadReady = vadFile(ctx).let { it.exists() && it.length() > 100_000L }
        val spReady = speakerFile(ctx).let { it.exists() && it.length() > 5_000_000L }

        val res = JSObject().apply {
            put("available", is64BitArm())
            put("czechSpeechDownloaded", csReady)
            put("vadDownloaded", vadReady)
            put("speakerDownloaded", spReady)
            put("ready", is64BitArm() && csReady && vadReady)
            put("diarizationReady", is64BitArm() && csReady && vadReady && spReady)
            put("downloading", downloadJob?.isActive == true)
            put("totalBytes", CZECHSPEECH_APPROX_BYTES + VAD_APPROX_BYTES + SPEAKER_APPROX_BYTES)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun downloadModels(call: PluginCall) {
        if (!is64BitArm()) {
            call.reject("Offline český model vyžaduje 64bitový Android (arm64-v8a).")
            return
        }
        if (downloadJob?.isActive == true) {
            call.reject("Stahování už běží.")
            return
        }

        val ctx = context.applicationContext
        val totalAll = CZECHSPEECH_APPROX_BYTES + VAD_APPROX_BYTES + SPEAKER_APPROX_BYTES

        downloadJob = scope.launch(Dispatchers.IO) {
            try {
                // 1. CzechSpeech model (~474 MB)
                emitProgress("czechspeech", 0L, totalAll)
                var csSize = CZECHSPEECH_APPROX_BYTES
                CzechSpeechModel.download(ctx) { done, total ->
                    if (total > 0) csSize = total
                    val overallTotal = csSize + VAD_APPROX_BYTES + SPEAKER_APPROX_BYTES
                    emitProgress("czechspeech", done, overallTotal)
                }

                // 2. Silero VAD (~643 KB)
                val vadTarget = vadFile(ctx)
                if (!vadTarget.exists() || vadTarget.length() < 100_000L) {
                    downloadFileResumable(VAD_URL, vadTarget) { done, total ->
                        val overallTotal = csSize + (if (total > 0) total else VAD_APPROX_BYTES) + SPEAKER_APPROX_BYTES
                        emitProgress("vad", csSize + done, overallTotal)
                    }
                }

                // 3. WeSpeaker model (~26.5 MB)
                val spTarget = speakerFile(ctx)
                if (!spTarget.exists() || spTarget.length() < 5_000_000L) {
                    downloadFileResumable(SPEAKER_URL, spTarget) { done, total ->
                        val vadLen = vadTarget.length().coerceAtLeast(VAD_APPROX_BYTES)
                        val overallTotal = csSize + vadLen + (if (total > 0) total else SPEAKER_APPROX_BYTES)
                        emitProgress("speaker", csSize + vadLen + done, overallTotal)
                    }
                }

                emitProgress("done", totalAll, totalAll)
                call.resolve(JSObject().put("ok", true))
            } catch (e: CancellationException) {
                call.reject("Stahování bylo zrušeno.")
            } catch (e: Exception) {
                Log.e(TAG, "Download failed", e)
                call.reject(e.message ?: "Stahování modelu selhalo.")
            }
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        downloadJob?.cancel()
        downloadJob = null
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun deleteModels(call: PluginCall) {
        if (recording.get()) {
            call.reject("Během diktování nejde modely smazat.")
            return
        }
        val ctx = context.applicationContext
        scope.launch(Dispatchers.IO) {
            runCatching { speechInstance?.close() }
            speechInstance = null
            runCatching { CzechSpeechModel.delete(ctx) }
            runCatching { vadFile(ctx).delete() }
            runCatching { speakerFile(ctx).delete() }
            // Smaž i případné nedostažené .part soubory.
            modelsDir(ctx).listFiles()?.filter { it.name.endsWith(".part") }?.forEach { it.delete() }
            call.resolve(JSObject().put("ok", true))
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (!is64BitArm()) {
            call.reject("Offline český model vyžaduje 64bitový Android (arm64-v8a).", "unavailable")
            return
        }

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermissionCallback")
            return
        }

        startInternal(call)
    }

    @PermissionCallback
    private fun micPermissionCallback(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject(
                "Povol mikrofon v Nastavení telefonu → Aplikace → BetterNotes → Oprávnění → Mikrofon.",
                "denied",
            )
            return
        }
        startInternal(call)
    }

    @SuppressLint("MissingPermission")
    private fun startInternal(call: PluginCall) {
        if (recording.get()) {
            call.resolve(JSObject().put("ok", true))
            return
        }

        val ctx = context.applicationContext
        if (!CzechSpeechModel.isDownloaded(ctx) || !vadFile(ctx).exists()) {
            call.reject("Offline model ještě není stažený.", "model_missing")
            return
        }

        val diarize = call.getBoolean("diarize", true) == true && speakerFile(ctx).exists()

        val modelFile = CzechSpeechModel.file(ctx)
        if (!modelFile.exists()) {
            call.reject("Soubor modelu CzechSpeech nebyl nalezen.", "model_missing")
            return
        }

        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuf <= 0) {
            call.reject("Nepodařilo se otevřít mikrofon.", "error")
            return
        }

        val bufferSize = (minBuf * 4).coerceAtLeast(SAMPLE_RATE * 2) // min 1 s
        val audioRecord = createAudioRecord(bufferSize)
        if (audioRecord == null || audioRecord.state != AudioRecord.STATE_INITIALIZED) {
            audioRecord?.release()
            call.reject("Mikrofon není dostupný (možná ho používá jiná aplikace).", "error")
            return
        }

        val vad = try {
            Vad(
                assetManager = null,
                config = VadModelConfig(
                    sileroVadModelConfig = SileroVadModelConfig(
                        model = vadFile(ctx).absolutePath,
                        threshold = 0.5f,
                        minSilenceDuration = 0.65f,
                        minSpeechDuration = 0.35f,
                        windowSize = VAD_WINDOW,
                        maxSpeechDuration = 20.0f,
                    ),
                    sampleRate = SAMPLE_RATE,
                    numThreads = 1,
                    provider = "cpu",
                    debug = false,
                ),
            )
        } catch (e: Exception) {
            audioRecord.release()
            call.reject("Nepodařilo se spustit detektor řeči: ${e.message}", "error")
            return
        }

        val extractor: SpeakerEmbeddingExtractor? = if (diarize) {
            runCatching {
                SpeakerEmbeddingExtractor(
                    assetManager = null,
                    config = SpeakerEmbeddingExtractorConfig(
                        model = speakerFile(ctx).absolutePath,
                        numThreads = 2,
                        debug = false,
                        provider = "cpu",
                    ),
                )
            }.onFailure { Log.w(TAG, "Speaker extractor init failed, continuing without diarization", it) }
                .getOrNull()
        } else {
            null
        }

        val speech = speechInstance ?: CzechSpeech(ctx, modelFile, keepModelLoaded = true).also {
            speechInstance = it
        }

        speakerTracker.reset()
        utteranceCounter.set(0)
        stopping.set(false)
        recording.set(true)

        val segmentQueue = Channel<FloatArray>(capacity = 16)

        // Rozpoznávací korutina: bere hotové promluvy z VAD, přepíše je CzechSpeech
        // a spočítá mluvčího přes WeSpeaker.
        recognizeJob = scope.launch(Dispatchers.Default) {
            try {
                for (samples in segmentQueue) {
                    try {
                        emitState("recognizing")
                        val rawText = speech.transcribe(samples).trim()
                        if (rawText.isNotEmpty()) {
                            val speakerId = identifySpeaker(extractor, samples)
                            val id = utteranceCounter.incrementAndGet()
                            val payload = JSObject().apply {
                                put("id", id)
                                put("text", rawText)
                                if (speakerId != null) {
                                    put("speaker", speakerId)
                                } else {
                                    put("speaker", JSObject.NULL)
                                }
                            }
                            notifyListeners("utterance", payload)
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Log.e(TAG, "Utterance recognition failed", e)
                    } finally {
                        samples.fill(0f)
                        if (recording.get() && !stopping.get()) {
                            emitState("listening")
                        }
                    }
                }
            } finally {
                runCatching { extractor?.release() }
                speakerTracker.reset()
                runCatching { speech.releaseModel() }
            }
        }

        // Nahrávací korutina: čte 16 kHz PCM16, krmí Silero VAD a posílá celé promluvy.
        recordJob = scope.launch(Dispatchers.IO) {
            val pcmBuf = ShortArray(VAD_WINDOW)
            val floatBuf = FloatArray(VAD_WINDOW)
            var lastHeardAt = System.currentTimeMillis()
            var wasSpeaking = false
            var endReason: String? = null
            var endMessage: String? = null

            try {
                audioRecord.startRecording()
                emitState("listening")

                while (isActive && recording.get() && !stopping.get()) {
                    val read = audioRecord.read(pcmBuf, 0, pcmBuf.size)
                    if (read <= 0) {
                        if (read < 0) {
                            endReason = "error"
                            endMessage = "Čtení z mikrofonu selhalo."
                            break
                        }
                        continue
                    }

                    val samples = if (read == floatBuf.size) floatBuf else FloatArray(read)
                    for (i in 0 until read) {
                        samples[i] = pcmBuf[i] / 32768.0f
                    }

                    vad.acceptWaveform(samples)
                    val speakingNow = vad.isSpeechDetected()
                    if (speakingNow) {
                        lastHeardAt = System.currentTimeMillis()
                    }
                    if (speakingNow != wasSpeaking) {
                        wasSpeaking = speakingNow
                        emitState(if (speakingNow) "speaking" else "listening")
                    }

                    while (!vad.empty()) {
                        val seg = vad.front()
                        vad.pop()
                        lastHeardAt = System.currentTimeMillis()
                        if (seg.samples.isNotEmpty()) {
                            // Pokud je fronta plná (pomalý telefon), neblokuj AudioRecord.
                            segmentQueue.trySend(seg.samples)
                        }
                    }

                    if (System.currentTimeMillis() - lastHeardAt > QUIET_LIMIT_MS) {
                        endReason = "quiet"
                        endMessage = "Po dvou minutách ticha se mikrofon vypnul."
                        break
                    }
                }
            } catch (e: CancellationException) {
                // normální stop
            } catch (e: Exception) {
                Log.e(TAG, "AudioRecord loop failed", e)
                endReason = "error"
                endMessage = e.message ?: "Chyba mikrofonu."
            } finally {
                runCatching { audioRecord.stop() }
                runCatching { audioRecord.release() }

                // Dopracovat rozmluvenou větu při běžném ukončení.
                runCatching {
                    vad.flush()
                    while (!vad.empty()) {
                        val seg = vad.front()
                        vad.pop()
                        if (seg.samples.isNotEmpty()) {
                            segmentQueue.trySend(seg.samples)
                        }
                    }
                }
                runCatching { vad.release() }
                segmentQueue.close()

                // Počkáme na dokončení poslední promluvy (max 15 s), pak uzavřeme relaci.
                withTimeoutOrNull(15_000L) {
                    recognizeJob?.join()
                }
                recording.set(false)
                stopping.set(false)

                val endObj = JSObject()
                if (endReason != null) endObj.put("reason", endReason)
                if (endMessage != null) endObj.put("message", endMessage)
                notifyListeners("end", endObj)
            }
        }

        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        if (!recording.get()) {
            call.resolve(JSObject().put("ok", true))
            return
        }
        stopping.set(true)
        call.resolve(JSObject().put("ok", true))
    }

    override fun handleOnDestroy() {
        stopping.set(true)
        recording.set(false)
        downloadJob?.cancel()
        recordJob?.cancel()
        recognizeJob?.cancel()
        runCatching { speechInstance?.close() }
        speechInstance = null
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun identifySpeaker(extractor: SpeakerEmbeddingExtractor?, samples: FloatArray): Int? {
        if (extractor == null) return null
        if (samples.size < MIN_SPEAKER_SAMPLES) {
            return speakerTracker.lastSpeakerOrNull()
        }
        val stream = extractor.createStream()
        return try {
            stream.acceptWaveform(samples, SAMPLE_RATE)
            stream.inputFinished()
            if (!extractor.isReady(stream)) {
                speakerTracker.lastSpeakerOrNull()
            } else {
                val embedding = extractor.compute(stream)
                val durationSec = samples.size.toFloat() / SAMPLE_RATE.toFloat()
                speakerTracker.assign(embedding, durationSec)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Speaker embedding failed", e)
            speakerTracker.lastSpeakerOrNull()
        } finally {
            stream.release()
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(bufferSize: Int): AudioRecord? {
        val sources = intArrayOf(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC,
        )
        for (src in sources) {
            val ar = runCatching {
                AudioRecord(
                    src,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize,
                )
            }.getOrNull()
            if (ar != null && ar.state == AudioRecord.STATE_INITIALIZED) return ar
            ar?.release()
        }
        return null
    }

    private fun emitState(state: String) {
        notifyListeners("state", JSObject().put("state", state))
    }

    private fun emitProgress(stage: String, done: Long, total: Long) {
        val pct = if (total > 0) ((done * 100L) / total).toInt().coerceIn(0, 100) else 0
        val data = JSObject().apply {
            put("stage", stage)
            put("doneBytes", done)
            put("totalBytes", total)
            put("percent", pct)
        }
        notifyListeners("downloadProgress", data)
    }

    private fun downloadFileResumable(
        urlStr: String,
        target: File,
        onProgress: (Long, Long) -> Unit,
    ) {
        val part = File(target.parentFile, "${target.name}.part")
        val existing = if (part.exists()) part.length() else 0L

        var currentUrl = urlStr
        var redirects = 0
        var conn: HttpURLConnection
        while (true) {
            conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15_000
                readTimeout = 30_000
                if (existing > 0L) {
                    setRequestProperty("Range", "bytes=$existing-")
                }
            }
            val code = conn.responseCode
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location")
                    ?: throw IllegalStateException("Chybí Location při přesměrování.")
                if (!loc.startsWith("https://")) {
                    throw IllegalStateException("Přesměrování mimo HTTPS není povoleno.")
                }
                conn.disconnect()
                currentUrl = loc
                if (++redirects > 6) throw IllegalStateException("Příliš mnoho přesměrování.")
                continue
            }
            break
        }

        try {
            val code = conn.responseCode
            val resume = code == HttpURLConnection.HTTP_PARTIAL && existing > 0L
            if (code != HttpURLConnection.HTTP_OK && !resume) {
                throw IllegalStateException("HTTP $code při stahování ${target.name}")
            }
            val contentLength = conn.contentLengthLong
            val total = if (resume && contentLength > 0) existing + contentLength else contentLength
            var done = if (resume) existing else 0L

            conn.inputStream.use { input ->
                FileOutputStream(part, resume).use { output ->
                    val buf = ByteArray(64 * 1024)
                    var lastEmit = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                        done += n
                        val now = System.currentTimeMillis()
                        if (now - lastEmit >= 120L) {
                            lastEmit = now
                            onProgress(done, total)
                        }
                    }
                }
            }
            onProgress(done, total)
            if (target.exists()) target.delete()
            if (!part.renameTo(target)) {
                throw IllegalStateException("Nepodařilo se uložit ${target.name}")
            }
        } finally {
            conn.disconnect()
        }
    }
}
