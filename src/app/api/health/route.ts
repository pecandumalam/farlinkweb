import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "FarlinkOne",
    version: "1.1.0",
    time: new Date().toISOString(),
  });
}
