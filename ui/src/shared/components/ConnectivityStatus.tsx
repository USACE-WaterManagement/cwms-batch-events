import { useConnectivityStatus } from "./useConnectivityStatus";

export function ConnectivityBanner() {
  return (
    <div className="connectivity-banner" role="status" aria-live="polite">
      <span className="connectivity-dot" aria-hidden="true" />
      Offline mode. You can continue browsing available pages. Live data will
      return when the connection is restored.
    </div>
  );
}

export default function ConnectivityStatus({ showBanner = true }: { showBanner?: boolean }) {
  const { isOnline } = useConnectivityStatus();

  return (
    <>
      {showBanner && !isOnline && <ConnectivityBanner />}
    </>
  );
}
