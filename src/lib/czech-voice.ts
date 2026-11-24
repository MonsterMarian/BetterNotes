/**
 * Most k nativnímu Android pluginu `CzechVoice` (CzechSpeech + Silero VAD +
 * WeSpeaker pro rozlišování mluvčích).
 *
 * Mimo nativní Android (nebo ve starší APK bez tohoto pluginu) bezpečně hlásí
 * `available: false`, takže aplikace plynule spadne na systémový rozpoznávač.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNative } from "./native";

export interface CzechVoiceStatus {
  available: boolean;
  czechSpeechDownloaded: boolean;
  vadDownloaded: boolean;
  speakerDownloaded: boolean;
  ready: boolean;
  diarizationReady: boolean;
  downloading: boolean;
  totalBytes: number;
}

export interface CzechVoiceProgressEvent {
  stage: "czechspeech" | "vad" | "speaker" | "done";
  doneBytes: number;
  totalBytes: number;
  percent: number;
}

export interface CzechVoiceUtteranceEvent {
  id: number;
  text: string;
  speaker: number | null;
}

export interface CzechVoiceStateEvent {
  state: "listening" | "speaking" | "recognizing";
}

export interface CzechVoiceEndEvent {
  reason?: "quiet" | "error";
  message?: string;
}

interface CzechVoiceNativePlugin {
  getStatus(): Promise<CzechVoiceStatus>;
  downloadModels(): Promise<{ ok: boolean }>;
  cancelDownload(): Promise<{ ok: boolean }>;
  deleteModels(): Promise<{ ok: boolean }>;
  start(options: { diarize: boolean }): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
  addListener(
    eventName: "downloadProgress",
    listener: (data: CzechVoiceProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "utterance",
    listener: (data: CzechVoiceUtteranceEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "state",
    listener: (data: CzechVoiceStateEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "end",
    listener: (data: CzechVoiceEndEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const CzechVoice = registerPlugin<CzechVoiceNativePlugin>("CzechVoice");

const UNAVAILABLE_STATUS: CzechVoiceStatus = {
  available: false,
  czechSpeechDownloaded: false,
  vadDownloaded: false,
  speakerDownloaded: false,
  ready: false,
  diarizationReady: false,
  downloading: false,
  totalBytes: 0,
};

export function hasCzechVoicePlugin(): boolean {
  return isNative() && Capacitor.isPluginAvailable("CzechVoice");
}

export async function getCzechVoiceStatus(): Promise<CzechVoiceStatus> {
  if (!hasCzechVoicePlugin()) return UNAVAILABLE_STATUS;
  try {
    return await CzechVoice.getStatus();
  } catch {
    return UNAVAILABLE_STATUS;
  }
}

export async function downloadCzechVoiceModels(
  onProgress?: (ev: CzechVoiceProgressEvent) => void,
): Promise<void> {
  let handle: PluginListenerHandle | null = null;
  if (onProgress) {
    handle = await CzechVoice.addListener("downloadProgress", onProgress);
  }
  try {
    await CzechVoice.downloadModels();
  } finally {
    await handle?.remove();
  }
}

export async function cancelCzechVoiceDownload(): Promise<void> {
  if (!hasCzechVoicePlugin()) return;
  await CzechVoice.cancelDownload();
}

export async function deleteCzechVoiceModels(): Promise<void> {
  if (!hasCzechVoicePlugin()) return;
  await CzechVoice.deleteModels();
}

export { CzechVoice };
