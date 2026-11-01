import { NextResponse, type NextRequest } from "next/server";
import { fail } from "@/lib/server/api";
import { getInfo, probeInfo } from "@/lib/server/stratus";
import { getConnection } from "@/lib/server/connections";
import { readObject, validate, type ConnectionInput } from "@/lib/server/validate";

/** Probes a server with GetStreamInfo. Pass `id` to probe a saved one, or the fields of an unsaved one. */
export async function POST(req: NextRequest) {
  const read = await readObject<ConnectionInput & { id: string }>(req);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: read.status });
  const input = read.value;
  try {
    if (typeof input.id === "string" && input.id) {
      const saved = await getConnection(input.id);
      if (!saved) return NextResponse.json({ error: "No such server" }, { status: 404 });
      return NextResponse.json(await getInfo(saved));
    }
    const problem = validate(input);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const info = await probeInfo({
      id: `probe:${input.address}`,
      name: "probe",
      address: input.address!.trim(),
      transport: input.transport!,
      caFile: input.caFile?.trim(),
      token: input.token?.trim() || undefined,
    });
    return NextResponse.json(info);
  } catch (e) {
    return fail(e);
  }
}
