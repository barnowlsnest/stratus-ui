import { BASE_URL, STRATUS_ADDRESS } from "./env";

/** Runs before any test: the tests write and delete, so nothing but the throwaway server may be loaded. */
export default async function globalSetup() {
  const res = await fetch(`${BASE_URL}/api/connections`);
  const { connections } = (await res.json()) as { connections: { address: string }[] };
  const others = connections.map((c) => c.address).filter((a) => a !== STRATUS_ADDRESS);
  if (others.length > 0) throw new Error(`The e2e server loaded other servers: ${others.join(", ")}`);
}
