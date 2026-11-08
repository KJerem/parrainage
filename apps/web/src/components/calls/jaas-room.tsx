"use client";

import { JaaSMeeting } from "@jitsi/react-sdk";
import { Spinner } from "@/components/ui/spinner";

export type JaasRoomProps = {
  appId: string;
  roomName: string;
  jwt: string;
  displayName: string;
  onReady: () => void;
  onJoined: () => void;
  onLeft: () => void;
};

/**
 * Salle 8x8.vc intégrée : micro, caméra, mosaïque et raccrocher, rien d'autre. Le jeton coupe
 * déjà l'enregistrement, la diffusion et les appels sortants ; ici, ni conversation écrite, ni
 * invitation, ni partage d'écran.
 */
export default function JaasRoom({
  appId,
  roomName,
  jwt,
  displayName,
  onReady,
  onJoined,
  onLeft,
}: JaasRoomProps) {
  return (
    <JaaSMeeting
      appId={appId}
      roomName={roomName}
      jwt={jwt}
      userInfo={{ displayName, email: "" }}
      configOverwrite={{
        toolbarButtons: ["microphone", "camera", "tileview", "hangup"],
        prejoinConfig: { enabled: false },
        disableInviteFunctions: true,
        disableDeepLinking: true,
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        fileRecordingsEnabled: false,
        liveStreamingEnabled: false,
        hideConferenceSubject: true,
      }}
      interfaceConfigOverwrite={{ MOBILE_APP_PROMO: false, SHOW_CHROME_EXTENSION_BANNER: false }}
      spinner={() => <Spinner />}
      getIFrameRef={(node) => {
        node.style.height = "100%";
        node.style.minHeight = "480px";
      }}
      onApiReady={(api) => {
        onReady();
        api.addListener("videoConferenceJoined", onJoined);
        api.addListener("videoConferenceLeft", onLeft);
      }}
      onReadyToClose={onLeft}
    />
  );
}
