import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./utils/queryClient";
import ErrorToasts from "./components/ErrorToasts";
import { LinkProvider } from "@usace/groundwork";
import {
  AuthProvider,
  createKeycloakAuthMethod,
} from "@usace-watermanagement/groundwork-water";
import createMockAuthMethod from "./features/auth/mockAuthMethod.ts";
import { Link, RouterProvider, createRouter } from "@tanstack/react-router";

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

const authMethod = (() => {
  if (buildMode === "dev-cda-compose") {
    return createKeycloakAuthMethod({
      host: authHost,
      realm: authRealm,
      client: "cwms",
      flow: "direct-grant",
      username: authUser,
      password: authPassword,
    });
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider method={authMethod}>
        <LinkProvider component={Link} hrefMap="to">
          <RouterProvider router={router} />
          <ErrorToasts />
        </LinkProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
