import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./utils/queryClient";
import { LinkProvider } from "@usace/groundwork";
import {
  AuthProvider,
  createKeycloakAuthMethod,
} from "@usace-watermanagement/groundwork-water";
import createMockAuthMethod from "./features/auth/mockAuthMethod.ts";
import { Link, RouterProvider, createRouter } from "@tanstack/react-router";
import { AppErrorBoundary } from "./shared/components/AppErrorBoundary.tsx";
import ErrorToasts from "./components/ErrorToasts";
import ConnectivityStatus from "./shared/components/ConnectivityStatus";

// TanStack Router setup
import { routeTree } from "./routeTree.gen";
const router = createRouter({ routeTree, basepath: "/events" });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const buildMode = import.meta.env.MODE;
const authHost = import.meta.env.VITE_AUTH_HOST;
const authRealm = import.meta.env.VITE_AUTH_REALM;
const authUser = import.meta.env.VITE_AUTH_USER;
const authPassword = import.meta.env.VITE_AUTH_PASSWORD;

function createLocalAuthMethod() {
  let token: string | undefined;
  return {
    async login() {
      const response = await fetch(
        `${authHost}/realms/${authRealm}/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "password",
            client_id: "cwms",
            username: authUser,
            password: authPassword,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Local Keycloak login failed (${response.status})`);
      }
      token = (await response.json()).access_token;
    },
    async logout() {
      token = undefined;
    },
    async isAuth() {
      return !!token;
    },
    get token() {
      return token;
    },
  };
}

const authMethod = (() => {
  if (buildMode === "dev-cda-compose") {
    return createLocalAuthMethod();
  } else if (["dev", "test", "prod"].includes(buildMode)) {
    return createKeycloakAuthMethod({
      host: authHost,
      realm: authRealm,
      client: "cwms",
      flow: "authorization-code-pkce",
      redirectUri: window.location.href,
      providerHint: "federation-eams",
    });
  } else {
    return createMockAuthMethod();
  }
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider method={authMethod}>
          <LinkProvider component={Link} hrefMap="to">
            <RouterProvider router={router} />
            <ErrorToasts />
            <ConnectivityStatus showBanner={false} />
          </LinkProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
