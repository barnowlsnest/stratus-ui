import { NextResponse, type NextRequest } from "next/server";
import { connectionFor, fail } from "@/lib/server/api";
import { getInfo } from "@/lib/server/stratus";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await getInfo(await connectionFor(req)));
  } catch (e) {
    return fail(e);
  }
}
