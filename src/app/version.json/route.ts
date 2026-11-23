// Static /version.json, written at build time. Open apps fetch it to see whether a newer release is live.
export const dynamic = 'force-static';

export function GET() {
  return Response.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    build: process.env.NEXT_PUBLIC_BUILD_ID,
    time: process.env.NEXT_PUBLIC_BUILD_TIME,
    commit: process.env.NEXT_PUBLIC_COMMIT,
  });
}
