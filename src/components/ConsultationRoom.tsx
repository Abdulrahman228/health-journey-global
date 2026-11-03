// LiveKit video room — client-only (lazy-loaded from the consultation route so
// the LiveKit SDK never runs during SSR on the Cloudflare Worker).
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

export default function ConsultationRoom({
  wsUrl,
  token,
  onLeave,
}: {
  wsUrl: string;
  token: string;
  onLeave: () => void;
}) {
  return (
    <div data-lk-theme="default" style={{ height: "calc(100vh - 57px)" }}>
      <LiveKitRoom
        serverUrl={wsUrl}
        token={token}
        connect
        video
        audio
        style={{ height: "100%" }}
        onDisconnected={onLeave}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
