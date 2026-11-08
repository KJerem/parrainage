"use client";

import { useEffect, useRef, useState } from "react";
import { cameraErrorMessage } from "@/components/messaging/video-recorder-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * « Tester micro et caméra » : un simple aperçu, avant d'entrer dans la salle. La caméra ne
 * s'allume qu'après l'appui et s'éteint avec « Arrêter le test » ou en quittant la page.
 */
export function CameraTest({ tone = "brand" }: { tone?: "brand" | "light" }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    for (const track of stream.current?.getTracks() ?? []) {
      track.stop();
    }
    stream.current = null;
    setOn(false);
  };

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
      setError("Ce navigateur ne donne pas accès à la caméra.");
      return;
    }
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
      }
      setOn(true);
    } catch (caught) {
      setError(cameraErrorMessage(caught));
    } finally {
      setStarting(false);
    }
  }

  const dark = tone === "brand";
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "relative flex h-[150px] items-center justify-center overflow-hidden rounded-12 text-13 font-semibold",
          dark ? "bg-brand-600 text-white" : "bg-canvas text-muted",
        )}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Aperçu de votre caméra"
          className={on ? "absolute inset-0 size-full -scale-x-100 object-cover" : "hidden"}
        />
        {on ? null : <span>Aperçu de votre caméra</span>}
      </div>
      {error ? (
        <p role="alert" className={cn("m-0 text-13", dark ? "text-white" : "text-danger-600")}>
          {error}
        </p>
      ) : null}
      <Button
        variant={dark ? "outline-on-dark" : "secondary"}
        loading={starting}
        onClick={() => (on ? stop() : void start())}
      >
        {on ? "Arrêter le test" : "Tester micro et caméra"}
      </Button>
    </div>
  );
}
