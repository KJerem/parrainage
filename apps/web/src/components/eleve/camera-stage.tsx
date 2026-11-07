"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingType } from "@/components/messaging/video-recorder-dialog";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";

const VIDEO_BITS_PER_SECOND = 1_000_000;

const CAMERA_REFUSED =
  "La caméra ne s'allume pas. Demande à ton relais, ou choisis un fichier à la place.";

export type CameraStageProps = {
  mode: "photo" | "video" | "bulletin";
  /** Durée maximale d'une vidéo, en secondes. */
  maxSeconds: number;
  /** Plus de place (4 pages, une seule vidéo) : on ne propose plus de capture. */
  full: boolean;
  accept: string;
  onCapture: (file: File) => void;
};

/**
 * Scène de capture (E-Bulletin). La caméra ne s'allume qu'après un appui sur « Allumer la caméra »
 * et s'éteint en quittant l'écran. « Choisir un fichier » marche sans elle.
 */
export function CameraStage({ mode, maxSeconds, full, accept, onCapture }: CameraStageProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [on, setOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    recorder.current = null;
    for (const track of stream.current?.getTracks() ?? []) {
      track.stop();
    }
    stream.current = null;
    if (video.current) {
      video.current.srcObject = null;
    }
    setOn(false);
    setElapsed(null);
  }, []);

  useEffect(
    () => () => {
      for (const track of stream.current?.getTracks() ?? []) {
        track.stop();
      }
    },
    [],
  );

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(CAMERA_REFUSED);
      return;
    }
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === "video",
      });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
      }
      setOn(true);
    } catch {
      setError(CAMERA_REFUSED);
    } finally {
      setStarting(false);
    }
  }

  function takePhoto() {
    const source = video.current;
    if (!source || source.videoWidth === 0) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
        }
      },
      "image/jpeg",
      0.9,
    );
  }

  function startRecording() {
    const type = pickRecordingType();
    if (!stream.current || !type) {
      setError(CAMERA_REFUSED);
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream.current, {
      mimeType: type,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
    media.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    media.onstop = () => {
      const base = (type.split(";")[0] ?? "video/webm").trim();
      const extension = base === "video/mp4" ? "mp4" : "webm";
      onCapture(new File(chunks, `video-${Date.now()}.${extension}`, { type: base }));
      stop();
    };
    recorder.current = media;
    media.start();
    setElapsed(0);
  }

  // Compteur de la vidéo, arrêtée d'elle-même à la durée maximale.
  const recording = elapsed !== null;
  useEffect(() => {
    if (!recording) {
      return;
    }
    const tick = setInterval(() => {
      setElapsed((seconds) => (seconds === null ? null : seconds + 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [recording]);
  useEffect(() => {
    if (elapsed !== null && elapsed >= maxSeconds && recorder.current?.state === "recording") {
      recorder.current.stop();
    }
  }, [elapsed, maxSeconds]);

  const frame = mode === "bulletin";
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-24 bg-ink max-sm:h-[320px]">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Image de la caméra"
          className={on ? "absolute inset-0 size-full object-cover" : "hidden"}
        />
        {on ? (
          <span className="absolute top-3.5 left-3.5 rounded-10 bg-danger-600 px-3 py-1.5 text-14 font-bold text-white">
            {recording && elapsed !== null
              ? `Vidéo : ${formatDuration(elapsed)} sur ${formatDuration(maxSeconds)}`
              : "Caméra allumée"}
          </span>
        ) : null}
        {frame ? (
          <div className="relative flex h-[85%] max-h-[360px] w-[75%] max-w-[300px] items-center justify-center rounded-16 border-4 border-dashed border-accent-500 px-4 text-center text-20 font-bold text-white">
            <span className={on ? "rounded-10 bg-ink/60 px-2 py-1" : undefined}>
              Pose ton bulletin
              <br />
              dans le cadre jaune
            </span>
          </div>
        ) : !on ? (
          <p className="relative m-0 px-6 text-center text-20 font-bold text-white">
            {mode === "video" ? "Fais-toi filmer pour dire bonjour" : "Prends une belle photo"}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="m-0 text-16 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!on ? (
          <Button
            variant="kid-accent"
            size="kid-xl"
            className="rounded-32 max-sm:w-full"
            disabled={full}
            loading={starting}
            onClick={() => void start()}
          >
            Allumer la caméra
          </Button>
        ) : mode === "video" ? (
          recording ? (
            <Button
              variant="kid-accent"
              size="kid-xl"
              className="rounded-32 max-sm:w-full"
              onClick={() => recorder.current?.stop()}
            >
              Arrêter la vidéo
            </Button>
          ) : (
            <Button
              variant="kid-accent"
              size="kid-xl"
              className="rounded-32 max-sm:w-full"
              disabled={full}
              onClick={startRecording}
            >
              Commencer la vidéo
            </Button>
          )
        ) : (
          <Button
            variant="kid-accent"
            size="kid-xl"
            className="rounded-32 max-sm:w-full"
            disabled={full}
            onClick={takePhoto}
          >
            Prendre la photo
          </Button>
        )}
        <Button
          variant="kid-outline"
          size="kid-xl"
          className="rounded-32 border-3 border-kid-line max-sm:w-full"
          disabled={full || recording}
          onClick={() => file.current?.click()}
        >
          Choisir un fichier
        </Button>
        {on && !recording ? (
          <Button
            variant="kid-outline"
            size="kid-xl"
            className="rounded-32 border-3 border-kid-line max-sm:w-full"
            onClick={stop}
          >
            Éteindre la caméra
          </Button>
        ) : null}
        <input
          ref={file}
          type="file"
          accept={accept}
          hidden
          data-testid="eleve-file"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen) {
              onCapture(chosen);
            }
          }}
        />
      </div>
    </div>
  );
}
