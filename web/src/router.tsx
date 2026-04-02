import { createRouter } from "@tanstack/react-router";

import { jobsRoute } from "@/routes/index";
import { rootRoute } from "@/routes/__root";
import { settingsRoute } from "@/routes/settings";
import { terminalRoute } from "@/routes/terminal";
import { timelineRoute } from "@/routes/timeline.$jobId";

const routeTree = rootRoute.addChildren([jobsRoute, settingsRoute, terminalRoute, timelineRoute]);

export const router = createRouter({
  routeTree
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
