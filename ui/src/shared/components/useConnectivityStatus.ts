import { useEffect, useRef, useState } from "react";
import { notifySuccess } from "../../utils/actionNotifications";
import { clearErrorToasts } from "../../utils/errorNotifications";

const getOnlineState = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

export function useConnectivityStatus() {
  const [isOnline, setIsOnline] = useState(getOnlineState);
  const wasOnline = useRef(isOnline);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (!wasOnline.current) {
        clearErrorToasts();
        notifySuccess("Connection restored. Live data is available again.");
      }
      wasOnline.current = true;
    };
    const handleOffline = () => {
      setIsOnline(false);
      wasOnline.current = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
