import { NextResponse } from "next/server";

export async function GET() {
  console.log(process.env.NEON_AUTH_BASE_URL);
  console.log(process.env.NEON_AUTH_COOKIE_SECRET);
  console.log(process.env.DATABASE_URL);
  return NextResponse.json({
    status: "ok",
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
}
