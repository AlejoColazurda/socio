import { demoConnector } from "./demo";
import { mk247Connector } from "./mk247";
import { loadRestCapabilities, restConnector } from "./rest";
import type { Connector } from "./types";

let restLoaded = false;

export async function getConnector(): Promise<Connector> {
  switch (process.env.SOCIO_CONNECTOR ?? "demo") {
    case "mk247":
      return mk247Connector;
    case "rest":
      if (!restLoaded) {
        await loadRestCapabilities();
        restLoaded = true;
      }
      return restConnector;
    default:
      return demoConnector;
  }
}

export type { Connector };
