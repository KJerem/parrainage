"use client";

import { DEFAULT_VIDEO_MAX_SECONDS } from "@parrainage/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { VideoIcon } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format";
import { baseMimeType, maxBytesFor } from "@/lib/upload";

// Message vidéo (plan §8, médias côté client) : MediaRecorder en 720p à environ 1 Mb/s,
// 2 minutes au plus, sans ré-encodage. La caméra ne s'allume qu'après un appui.

const VIDEO_BITS_PER_SECOND = 1_000_000;

/** mp4 quand le navigateur sait l'enregistrer (Safari, Chrome récents), sinon webm. */
const RECORDING_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export function pickRecordingType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "L'accès à la caméra a été refusé. Autorisez-le dans les réglages du navigateur, puis réessayez.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Aucune caméra n'a été trouvée sur cet appareil.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.";
  }
  return "La caméra n'a pas pu être allumée. Réessayez, ou envoyez plutôt une photo.";
}

type Step = "intro" | "starting" | "ready" | "recording" | "review";

export type RecordedVideo = { file: File; durationSec: number };

export type VideoRecorderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vidéo validée : jointe au message puis envoyée. */
  onSend: (video: RecordedVideo) => void;
  /** Prénom du destinataire (« pour Aïcha »). */
  recipient: string;
  /** Conversation avec un enfant : la vidéo est relue avant d'être remise. */
  reviewed?: boolean;
  maxSeconds?: number;
};

/** Dialogue d'enregistrement : aperçu, enregistrement, relecture, recommencer, envoyer. */
export function VideoRecorderDialog({
  open,
  onOpenChange,
  onSend,
  recipient,
  reviewed = false,
  maxSeconds = DEFAULT_VIDEO_MAX_SECONDS,
}: VideoRecorderDialogProps) {
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<(RecordedVideo & { url: string }) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const startedAtRef = useRef(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const discardRecording = useCallback(() => {
    setRecorded((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
  }, []);

  // Fermeture : caméra éteinte, enregistrement abandonné, tout est remis à zéro.
  const close = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    stopCamera();
    discardRecording();
    setStep("intro");
    setError(null);
    setElapsed(0);
    onOpenChange(false);
  }, [discardRecording, onOpenChange, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Le flux de la caméra s'affiche dès que la vidéo d'aperçu est montée.
  useEffect(() => {
    const video = liveRef.current;
    if (video && streamRef.current && (step === "ready" || step === "recording")) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, [step]);

  // Minuteur, et arrêt automatique à la durée maximale.
  useEffect(() => {
    if (step !== "recording") return;
    const timer = window.setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(Math.min(maxSeconds, Math.floor(seconds)));
      if (seconds >= maxSeconds) recorderRef.current?.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [step, maxSeconds]);

  async function startCamera() {
    setError(null);
    if (!pickRecordingType() || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "Ce navigateur ne permet pas d'enregistrer une vidéo. Envoyez plutôt une photo, ou utilisez un autre navigateur.",
      );
      return;
    }
    setStep("starting");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      });
      setStep("ready");
    } catch (cause) {
      setError(cameraErrorMessage(cause));
      setStep("intro");
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    const type = pickRecordingType();
    if (!stream || !type) return;
    setError(null);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      recorderRef.current = null;
      const durationSec = Math.max(
        1,
        Math.min(maxSeconds, Math.round((Date.now() - startedAtRef.current) / 1000)),
      );
      // Le type déclaré à l'API doit être celui du contenu, sans les codecs.
      const mimeType = baseMimeType(recorder.mimeType || type);
      const blob = new Blob(chunks, { type: mimeType });
      stopCamera();
      if (blob.size > maxBytesFor("VIDEO")) {
        setError("Cette vidéo dépasse 25 Mo : enregistrez un message plus court.");
        setStep("intro");
        return;
      }
      const extension = mimeType === "video/mp4" ? "mp4" : "webm";
      const file = new File([blob], `message-video.${extension}`, { type: mimeType });
      setRecorded({ file, durationSec, url: URL.createObjectURL(blob) });
      setStep("review");
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start(1000);
    setStep("recording");
  }

  function retake() {
    discardRecording();
    void startCamera();
  }

  function send() {
    if (!recorded) return;
    const { file, durationSec, url } = recorded;
    URL.revokeObjectURL(url);
    setRecorded(null);
    onSend({ file, durationSec });
    close();
  }

  const limit = formatDuration(maxSeconds);
  const limitText =
    maxSeconds % 60 === 0
      ? `${maxSeconds / 60} minute${maxSeconds >= 120 ? "s" : ""}`
      : `${maxSeconds} secondes`;
  const footer =
    step === "review" ? (
      <>
        <Button variant="secondary" onClick={retake}>
          Recommencer
        </Button>
        <Button onClick={send}>Envoyer la vidéo</Button>
      </>
    ) : step === "recording" ? (
      <Button variant="accent" onClick={() => recorderRef.current?.stop()}>
        Arrêter l&apos;enregistrement
      </Button>
    ) : step === "ready" ? (
      <>
        <Button variant="secondary" onClick={close}>
          Annuler
        </Button>
        <Button onClick={startRecording}>Commencer l&apos;enregistrement</Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={close}>
          Annuler
        </Button>
        <Button
          onClick={startCamera}
          loading={step === "starting"}
          leftIcon={<VideoIcon size={18} />}
        >
          Allumer la caméra
        </Button>
      </>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Message vidéo"
      description={`Enregistrez un message de ${limitText} au plus pour ${recipient}.${
        reviewed
          ? " Comme vos autres messages, il sera relu par l'association avant d'être remis."
          : ""
      }`}
      footer={footer}
      size="lg"
    >
      {error ? (
        <p
          role="alert"
          className="m-0 rounded-12 bg-danger-100 px-3.5 py-3 text-14 font-semibold text-danger-600"
        >
          {error}
        </p>
      ) : null}
      {step === "ready" || step === "recording" ? (
        <div className="relative overflow-hidden rounded-12 bg-ink">
          <video
            ref={liveRef}
            muted
            playsInline
            aria-label="Aperçu de la caméra"
            className="aspect-video w-full -scale-x-100 object-cover"
          />
          {step === "recording" ? (
            <p className="absolute top-3 left-3 m-0 inline-flex items-center gap-2 rounded-20 bg-ink/80 px-3 py-1 text-13 font-bold text-white">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-danger-600" />
              Enregistrement · {formatDuration(elapsed)} / {limit}
            </p>
          ) : null}
        </div>
      ) : null}
      {step === "review" && recorded ? (
        <video
          src={recorded.url}
          controls
          playsInline
          aria-label="Relecture de votre message vidéo"
          className="aspect-video w-full rounded-12 bg-ink object-contain"
        />
      ) : null}
      {step === "intro" || step === "starting" ? (
        <p className="m-0 text-14 leading-[1.5] text-ink-soft">
          La caméra et le micro ne s&apos;allument qu&apos;après votre appui sur « Allumer la caméra
          ». Vous pourrez revoir la vidéo et la recommencer avant de l&apos;envoyer.
        </p>
      ) : null}
    </Dialog>
  );
}
